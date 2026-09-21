/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const CD2030_DATA_REFERENCE_FILENAME = 'data-reference.json';

interface ICd2030DocsToolInput {
	readonly appId: string;
	readonly page?: string;
	readonly functionName?: string;
}

interface ICd2030ReferencePage {
	readonly title: string;
	readonly calls: readonly string[];
	readonly docs: { readonly [call: string]: string };
	readonly analysisRationale?: string;
}

interface ICd2030Reference {
	readonly packageName: string;
	readonly gettingStarted: string;
	readonly pages: { readonly [pageId: string]: ICd2030ReferencePage };
	readonly methodDocs: { readonly [name: string]: string };
}

interface IShinyAppManifestEntry {
	readonly id: string;
	readonly location: string;
}

/** Looks up which cd2030.core-backed Shiny app cache data a page/method uses, from this extension's own `apps/*\/data-reference.json` files -- reads its own manifest for the id -> app-folder mapping rather than depending on the workbench's IShinyAppsService, since this now runs entirely in the extension host. */
class Cd2030DocsTool implements vscode.LanguageModelTool<ICd2030DocsToolInput> {
	constructor(private readonly _context: vscode.ExtensionContext) { }

	private _resolveAppDir(appId: string): vscode.Uri | undefined {
		const shinyApps = (this._context.extension.packageJSON?.contributes?.shinyApps ?? []) as IShinyAppManifestEntry[];
		const app = shinyApps.find(a => a.id === appId);
		return app ? vscode.Uri.joinPath(this._context.extensionUri, app.location) : undefined;
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ICd2030DocsToolInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const input = options.input;
		const appDir = this._resolveAppDir(input.appId);
		if (!appDir) {
			return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`No Shiny app found with id "${input.appId}".`)]);
		}

		let reference: ICd2030Reference;
		try {
			const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(appDir, CD2030_DATA_REFERENCE_FILENAME));
			reference = JSON.parse(Buffer.from(bytes).toString('utf8'));
		} catch {
			return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(
				`No cd2030.core data reference available for "${input.appId}" -- it may not be backed by cd2030.core, or its reference hasn't been generated yet.`
			)]);
		}

		// Included on every response -- not just the first -- so the model never has to
		// rediscover the package name or the right constructor (init_CacheConnection(rds_path
		// = ...), not CacheConnection$new()) by trial and error against a live R session.
		const gettingStarted = `## Getting started\n\n${reference.gettingStarted}`;

		if (input.functionName) {
			const doc = reference.methodDocs[input.functionName];
			const body = doc ?? `No documentation found for "${input.functionName}" in ${reference.packageName}.`;
			return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`${gettingStarted}\n\n${body}`)]);
		}

		if (input.page) {
			const page = reference.pages[input.page];
			if (!page) {
				const available = Object.keys(reference.pages).join(', ');
				return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(
					`${gettingStarted}\n\nNo page "${input.page}" found for "${input.appId}". Available pages: ${available}`
				)]);
			}
			const callDocs = page.calls.map(call => `### ${call}\n${page.docs[call]}`).join('\n\n');
			const rationale = page.analysisRationale ? `\n\n## Analysis rationale\n\n${page.analysisRationale}` : '';
			return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(
				`${gettingStarted}\n\n# ${page.title}\n\n${reference.packageName} calls this page uses: ${page.calls.join(', ')}\n\n${callDocs}${rationale}`
			)]);
		}

		const list = Object.entries(reference.pages).map(([id, page]) => `- ${id}: ${page.title}`).join('\n');
		return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`${gettingStarted}\n\nAvailable pages for "${input.appId}":\n${list}`)]);
	}
}

interface IDatasuiteResultMessage {
	readonly msgType: string;
	readonly content: unknown;
}

interface IDatasuiteExecutionResult {
	readonly success: boolean;
	readonly output: readonly IDatasuiteResultMessage[];
	readonly error?: { readonly message: string };
}

/** Mirrors the shape datasuite.executeR's messages carry (see src/vs/workbench/contrib/datasuite's IStreamContent/IMimeBundleContent) -- duplicated here since extension-host code has no path back to those workbench-internal types. */
function extractText(content: unknown): string | undefined {
	const stream = content as { text?: string } | undefined;
	if (typeof stream?.text === 'string') {
		return stream.text;
	}
	const bundle = content as { data?: { [mime: string]: unknown } } | undefined;
	const plain = bundle?.data?.['text/plain'];
	if (typeof plain === 'string') {
		return plain;
	}
	if (Array.isArray(plain)) {
		return plain.join('\n');
	}
	return undefined;
}

const RDS_EXTENSION = '.rds';

/** Mirrors resolveShinyCachePath's stem-based `.rds` naming (src/vs/workbench/contrib/shinyApps, not reachable from the extension host): cd2030.core's CacheConnection convention is `<stem>.rds` next to the original source file. */
function resolveCachePath(path: string): string {
	if (path.toLowerCase().endsWith(RDS_EXTENSION)) {
		return path;
	}
	const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
	const lastDot = path.lastIndexOf('.');
	const stem = lastDot > lastSlash ? path.slice(0, lastDot) : path;
	return `${stem}${RDS_EXTENSION}`;
}

interface IReadCacheToolInput {
	readonly path: string;
}

/**
 * Reads a Countdown Shiny app's `.rds` cache fresh via cd2030.core's own `init_CacheConnection()`,
 * in the same managed AI R session `runR` uses (via the datasuite.executeR bridge command, ADR-0017)
 * -- so the loaded `.datasuite_cache` variable stays available for follow-up runR calls without
 * reloading it. Always reopens fresh rather than caching across calls: the running Shiny app
 * persists every save to disk immediately, so a fresh read is sufficient to avoid stale data,
 * with no extra synchronization needed (see CONTEXT.md's R-execution bridge entry, ADR-0017).
 */
class ReadCd2030CacheTool implements vscode.LanguageModelTool<IReadCacheToolInput> {
	async invoke(options: vscode.LanguageModelToolInvocationOptions<IReadCacheToolInput>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const cachePath = resolveCachePath(options.input.path);
		const code = [
			`.datasuite_cache <- cd2030.core::init_CacheConnection(rds_path = ${JSON.stringify(cachePath)})`,
			`cat("Cache loaded from:", ${JSON.stringify(cachePath)}, "\\n")`,
			`cat("Class:", paste(class(.datasuite_cache), collapse = ", "), "\\n")`,
			`cat("Available methods/fields:", paste(ls(.datasuite_cache), collapse = ", "), "\\n")`,
		].join('\n');

		const result = await vscode.commands.executeCommand<IDatasuiteExecutionResult>('datasuite.executeR', code);

		const lines: string[] = [`# Countdown cache (status: ${result.success ? 'ok' : 'error'})`];
		for (const message of result.output) {
			const text = extractText(message.content);
			if (text) {
				lines.push(text.endsWith('\n') ? text.slice(0, -1) : text);
			}
		}
		if (!result.success) {
			lines.push(`Error: ${result.error?.message ?? 'Cache load failed'}`);
		}
		lines.push('', 'The cache is now available as `.datasuite_cache` in the runR session -- call its methods directly there (consult cd2030Docs for what each one means) rather than reloading it.');

		return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(lines.join('\n'))]);
	}
}

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.lm.registerTool<ICd2030DocsToolInput>('cd2030Docs', new Cd2030DocsTool(context)));
	context.subscriptions.push(vscode.lm.registerTool<IReadCacheToolInput>('readCd2030Cache', new ReadCd2030CacheTool()));
}
