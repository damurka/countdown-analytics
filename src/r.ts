/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The Countdown AI's own R sessions: one per dataset tab, created through DataSuite's R session API
// (datasuite.r.createSession / execute / stopSession), each holding a read-only copy of the tab's dataset as
// `.cache`. The app saves every change to its .rds at once and the bridge state carries the cache's revision, so a
// session reloads when the revision moves: the AI computes on exactly what the app has, without waiting on the app.

import * as vscode from 'vscode';

/**
 * What datasuite.r.execute returns. `text` is stdout, `[stderr]` blocks (warnings, messages) and the error with its
 * message and backtrace; `error` the error alone. Older DataSuite builds send neither labels nor the backtrace.
 */
export interface IExecuteResult {
	readonly success: boolean;
	readonly text: string;
	readonly error?: string;
	readonly images: ReadonlyArray<{ readonly mimeType: string; readonly data: string }>;
	/** The run hit its timeout and was interrupted; objects created before remain. */
	readonly timedOut?: boolean;
	/** The run was interrupted (the chat's Stop). */
	readonly interrupted?: boolean;
	/** The session's R process died during the run (the reason): the session is gone. */
	readonly sessionEnded?: string;
	/** Set by CountdownR: this call ran in a new session because the tab's previous one had ended. */
	readonly restartNotice?: string;
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
	# compact printing for countdown_run_r (its output is cut at ~20,000 characters), warnings as they happen, no colour codes
	options(width = 120, max.print = 2000, tibble.print_max = 20, tibble.print_min = 10, warn = 1, cli.num_colors = 1, crayon.enabled = FALSE)
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
	# What each column means, from cd2030.core's data dictionary (cd_describe_columns(); NULL with an older core or
	# when no column is known): names like anc1derived mislead, so the AI reads meanings, never spellings.
	e$meanings <- function(cols) {
		describe <- tryCatch(getExportedValue("cd2030.core", "cd_describe_columns"), error = function(err) NULL)
		if (is.null(describe) || !length(cols)) return(NULL)
		d <- describe(as.character(cols))
		d <- d[!is.na(d$description), , drop = FALSE]
		if (!nrow(d)) return(NULL)
		as.list(stats::setNames(d$description, d$column))
	}
	e$table <- function(x, max_rows = 200) {
		if (inherits(x, "sf")) x <- sf::st_drop_geometry(x)
		x <- as.data.frame(x, stringsAsFactors = FALSE)
		n <- nrow(x)
		list(columns = I(names(x)), columnMeanings = e$meanings(names(x)), rows = utils::head(x, max_rows), totalRows = n,
			truncated = n > max_rows)
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
	# Only the rows and columns asked for: 'where' = list(column = value(s)), 'select' = column names or * patterns
	# (the identifying columns -- country, levels, year, month -- are always kept).
	e$narrow <- function(x, select = NULL, where = NULL) {
		if (is.list(x) && !is.data.frame(x) && length(x) && all(vapply(x, is.data.frame, NA))) {
			return(lapply(x, e$narrow, select = select, where = where))
		}
		if (!is.data.frame(x)) return(x)
		if (inherits(x, "sf")) x <- sf::st_drop_geometry(x)
		for (col in names(where)) {
			if (!col %in% names(x)) stop(sprintf("There is no column %s to filter on. The columns are: %s.", col, paste(names(x), collapse = ", ")), call. = FALSE)
			x <- x[as.character(x[[col]]) %in% as.character(unlist(where[[col]])), , drop = FALSE]
		}
		patterns <- unlist(select)
		if (length(patterns)) {
			ids <- intersect(c("country", "iso3", "adminlevel_1", "district", "year", "month", "indicator", "estimate", "denominator"), names(x))
			keep <- unique(unlist(lapply(patterns, function(p) grep(utils::glob2rx(p), names(x), value = TRUE))))
			if (!length(keep)) stop(sprintf("No column matches %s. The columns are: %s.", paste(patterns, collapse = ", "), paste(names(x), collapse = ", ")), call. = FALSE)
			x <- x[, unique(c(ids, keep)), drop = FALSE]
		}
		x
	}
	# A document's text as citable units -- PDF pages, PPTX slides, DOCX sections (by heading), sheets, text chunks --
	# each list(marker = "p. 3" / "slide 2" / "section: Methods" / "sheet Data" / "lines 1-200", text). For the
	# countdown_documents tool: documents give context; the dataset's numbers still come from .cache.
	e$doc_units <- function(path) {
		if (!file.exists(path)) stop(sprintf("The document %s does not exist.", path), call. = FALSE)
		ext <- tolower(tools::file_ext(path))
		need <- function(pkg) if (!requireNamespace(pkg, quietly = TRUE)) stop(sprintf("Reading .%s files needs the R package %s: install.packages(\\"%s\\").", ext, pkg, pkg), call. = FALSE)
		unit <- function(marker, text) list(marker = marker, text = paste(text, collapse = "\\n"))
		chunks <- function(lines, size, label = "lines") {
			if (!length(lines)) return(list())
			starts <- seq(1, length(lines), by = size)
			lapply(starts, function(s) { end <- min(length(lines), s + size - 1); unit(sprintf("%s %d-%d", label, s, end), lines[s:end]) })
		}
		units <- switch(ext,
			pdf = {
				need("pdftools")
				pages <- pdftools::pdf_text(path)
				lapply(seq_along(pages), function(i) unit(paste0("p. ", i), pages[[i]]))
			},
			docx = {
				need("officer")
				d <- officer::docx_summary(officer::read_docx(path))
				d <- d[!is.na(d$text) & nzchar(trimws(d$text)), , drop = FALSE]
				if (!nrow(d)) return(list())
				style <- if ("style_name" %in% names(d)) ifelse(is.na(d$style_name), "", d$style_name) else rep("", nrow(d))
				heading <- grepl("^(heading|title)", tolower(style)) & d$content_type == "paragraph"
				if (!any(heading)) {
					chunks(d$text, 40, "paragraphs")
				} else {
					group <- cumsum(heading)
					lapply(split(seq_len(nrow(d)), group), function(rows) {
						first <- rows[[1]]
						marker <- if (heading[[first]]) paste0("section: ", substr(d$text[[first]], 1, 80)) else "section: (before the first heading)"
						unit(marker, d$text[rows])
					})
				}
			},
			pptx = {
				need("officer")
				d <- officer::pptx_summary(officer::read_pptx(path))
				d <- d[!is.na(d$text) & nzchar(trimws(d$text)), , drop = FALSE]
				ids <- sort(unique(d$slide_id))
				lapply(ids, function(i) unit(paste0("slide ", i), d$text[d$slide_id == i]))
			},
			xlsx = , xls = , xlsm = {
				need("readxl")
				sheets <- readxl::excel_sheets(path)
				lapply(sheets, function(sh) {
					x <- as.data.frame(readxl::read_excel(path, sheet = sh, n_max = 2000, .name_repair = "minimal"))
					unit(paste0("sheet ", sh), utils::capture.output(utils::write.csv(x, row.names = FALSE, na = "")))
				})
			},
			csv = , tsv = chunks(readLines(path, warn = FALSE, encoding = "UTF-8"), 500, "rows"),
			txt = , md = , markdown = , json = , html = , htm = , rmd = , r = {
				lines <- readLines(path, warn = FALSE, encoding = "UTF-8")
				chunks(lines, 200)
			},
			stop(sprintf("Can't read .%s documents: PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), CSV and text files are supported.", ext), call. = FALSE)
		)
		list(type = ext, units = unname(units))
	}
	# Scanned PDF pages (no text layer) as PNGs, for countdown_documents to embed and to show the AI: grayscale when the
	# png package is there, re-rendered at 72 dpi when over 1.5 MB (the embedding service takes a data URL under 5 MB).
	e$doc_render_pages <- function(path, pages, files, dpi = 110) {
		if (!requireNamespace("pdftools", quietly = TRUE)) stop("Rendering PDF pages needs the R package pdftools.", call. = FALSE)
		gray <- requireNamespace("png", quietly = TRUE)
		render <- function(page, file, dpi) {
			if (gray) {
				b <- pdftools::pdf_render_page(path, page = page, dpi = dpi, numeric = TRUE)
				g <- if (length(dim(b)) == 3 && dim(b)[[3]] >= 3) 0.299 * b[, , 1] + 0.587 * b[, , 2] + 0.114 * b[, , 3] else b
				png::writePNG(g, file)
			} else {
				pdftools::pdf_convert(path, format = "png", pages = page, dpi = dpi, filenames = file, verbose = FALSE)
			}
			file.size(file)
		}
		vapply(seq_along(pages), function(i) {
			size <- tryCatch(render(pages[[i]], files[[i]], dpi), error = function(err) NA_real_)
			if (!is.na(size) && size > 1.5e6) size <- tryCatch(render(pages[[i]], files[[i]], 72), error = function(err) NA_real_)
			size
		}, numeric(1))
	}
	# The dataset's key selections, compactly, for countdown_context: enough to answer "what is the denominator",
	# "which survey", "which years" without further calls. Each field on its own, so an older core just leaves it out.
	e$selections <- function() {
		cache <- get(".cache", envir = globalenv())
		val <- function(member) tryCatch(cache[[member]], error = function(err) NULL)
		labels <- tryCatch(cd2030.core::cd_denominator_labels(), error = function(err) NULL)
		denom <- function(id) {
			if (is.null(id) || !length(id)) return(NULL)
			list(id = id, label = if (!is.null(labels) && id %in% names(labels)) unname(labels[[id]]) else NULL)
		}
		years <- val("data_years")
		sy <- val("survey_year")
		survey <- val("national_survey")
		source <- if (is.data.frame(survey) && all(c("year", "source") %in% names(survey)) && length(sy)) unique(as.character(survey$source[survey$year %in% sy])) else NULL
		regions <- val("subnational_regions")
		pop <- val("derivation_population")
		group <- tryCatch(cd2030.core::get_selected_group(), error = function(err) NULL)
		out <- list(
			country = val("country"), iso3 = val("country_iso"), group = group,
			denominator = c(denom(val("denominator")), list(for_indicators = "immunization and child indicators")),
			maternal_denominator = if (!identical(group, "vaccine")) c(denom(val("maternal_denominator")), list(for_indicators = "maternal and newborn indicators")),
			derivation_population = if (length(pop)) list(id = pop, meaning = e$meanings(pop)[[pop]]),
			survey = list(year = sy, source = source, start_year = val("start_survey_year"), years_available = val("survey_years"),
				uploaded = tryCatch(!cache$is_default("national_survey"), error = function(err) NULL),
				coverage = as.list(val("survey_estimates"))),
			national_rates = val("national_estimates"),
			years = if (length(years)) list(start = min(years), end = max(years), excluded = val("excluded_years")),
			admin_levels = list(levels = c("national", intersect(c("adminlevel_1", "district"), names(regions))),
				regions = if (is.data.frame(regions)) length(unique(regions$adminlevel_1)), districts = if (is.data.frame(regions)) nrow(regions)),
			adjustment = list(adjusted = val("adjusted_flag"), k_factors = as.list(val("k_factors"))),
			reporting_threshold = val("performance_threshold")
		)
		Filter(Negate(is.null), out)
	}
	e$member <- function(member, args = list(), max_rows = 200, select = NULL, where = NULL) {
		cache <- get(".cache", envir = globalenv())
		generator <- get("CacheConnection", envir = asNamespace("cd2030.core"))
		if (!member %in% c(names(generator$public_methods), names(generator$active))) {
			stop(sprintf("cd2030.core %s has no member %s. Find members with countdown_catalog; if the catalog lists it, the installed cd2030.core is older than this extension's guide: update the app's R packages (use calculate_derived_coverage for denominator_comparison meanwhile).", as.character(utils::packageVersion("cd2030.core")), member), call. = FALSE)
		}
		value <- if (member %in% names(generator$active)) cache[[member]] else do.call(cache[[member]], args)
		e$shape(e$narrow(value, select, where), max_rows)
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

/** The start and end of R output too long to return: about two thirds from the start, the rest from the end. */
export function truncateMiddle(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	const note = (omitted: number) => `\n\n... [${omitted} characters of output omitted -- print less: head(), str(), glimpse(), summary(), or filter/select first] ...\n\n`;
	const budget = Math.max(0, max - note(text.length).length);
	const head = text.slice(0, Math.ceil(budget * 2 / 3));
	const tailLength = budget - head.length;
	const tail = tailLength > 0 ? text.slice(text.length - tailLength) : '';
	return head + note(text.length - head.length - tail.length) + tail;
}

/** The reply between the markers in what R printed, and the rest of the output. */
export function parseReply<T>(text: string, fallbackError: string | undefined): IRReply<T> {
	const start = text.lastIndexOf(START);
	const end = text.lastIndexOf(END);
	const output = (start >= 0 ? text.slice(0, start) : text).trim();
	if (start < 0 || end < start) {
		return { ok: false, error: fallbackError ?? (output || 'R gave no answer.'), output };
	}
	try {
		const reply = JSON.parse(text.slice(start + START.length, end)) as IRReply<T>;
		return { ...reply, output: output || undefined };
	} catch (error) {
		return { ok: false, error: `Could not read R's answer: ${error instanceof Error ? error.message : String(error)}`, output };
	}
}

/**
 * Why a piece of R code needs the user's OK before countdown_run_r runs it: deleting or moving files, system commands,
 * installing packages, changing the working directory or environment, downloads, quitting R, or writing a file (this
 * session is for reading the dataset; results are returned, and plots and the code are kept automatically). Comments
 * and strings don't count. A heuristic that puts the user in the loop for the obvious cases, not a sandbox. Mirrors
 * DataSuite's own check for runR.
 */
export function riskyRReasons(code: string): string[] {
	// comments and the insides of strings removed, so a name mentioned in either is not taken for a call
	let bare = '';
	for (let i = 0; i < code.length;) {
		const ch = code[i];
		if (ch === '#') {
			while (i < code.length && code[i] !== '\n') { i++; }
			continue;
		}
		if (ch === '"' || ch === '\'') {
			let j = i + 1;
			while (j < code.length && code[j] !== ch) { j += code[j] === '\\' ? 2 : 1; }
			bare += `${ch}${ch}`;
			i = j + 1;
			continue;
		}
		bare += ch;
		i++;
	}
	const checks: ReadonlyArray<[RegExp, string]> = [
		[/\b(?:unlink|file\.remove|file\.rename|fs::(?:file_delete|dir_delete|file_move))\s*\(/, 'deletes or moves files'],
		[/\b(?:system2?|shell(?:\.exec)?|processx::run)\s*\(/, 'runs a system command'],
		[/\b(?:install\.packages|remove\.packages|update\.packages|pak::\w+|remotes::install_\w+|devtools::install\w*|BiocManager::install)\s*\(/, 'installs or removes packages'],
		[/\bsetwd\s*\(/, 'changes the working directory'],
		[/\bSys\.(?:setenv|unsetenv)\s*\(/, 'changes environment variables'],
		[/\b(?:download\.file|curl::curl_download)\s*\(/, 'downloads over the network'],
		[/(?:^|[^\w.$@])(?:q|quit)\s*\(/, 'quits R'],
		[/\b(?:saveRDS|write_rds|save|save\.image|write\.csv2?|write\.table|write_csv|write_xlsx|writexl::write_xlsx|writeLines|sink|ggsave|file\.copy|write_json|fwrite)\s*\(/, 'writes a file'],
		[/\$(?:save|set_\w+|update_\w+|reset\w*)\s*\(/, 'may change the dataset (a CacheConnection write method)'],
	];
	return checks.filter(([pattern]) => pattern.test(bare)).map(([, reason]) => reason);
}

function sessionGone(result: IExecuteResult): boolean {
	return result.sessionEnded !== undefined || /Unknown (datasuite )?session/i.test(result.error ?? '');
}

export class CountdownR implements vscode.Disposable {

	private readonly _sessions = new Map<string, ISession>();
	private readonly _pending = new Map<string, Promise<ISession>>();
	/** Tabs whose session ended (a crash): the next call says it started a new one. */
	private readonly _ended = new Map<string, string>();

	/** Runs R in the session for `key` (a tab id), creating it and loading `path` when needed. */
	async call<T>(key: string, label: string, dataset: { path: string; revision?: number } | undefined, code: string, timeoutMs = 300000): Promise<IRReply<T>> {
		for (let attempt = 0; ; attempt++) {
			const session = await this._ready(key, label, dataset);
			if ('ok' in session) {
				return session as IRReply<T>;
			}
			const executed = await this._execute(key, session.id, code, timeoutMs);
			// the session had died (nothing ran, or a read-only helper was cut off): once more, in a new one
			if (sessionGone(executed) && attempt === 0) {
				continue;
			}
			return parseReply<T>(executed.text ?? '', executed.error);
		}
	}

	/** Runs code that ends in `.cdai$run(...)` and parses its reply. */
	async run<T>(sessionId: string, code: string, timeoutMs: number): Promise<IRReply<T>> {
		const executed = await this._execute(undefined, sessionId, code, timeoutMs);
		return parseReply<T>(executed.text ?? '', executed.error);
	}

	/**
	 * Raw execution in the session for `key` (for free R): the session and dataset are prepared first -- only when they
	 * need it, without an extra round trip otherwise. If the tab's session had ended, a new one is used and the result
	 * says so (`restartNotice`): objects from earlier runs are gone.
	 */
	async executeRaw(key: string, label: string, dataset: { path: string; revision?: number } | undefined, code: string, timeoutMs = 300000): Promise<IExecuteResult | IRReply> {
		for (let attempt = 0; ; attempt++) {
			const session = await this._ready(key, label, dataset);
			if ('ok' in session) {
				return session;
			}
			const endedBefore = this._ended.get(key);
			this._ended.delete(key);
			const executed = await this._execute(key, session.id, code, timeoutMs);
			// the session was already gone, so nothing ran: once more in a new one
			if (sessionGone(executed) && executed.sessionEnded === undefined && attempt === 0) {
				continue;
			}
			const restartNotice = endedBefore !== undefined
				? `This tab's R session had ended (${endedBefore}) and a new one was started: objects from earlier runs are gone (.cache is loaded again).`
				: undefined;
			return restartNotice ? { ...executed, restartNotice } : executed;
		}
	}

	/** Interrupts what the session for `key` is running (the chat's Stop). */
	async interrupt(key: string): Promise<void> {
		const session = this._sessions.get(key);
		if (session) {
			await vscode.commands.executeCommand('datasuite.r.interrupt', session.id).then(undefined, () => undefined);
		}
	}

	/** Stops the sessions whose tab is gone. */
	async prune(liveKeys: ReadonlySet<string>): Promise<void> {
		for (const [key, session] of [...this._sessions]) {
			if (!liveKeys.has(key)) {
				this._sessions.delete(key);
				this._ended.delete(key);
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

	/** The tab's session with the helpers defined and the dataset (at its revision) loaded, or why it can't be. */
	private async _ready(key: string, label: string, dataset: { path: string; revision?: number } | undefined): Promise<ISession | IRReply> {
		const session = await this._session(key, label);
		if (!session.prelude) {
			const prelude = await this._execute(key, session.id, R_PRELUDE, 120000);
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
		return session;
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

	/** Runs code; a session found dead (or dying during the run) is forgotten, so the next call starts a new one. */
	private async _execute(key: string | undefined, sessionId: string, code: string, timeoutMs: number): Promise<IExecuteResult> {
		const result = await vscode.commands.executeCommand<IExecuteResult>('datasuite.r.execute', sessionId, code, timeoutMs)
			?? { success: false, text: '', error: 'DataSuite did not answer (is this DataSuite, with R installed?)', images: [] };
		if (sessionGone(result)) {
			for (const [k, session] of [...this._sessions]) {
				if (session.id === sessionId && (key === undefined || k === key)) {
					this._sessions.delete(k);
					this._ended.set(k, result.sessionEnded ?? 'the R process was no longer running');
					vscode.commands.executeCommand('datasuite.r.stopSession', sessionId).then(undefined, () => undefined);
				}
			}
		}
		return result;
	}
}
