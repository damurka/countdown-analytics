/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The Countdown AI's own R sessions: one per dataset tab, created through DataSuite's R session API
// (datasuite.r.createSession / execute / stopSession), each holding a read-only copy of the tab's dataset as
// `.cache`. The app saves every change to its .rds at once and the bridge state carries the cache's revision, so a
// session reloads when the revision moves: the AI computes on exactly what the app has, without waiting on the app.

import * as vscode from 'vscode';

/** What datasuite.r.execute returns. */
interface IExecuteResult {
	readonly success: boolean;
	readonly text: string;
	readonly error?: string;
	readonly images: ReadonlyArray<{ readonly mimeType: string; readonly data: string }>;
}

/** A reply from the R helpers: `{ ok, result }` or `{ ok: false, error }`. */
export interface IRReply<T = unknown> {
	readonly ok: boolean;
	readonly result?: T;
	readonly error?: string;
	/** Printed output that isn't the reply (warnings, messages, cat() from user code). */
	readonly output?: string;
	/** Warnings R raised while answering (e.g. a column the dataset lacks). */
	readonly warnings?: readonly string[];
}

const START = '<<CDAI>>';
const END = '<<CDAI_END>>';

/**
 * Helper functions defined in every session (in `.cdai`). Everything the tools ask of R goes through them, so each
 * call answers with one JSON reply between markers, whatever else R prints.
 */
const R_PRELUDE = `
if (!exists(".cdai", envir = globalenv())) assign(".cdai", new.env(), envir = globalenv())
local({
	suppressWarnings(suppressPackageStartupMessages({ library(cd2030.core); library(jsonlite); library(dplyr); library(tidyr) }))
	e <- get(".cdai", envir = globalenv())
	e$emit <- function(x) {
		cat("\\n${START}", jsonlite::toJSON(x, auto_unbox = TRUE, dataframe = "rows", na = "null", null = "null",
			digits = NA, force = TRUE), "${END}\\n", sep = "")
		invisible(NULL)
	}
	e$arg <- function(b64, simplify = TRUE) {
		if (!nzchar(b64)) return(list())
		jsonlite::fromJSON(rawToChar(jsonlite::base64_dec(b64)), simplifyVector = simplify)
	}
	e$table <- function(x, max_rows = 200) {
		if (inherits(x, "sf")) x <- sf::st_drop_geometry(x)
		x <- as.data.frame(x, stringsAsFactors = FALSE)
		n <- nrow(x)
		list(columns = I(names(x)), rows = utils::head(x, max_rows), totalRows = n, truncated = n > max_rows)
	}
	e$shape <- function(x, max_rows = 200) {
		if (is.data.frame(x)) return(c(list(type = "table"), e$table(x, max_rows)))
		if (is.null(x)) return(list(type = "null"))
		if (is.atomic(x)) return(list(type = "value", value = utils::head(x, max_rows), length = length(x)))
		if (is.list(x) && length(x) && all(vapply(x, is.data.frame, NA))) {
			return(list(type = "tables", tables = lapply(x, e$table, max_rows = max_rows)))
		}
		list(type = "text", text = paste(utils::capture.output(utils::str(x, max.level = 2, list.len = 40)), collapse = "\\n"))
	}
	e$run <- function(expr) {
		# warnings and messages go into the reply (not the console), so nothing interleaves with it
		warnings <- character()
		value <- tryCatch(
			withCallingHandlers(force(expr),
				warning = function(w) { warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning") },
				message = function(m) invokeRestart("muffleMessage")),
			error = function(err) structure(list(conditionMessage(err)), class = "cdai_error"))
		warnings <- I(unique(warnings))
		if (inherits(value, "cdai_error")) e$emit(list(ok = FALSE, error = value[[1]], warnings = warnings))
		else e$emit(list(ok = TRUE, result = value, warnings = warnings))
	}
	e$load <- function(path) {
		assign(".cache", cd2030.core::init_CacheConnection(rds_path = path, read_only = TRUE), envir = globalenv())
		cache <- get(".cache", envir = globalenv())
		list(path = path, country = cache$country, group = cd2030.core::get_selected_group(), revision = cache$revision)
	}
	e$member <- function(member, args = list(), max_rows = 200) {
		cache <- get(".cache", envir = globalenv())
		generator <- get("CacheConnection", envir = asNamespace("cd2030.core"))
		value <- if (member %in% names(generator$active)) cache[[member]] else do.call(cache[[member]], args)
		e$shape(value, max_rows)
	}
})
`;

/** Makes a value safe to hand to R inside a string literal: base64 of its JSON. */
export function toR(value: unknown): string {
	return Buffer.from(JSON.stringify(value ?? null), 'utf8').toString('base64');
}

