/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The Datasets panel: the published Countdown datasets the signed-in user may see (DataSuite.Api's
// ListPublishedDatasetsQuery through POST {api}/manage/{request}), downloaded through GET {api}/data/process/files/{id}
// and opened in the RMNCAH or Vaxx app like any other file.
//
// It signs in with the DataSuite account through its own session with the read-only `data_read` scope. The
// provider matches scope sets exactly, so this session sits beside the AI's (openid profile ai_gateway
// offline_access). Someone already signed in to the AI needs no second sign-in: the provider exchanges the AI's token
// for this session when their account may see Countdown data. When it may not, the panel says so and links to
// Identity's request-access page (the provider's `datasuite-authentication.dataAccessStatus` tells that apart from
// not being signed in at all). A device-code sign-in runs only when the user asks for it in the panel.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import * as vscode from 'vscode';
import { EXTENSION_ID } from './app';

const AUTH_PROVIDER_ID = 'datasuite';
const DATA_SCOPES = ['openid', 'profile', 'data_read', 'offline_access'];
/** The DataSuite Authentication extension's answer: never a token, only whether this editor is signed in for data. */
const DATA_ACCESS_STATUS_COMMAND = 'datasuite-authentication.dataAccessStatus';
const NO_ACCESS_MESSAGE = "Your DataSuite account doesn't have access to Countdown data.";
/** The same host the DataSuite AI extension calls (its DEFAULT_DATASUITE_AI_API_URL): DataSuite.Api. */
const DEFAULT_API_URL = 'https://datasuite.damurka.com/api';
/** DataSuite's Identity (the DataSuite sign-in's default `datasuite-authentication.identityServerUrl`). */
const DEFAULT_IDENTITY_URL = 'https://datasuite.damurka.com/auth';
const VIEW_ID = 'countdown.datasets';
const LAST_FOLDER_KEY = 'countdown.datasets.lastDownloadFolder';

/** `FileDto` (camelCase JSON). */
interface IDatasetFile {
	readonly id: string;
	readonly kind: string;
	readonly fileName: string;
	readonly sizeBytes: number;
}

/**
 * `PublishedDatasetDto`: what one country published in one publication activity of a cycle (the published version of
 * each of the activity's items; `itemId`/`versionNumber` are its main item's, the first .rds). A cycle can have more
 * than one publication activity, so a dataset is keyed by country cycle and activity.
 */
interface IPublishedDataset {
	readonly countryCycleId: string;
	readonly cycleId: string;
	readonly cycleName: string;
	readonly year: number;
	readonly countryTenantId: number;
	readonly countryName: string;
	readonly itemId: string;
	readonly versionNumber: number;
	readonly publishedAtUtc: string | null;
	readonly qualityScore: number | null;
	readonly files: readonly IDatasetFile[];
	readonly activityId?: string;
	readonly activityName?: string;
}

/** What the panel shows; each state but `ready` has its own welcome text (package.json viewsWelcome). */
type PanelState = 'loading' | 'signedOut' | 'noAccess' | 'empty' | 'error' | 'ready';

/** `datasuite-authentication.dataAccessStatus`: signed in for data, not signed in to DataSuite at all, or signed in
 * with an account refused data access (`message` is the server's reason). */
interface IDataAccessStatus {
	readonly state: 'signedIn' | 'signedOut' | 'noAccess';
	readonly message?: string;
	readonly requestAccessUrl: string;
}

type Node =
	| { readonly type: 'cycle'; readonly cycleId: string; readonly name: string; readonly year: number; readonly datasets: readonly IPublishedDataset[] }
	| { readonly type: 'dataset'; readonly dataset: IPublishedDataset }
	| { readonly type: 'file'; readonly dataset: IPublishedDataset; readonly file: IDatasetFile };

class DatasetsError extends Error {
	constructor(message: string, readonly state: PanelState = 'error') {
		super(message);
	}
}

export class Datasets implements vscode.TreeDataProvider<Node> {

	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private _view: vscode.TreeView<Node> | undefined;
	private _datasets: IPublishedDataset[] | undefined;
	private _loading: Promise<void> | undefined;
	/** Identity's request-access page, from the last status the provider gave. */
	private _requestAccessUrl: string | undefined;

	constructor(private readonly _context: vscode.ExtensionContext) { }

	register(): vscode.Disposable[] {
		this._view = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: this, showCollapseAll: true });
		return [
			this._view,
			this._onDidChangeTreeData,
			vscode.commands.registerCommand('countdown.datasets.signIn', () => this._signIn()),
			// Refresh and Try Again ask the server again, even right after a refusal (e.g. access was just granted)
			vscode.commands.registerCommand('countdown.datasets.refresh', () => this._refresh(true)),
			vscode.commands.registerCommand('countdown.datasets.requestAccess', () => this._requestAccess()),
			vscode.commands.registerCommand('countdown.datasets.download', (node?: Node) => this._download(node)),
			vscode.commands.registerCommand('countdown.datasets.openInRmncah', (node?: Node) => this._openInApp(node, 'rmncah')),
			vscode.commands.registerCommand('countdown.datasets.openInVaxx', (node?: Node) => this._openInApp(node, 'vaxx')),
			// signing in or out anywhere (another window, the Accounts menu) shows in the panel
			vscode.authentication.onDidChangeSessions(e => {
				if (e.provider.id !== AUTH_PROVIDER_ID) {
					return;
				}
				if (this._view?.visible) {
					void this._refresh();
				} else {
					// reloaded when next shown
					this._datasets = undefined;
				}
			}),
			// loaded when first shown, not at startup: no network call for people who never open it
			this._view.onDidChangeVisibility(e => {
				if (e.visible && !this._datasets && !this._loading) {
					void this._refresh();
				}
			})
		];
	}

	// ---------------------------------------------------------------------------------------------- tree

	getTreeItem(node: Node): vscode.TreeItem {
		switch (node.type) {
			case 'cycle': {
				const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Expanded);
				item.id = `cycle:${node.cycleId}`;
				item.description = node.name.includes(String(node.year)) ? undefined : String(node.year);
				item.iconPath = new vscode.ThemeIcon('calendar');
				item.contextValue = 'cycle';
				return item;
			}
			case 'dataset': {
				const { dataset } = node;
				const item = new vscode.TreeItem(dataset.countryName, vscode.TreeItemCollapsibleState.Collapsed);
				item.id = `dataset:${dataset.countryCycleId}:${dataset.activityId ?? ''}`;
				item.description = `${dataset.activityName && dataset.activityName !== 'Publication' ? `${dataset.activityName} · ` : ''}v${dataset.versionNumber}${dataset.publishedAtUtc ? ` · ${formatDate(dataset.publishedAtUtc)}` : ''}`;
				item.tooltip = datasetTooltip(dataset);
				item.iconPath = new vscode.ThemeIcon('database');
				item.contextValue = datasetRds(dataset) ? 'dataset.rds' : 'dataset';
				return item;
			}
			case 'file': {
				const item = new vscode.TreeItem(node.file.fileName, vscode.TreeItemCollapsibleState.None);
				item.id = `file:${node.file.id}`;
				item.description = `${kindLabel(node.file.kind)} · ${formatSize(node.file.sizeBytes)}`;
				item.resourceUri = vscode.Uri.file(node.file.fileName);
				item.iconPath = vscode.ThemeIcon.File;
				item.contextValue = isRds(node.file) ? 'file.rds' : 'file';
				return item;
			}
		}
	}

	async getChildren(node?: Node): Promise<Node[]> {
		if (node?.type === 'cycle') {
			return node.datasets.map(dataset => ({ type: 'dataset', dataset }));
		}
		if (node?.type === 'dataset') {
			return node.dataset.files.map(file => ({ type: 'file', dataset: node.dataset, file }));
		}
		if (node) {
			return [];
		}
		if (!this._datasets) {
			return [];
		}
		// grouped by cycle, newest first (the server sends the datasets newest year first, then by country)
		const cycles = new Map<string, { type: 'cycle'; cycleId: string; name: string; year: number; datasets: IPublishedDataset[] }>();
		for (const dataset of this._datasets) {
			let cycle = cycles.get(dataset.cycleId);
			if (!cycle) {
				cycle = { type: 'cycle', cycleId: dataset.cycleId, name: dataset.cycleName, year: dataset.year, datasets: [] };
				cycles.set(dataset.cycleId, cycle);
			}
			cycle.datasets.push(dataset);
		}
		return [...cycles.values()].sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
	}

	// ---------------------------------------------------------------------------------------------- loading

	/** @param recheck ask the server again even if the account was refused data access a moment ago */
	private _refresh(recheck = false): Promise<void> {
		this._loading ??= Promise.resolve(vscode.window.withProgress({ location: { viewId: VIEW_ID } }, () => this._load(recheck)))
			.finally(() => this._loading = undefined);
		return this._loading;
	}

	private async _load(recheck: boolean): Promise<void> {
		await this._setState('loading');
		try {
			// the data session; signed in to the AI only, the provider exchanges that sign-in for it when allowed
			let session = await this._session(false);
			if (!session) {
				const status = await this._accessStatus(recheck);
				if (status?.state === 'signedIn') {
					session = await this._session(false);
				}
				if (!session) {
					this._datasets = undefined;
					if (status?.state === 'noAccess') {
						await this._setState('noAccess', status.message || NO_ACCESS_MESSAGE);
					} else {
						await this._setState('signedOut');
					}
					return;
				}
			}
			const datasets = await this._request<IPublishedDataset[]>(session, 'manage/ListPublishedDatasetsQuery', { method: 'POST', body: '{}' });
			this._datasets = Array.isArray(datasets) ? datasets : [];
			await this._setState(this._datasets.length ? 'ready' : 'empty');
		} catch (error) {
			this._datasets = undefined;
			const state = error instanceof DatasetsError ? error.state : 'error';
			await this._setState(state, state === 'error' ? `Couldn't load the datasets: ${message(error)}` : state === 'noAccess' ? message(error) : undefined);
		}
	}

	private async _setState(state: PanelState, text?: string): Promise<void> {
		if (this._view) {
			this._view.message = text;
		}
		this._onDidChangeTreeData.fire();
		await vscode.commands.executeCommand('setContext', 'countdown.datasets.state', state);
	}

	private async _signIn(): Promise<void> {
		try {
			// the AI's sign-in exchanged when there is one, else the provider's device-code sign-in; the AI's session
			// stays as it is
			await this._session(true);
		} catch (error) {
			// the provider shows its own error when the sign-in itself fails; cancelling needs no message
			if (!/cancel/i.test(message(error))) {
				void vscode.window.showErrorMessage(`DataSuite sign-in failed: ${message(error)}`);
				// refused data access: the panel offers to request it
				void this._refresh();
			}
			return;
		}
		await this._refresh();
	}

	/** Opens Identity's request-access page in the browser (signed in there, the person asks for access to Countdown data). */
	private async _requestAccess(): Promise<void> {
		const url = this._requestAccessUrl ?? (await this._accessStatus(false))?.requestAccessUrl ?? defaultRequestAccessUrl();
		await vscode.env.openExternal(vscode.Uri.parse(url));
	}

	/** The DataSuite Authentication extension's data sign-in state. Optional: `undefined` when the command is missing,
	 * fails or answers something else (an older DataSuite, another editor) -- the panel then behaves as it would
	 * without it: signed out offers the sign-in, and the API's 403 still shows no access. `recheck` forgets a refusal
	 * the provider remembers, so the server is asked again. */
	private async _accessStatus(recheck: boolean): Promise<IDataAccessStatus | undefined> {
		try {
			const status = await vscode.commands.executeCommand<unknown>(DATA_ACCESS_STATUS_COMMAND, { recheck });
			if (!isDataAccessStatus(status)) {
				return undefined;
			}
			this._requestAccessUrl = status.requestAccessUrl;
			return status;
		} catch {
			return undefined;
		}
	}

	/** The panel's DataSuite session (a fresh token: the provider refreshes one about to expire); `undefined` when
	 * signed out and `create` is false. */
	private async _session(create: boolean): Promise<vscode.AuthenticationSession | undefined> {
		try {
			return create
				? await vscode.authentication.getSession(AUTH_PROVIDER_ID, DATA_SCOPES, { createIfNone: { detail: 'Sign in to see the published Countdown datasets you have access to.' } })
				: await vscode.authentication.getSession(AUTH_PROVIDER_ID, DATA_SCOPES, { silent: true });
		} catch (error) {
			if (!create && /no authentication provider|not found/i.test(message(error))) {
				throw new DatasetsError('DataSuite sign-in is not available in this editor.');
			}
			throw error;
		}
	}

	private _apiUrl(): string {
		const configured = vscode.workspace.getConfiguration('countdown.datasets').get<string>('apiUrl');
		return (configured || DEFAULT_API_URL).replace(/\/+$/, '');
	}

	/** Calls DataSuite.Api with the session's token; 401 and 403 become the panel's signedOut and noAccess states. */
	private async _fetch(session: vscode.AuthenticationSession, route: string, init: RequestInit): Promise<Response> {
		let response: Response;
		try {
			response = await fetch(`${this._apiUrl()}/${route}`, {
				...init,
				headers: { ...init.headers as Record<string, string>, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' }
			});
		} catch (error) {
			if (init.signal?.aborted) {
				throw error;
			}
			throw new DatasetsError(`DataSuite could not be reached (${message(error)}).`);
		}
		if (response.status === 401) {
			throw new DatasetsError('Your DataSuite sign-in has ended. Sign in again.', 'signedOut');
		}
		if (response.status === 403) {
			// the panel offers Request Access
			throw new DatasetsError(`${NO_ACCESS_MESSAGE} Request access, or ask your DataSuite administrator to assign you to a country.`, 'noAccess');
		}
		if (response.status === 404 && route.startsWith('data/')) {
			throw new DatasetsError('The file was not found. It may no longer be published: refresh the Datasets panel.');
		}
		if (!response.ok) {
			let detail = '';
			try {
				detail = ((await response.json()) as { error?: string }).error ?? '';
			} catch {
				// not JSON
			}
			throw new DatasetsError(detail || `DataSuite answered ${response.status} ${response.statusText}.`);
		}
		return response;
	}

	private async _request<T>(session: vscode.AuthenticationSession, route: string, init: RequestInit): Promise<T> {
		return await (await this._fetch(session, route, init)).json() as T;
	}

	// ---------------------------------------------------------------------------------------------- actions

	/** Download the file, or all of a dataset's files, to a folder the user picks. */
	private async _download(node: Node | undefined): Promise<void> {
		const files = node?.type === 'file' ? [node.file] : node?.type === 'dataset' ? [...node.dataset.files] : [];
		if (!files.length) {
			return;
		}
		const last = this._context.globalState.get<string>(LAST_FOLDER_KEY);
		const picked = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			defaultUri: vscode.Uri.file(last && fs.existsSync(last) ? last : this._datasetsRoot()),
			openLabel: 'Download Here',
			title: `Download ${files.length === 1 ? files[0].fileName : `${node?.type === 'dataset' ? node.dataset.countryName : ''} dataset (${files.length} files)`}`
		});
		const folder = picked?.[0]?.fsPath;
		if (!folder) {
			return;
		}
		await this._context.globalState.update(LAST_FOLDER_KEY, folder);
		const targets = files.map(file => ({ file, target: path.join(folder, safeName(file.fileName)) }));
		const existing = targets.filter(t => fs.existsSync(t.target));
		if (existing.length) {
			const replace = await vscode.window.showWarningMessage(
				`${existing.map(t => path.basename(t.target)).join(', ')} already ${existing.length === 1 ? 'exists' : 'exist'} in ${folder}. Replace?`,
				{ modal: true }, 'Replace');
			if (replace !== 'Replace') {
				return;
			}
		}
		try {
			for (const { file, target } of targets) {
				await this._downloadFile(file, target);
			}
		} catch (error) {
			return this._fail(error);
		}
		const reveal = await vscode.window.showInformationMessage(
			`Downloaded ${targets.length === 1 ? path.basename(targets[0].target) : `${targets.length} files`} to ${folder}.`, 'Show in Folder');
		if (reveal) {
			await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targets[0].target));
		}
	}

	/**
	 * Opens the dataset's .rds in an app. It is kept in the Countdown datasets folder
	 * (`<folder>/<cycle>/<country> v<version>/<file>`), downloaded the first time: DataSuite puts the app's saved file
	 * and analysis folder next to it, so the work stays with the data, and a new published version gets its own folder.
	 */
	private async _openInApp(node: Node | undefined, app: 'rmncah' | 'vaxx'): Promise<void> {
		const dataset = node?.type === 'file' || node?.type === 'dataset' ? node.dataset : undefined;
		const file = node?.type === 'file' ? node.file : dataset && datasetRds(dataset);
		if (!dataset || !file || !isRds(file)) {
			void vscode.window.showWarningMessage('Only a dataset (.rds) opens in the Countdown apps.');
			return;
		}
		const target = path.join(this._datasetsRoot(), safeName(dataset.cycleName), safeName(`${dataset.countryName} v${dataset.versionNumber}`), safeName(file.fileName));
		try {
			if (!isDownloaded(target, file)) {
				await this._downloadFile(file, target);
			}
		} catch (error) {
			return this._fail(error);
		}
		const opened = await vscode.commands.executeCommand<{ tabId: string } | { error: string } | undefined>('datasuite.shinyApps.open', `${EXTENSION_ID}#${app}`, target);
		if (!opened || 'error' in opened) {
			void vscode.window.showErrorMessage(`Couldn't open ${file.fileName}: ${opened && 'error' in opened ? opened.error : 'DataSuite did not open the app.'}`);
		}
	}

	/** Downloads through a `.part` file, so an interrupted download never leaves a file that looks complete. */
	private async _downloadFile(file: IDatasetFile, target: string): Promise<void> {
		const session = await this._session(false);
		if (!session) {
			throw new DatasetsError('Sign in to DataSuite to download datasets.', 'signedOut');
		}
		await fs.promises.mkdir(path.dirname(target), { recursive: true });
		const partial = `${target}.part`;
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Downloading ${file.fileName}`, cancellable: true }, async (progress, token) => {
			const abort = new AbortController();
			const cancel = token.onCancellationRequested(() => abort.abort());
			try {
				const response = await this._fetch(session, `data/process/files/${encodeURIComponent(file.id)}`, { method: 'GET', signal: abort.signal });
				if (!response.body) {
					throw new DatasetsError('DataSuite sent an empty file.');
				}
				const total = Number(response.headers.get('content-length')) || file.sizeBytes;
				let received = 0;
				let reported = 0;
				const body = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
				body.on('data', (chunk: Buffer) => {
					received += chunk.length;
					if (total > 0) {
						const percent = Math.floor(received / total * 100);
						if (percent > reported) {
							progress.report({ increment: percent - reported, message: `${formatSize(received)} of ${formatSize(total)}` });
							reported = percent;
						}
					}
				});
				await pipeline(body, fs.createWriteStream(partial), { signal: abort.signal });
				await fs.promises.rename(partial, target);
			} catch (error) {
				await fs.promises.rm(partial, { force: true });
				throw abort.signal.aborted ? new vscode.CancellationError() : error;
			} finally {
				cancel.dispose();
			}
		});
	}

	private async _fail(error: unknown): Promise<void> {
		if (error instanceof vscode.CancellationError) {
			return;
		}
		if (error instanceof DatasetsError && (error.state === 'signedOut' || error.state === 'noAccess')) {
			// the panel shows why, with its sign-in or retry button
			void this._refresh();
		}
		void vscode.window.showErrorMessage(message(error));
	}

	/** Where datasets are kept: the `countdown.datasets.folder` setting, else `Documents/Countdown datasets`. */
	private _datasetsRoot(): string {
		const configured = vscode.workspace.getConfiguration('countdown.datasets').get<string>('folder');
		return configured ? configured.replace(/^~(?=$|[\\/])/, os.homedir()) : path.join(os.homedir(), 'Documents', 'Countdown datasets');
	}
}

// ---------------------------------------------------------------------------------------------- helpers

function isDataAccessStatus(value: unknown): value is IDataAccessStatus {
	const status = value as Partial<IDataAccessStatus> | undefined;
	return !!status && (status.state === 'signedIn' || status.state === 'signedOut' || status.state === 'noAccess')
		&& typeof status.requestAccessUrl === 'string' && /^https?:\/\//i.test(status.requestAccessUrl);
}

/** Identity's request-access page when the provider can't say: from the DataSuite sign-in's Identity address setting
 * (read as a setting only -- nothing of that extension is imported), else DataSuite's own. */
function defaultRequestAccessUrl(): string {
	const configured = vscode.workspace.getConfiguration().get<string>('datasuite-authentication.identityServerUrl');
	return `${(configured || DEFAULT_IDENTITY_URL).replace(/\/+$/, '')}/request-access`;
}

function isRds(file: IDatasetFile): boolean {
	return file.fileName.toLowerCase().endsWith('.rds');
}

/** The dataset's .rds: the final dataset (FinalRds), else any .rds among its files. */
function datasetRds(dataset: IPublishedDataset): IDatasetFile | undefined {
	return dataset.files.find(f => f.kind === 'FinalRds' && isRds(f)) ?? dataset.files.find(isRds);
}

/** Already downloaded: there, with the published size (a file of another size is a different or broken copy). */
function isDownloaded(target: string, file: IDatasetFile): boolean {
	try {
		return fs.statSync(target).size === file.sizeBytes;
	} catch {
		return false;
	}
}

/** A file or folder name from server text: no path separators or characters Windows refuses. */
function safeName(name: string): string {
	const cleaned = path.basename(name.replace(/\\/g, '/')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim();
	return cleaned || 'dataset';
}

function kindLabel(kind: string): string {
	switch (kind) {
		case 'FinalRds': return 'Dataset';
		case 'FinalReport': return 'Report';
		case 'WorkshopRds': return 'Workshop dataset';
		case 'RetrievalExcel': return 'Retrieval workbook';
		case 'DailyReport': return 'Daily report';
		default: return kind;
	}
}

function formatSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function formatDate(iso: string): string {
	const date = new Date(iso);
	return isNaN(date.getTime()) ? iso : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function datasetTooltip(dataset: IPublishedDataset): vscode.MarkdownString {
	const lines = [
		`**${dataset.countryName}** -- ${dataset.cycleName}${dataset.activityName ? ` (${dataset.activityName})` : ''}`,
		'',
		`Version ${dataset.versionNumber}${dataset.publishedAtUtc ? `, published ${formatDate(dataset.publishedAtUtc)}` : ''}`
	];
	if (dataset.qualityScore !== null && dataset.qualityScore !== undefined) {
		lines.push('', `Quality score: ${Math.round(dataset.qualityScore * 10) / 10}`);
	}
	return new vscode.MarkdownString(lines.join('\n'));
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