/** An R string literal. */
export function rString(value: string): string {
	return `"${value.replace(/\\/g, '/').replace(/"/g, '\\"')}"`;
}

interface ISession {
	readonly id: string;
	path?: string;
	revision?: number;
	prelude: boolean;
}

export class CountdownR implements vscode.Disposable {

	private readonly _sessions = new Map<string, ISession>();
	private readonly _pending = new Map<string, Promise<ISession>>();

	/** Runs R in the session for `key` (a tab id), creating it and loading `path` when needed. */
	async call<T>(key: string, label: string, dataset: { path: string; revision?: number } | undefined, code: string, timeoutMs = 300000): Promise<IRReply<T>> {
		const session = await this._session(key, label);
		if (!session.prelude) {
			const prelude = await this._execute(session.id, R_PRELUDE, 120000);
			if (!prelude.success) {
				return { ok: false, error: `Could not start the Countdown AI R session: ${prelude.error ?? prelude.text}. Is cd2030.core installed?` };
			}
			session.prelude = true;
		}
		if (dataset && (session.path !== dataset.path || (dataset.revision !== undefined && session.revision !== dataset.revision))) {
			const loaded = await this.run<{ revision?: number }>(session.id, `.cdai$run(.cdai$load(${rString(dataset.path)}))`, 600000);
			if (!loaded.ok) {
				return { ok: false, error: `Could not open the dataset ${dataset.path}: ${loaded.error}` };
			}
			session.path = dataset.path;
			session.revision = dataset.revision ?? loaded.result?.revision;
		}
		return this.run<T>(session.id, code, timeoutMs);
	}

	/** Runs code that ends in `.cdai$run(...)` and parses its reply. */
	async run<T>(sessionId: string, code: string, timeoutMs: number): Promise<IRReply<T>> {
		const executed = await this._execute(sessionId, code, timeoutMs);
		const text = executed.text ?? '';
		const start = text.lastIndexOf(START);
		const end = text.lastIndexOf(END);
		const output = (start >= 0 ? text.slice(0, start) : text).trim();
		if (start < 0 || end < start) {
			return { ok: false, error: executed.error ?? (output || 'R gave no answer.'), output };
		}
		try {
			const reply = JSON.parse(text.slice(start + START.length, end)) as IRReply<T>;
			return { ...reply, output: output || undefined };
		} catch (error) {
			return { ok: false, error: `Could not read R's answer: ${error instanceof Error ? error.message : String(error)}`, output };
		}
	}

	/** Raw execution in the session for `key` (for free R); the session and dataset are prepared as in call(). */
	async executeRaw(key: string, label: string, dataset: { path: string; revision?: number } | undefined, code: string, timeoutMs = 300000): Promise<IExecuteResult | IRReply> {
		const ready = await this.call(key, label, dataset, '.cdai$run(TRUE)', 600000);
		if (!ready.ok) {
			return ready;
		}
		return this._execute(this._sessions.get(key)!.id, code, timeoutMs);
	}

	/** Stops the sessions whose tab is gone. */
	async prune(liveKeys: ReadonlySet<string>): Promise<void> {
		for (const [key, session] of [...this._sessions]) {
			if (!liveKeys.has(key)) {
				this._sessions.delete(key);
				await vscode.commands.executeCommand('datasuite.r.stopSession', session.id).then(undefined, () => undefined);
			}
		}
	}

	dispose(): void {
		for (const session of this._sessions.values()) {
			vscode.commands.executeCommand('datasuite.r.stopSession', session.id).then(undefined, () => undefined);
		}
		this._sessions.clear();
	}

	private async _session(key: string, label: string): Promise<ISession> {
		const existing = this._sessions.get(key);
		if (existing) {
			return existing;
		}
		let pending = this._pending.get(key);
		if (!pending) {
			pending = (async () => {
				const created = await vscode.commands.executeCommand<{ sessionId: string } | { error: string }>('datasuite.r.createSession', label);
				if (!created || 'error' in created) {
					throw new Error(`Could not start an R session: ${created && 'error' in created ? created.error : 'DataSuite did not answer'}`);
				}
				const session: ISession = { id: created.sessionId, prelude: false };
				this._sessions.set(key, session);
				return session;
			})().finally(() => this._pending.delete(key));
			this._pending.set(key, pending);
		}
		return pending;
	}

	private async _execute(sessionId: string, code: string, timeoutMs: number): Promise<IExecuteResult> {
		const result = await vscode.commands.executeCommand<IExecuteResult>('datasuite.r.execute', sessionId, code, timeoutMs);
		return result ?? { success: false, text: '', error: 'DataSuite did not answer (is this DataSuite, with R installed?)', images: [] };
	}
}
