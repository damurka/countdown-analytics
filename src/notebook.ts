/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// "Open Notebook": a notebook beside a Countdown app, on the app's data, for analysis the app doesn't do or for checking
// its numbers. R reads the app's dataset itself, read-only (init_CacheConnection(read_only = TRUE)), so nothing in the
// notebook changes the app; Python and Stata get the data exported as .dta files (a copy, as of that moment). The
// notebook goes in the tab's analysis folder (<workspace>/notebooks) and runs on DataSuite's kernels.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { appState, countdownTabs, pickTab, tabDataset, workspaceDir } from './app';
import { EXPORTS, Language, notebookCells, notebookJson, slashes } from './notebookContent';
import { CountdownR, rString } from './r';

/** `<dir>/<stem>.ipynb`, or `<stem>-2.ipynb`, ... when that is taken. */
function freeName(dir: string, stem: string): string {
	for (let n = 1; ; n++) {
		const candidate = path.join(dir, `${stem}${n === 1 ? '' : `-${n}`}.ipynb`);
		if (!fs.existsSync(candidate)) {
			return candidate;
		}
	}
}

export class CountdownNotebooks {

	constructor(private readonly _r: CountdownR) { }

	register(): vscode.Disposable[] {
		// the editor toolbar's button shows on a Countdown app's tab: DataSuite has no context key for an app tab (its
		// pane is the generic browser's), so the extension says when the active tab is one
		const update = async () => {
			const active = (await countdownTabs()).some(tab => tab.active);
			await vscode.commands.executeCommand('setContext', 'countdown.appTabActive', active);
		};
		void update();
		return [
			vscode.commands.registerCommand('countdown.notebook.open', () => this.open()),
			vscode.window.tabGroups.onDidChangeTabs(() => void update()),
			vscode.window.tabGroups.onDidChangeTabGroups(() => void update()),
		];
	}

	async open(): Promise<void> {
		const tab = await pickTab();
		if (typeof tab === 'string') {
			void vscode.window.showErrorMessage(tab);
			return;
		}
		const state = await appState(tab);
		const dataset = tabDataset(tab, state);
		const workspace = workspaceDir(tab);
		if (!dataset || !workspace) {
			void vscode.window.showErrorMessage(vscode.l10n.t('Load a dataset in the app first: the notebook works on the app\'s data.'));
			return;
		}
		const picked = await vscode.window.showQuickPick([
			{ label: 'R', language: 'r' as Language, description: vscode.l10n.t('the whole dataset, with the Countdown functions'), detail: vscode.l10n.t('Reads the app\'s dataset itself, read-only; rerun the first cell to follow the app.') },
			{ label: 'Python', language: 'python' as Language, description: vscode.l10n.t('the data as .dta files, with pandas'), detail: vscode.l10n.t('A copy of the data as it is now.') },
			{ label: 'Stata', language: 'stata' as Language, description: vscode.l10n.t('the data as .dta files'), detail: vscode.l10n.t('A copy of the data as it is now. Needs Stata 17 or newer on this computer.') },
		], { title: vscode.l10n.t('Open a notebook on {0}', tab.title ?? path.basename(dataset.path)), placeHolder: vscode.l10n.t('The notebook\'s language') });
		if (!picked) {
			return;
		}

		const dir = path.join(workspace, 'notebooks');
		await fs.promises.mkdir(dir, { recursive: true });
		const title = tab.title ?? path.basename(dataset.path).replace(/\.[^.]+$/, '');
		const stem = `analysis-${new Date().toISOString().slice(0, 10)}${picked.language === 'r' ? '' : `-${picked.language}`}`;

		let exported: { dir: string; files: string[] } | undefined;
		if (picked.language !== 'r') {
			const dataDir = path.join(dir, `${stem}-data`);
			exported = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Exporting the app\'s data for {0}', picked.label) }, () => this._export(tab.tabId, `Countdown AI: ${tab.title ?? tab.localId}`, dataset, dataDir));
			if (!exported) {
				return;
			}
		}

		const file = freeName(dir, stem);
		await fs.promises.writeFile(file, notebookJson(picked.language, notebookCells(picked.language, title, dataset, exported)), 'utf8');
		try {
			const document = await vscode.workspace.openNotebookDocument(vscode.Uri.file(file));
			await vscode.window.showNotebookDocument(document, { viewColumn: vscode.ViewColumn.Beside });
		} catch (error) {
			// a DataSuite before notebooks (no ipynb extension): the file is written, it just can't be opened here
			void vscode.window.showErrorMessage(vscode.l10n.t('The notebook was saved as {0}, but this DataSuite cannot open notebooks: update DataSuite. ({1})', file, error instanceof Error ? error.message : String(error)));
		}
	}

	/** Writes the data to `<dir>/<name>.dta` (from the tab's read-only R session); the names written, or undefined after saying why not. */
	private async _export(tabId: string, label: string, dataset: { path: string; revision?: number }, dir: string): Promise<{ dir: string; files: string[] } | undefined> {
		await fs.promises.mkdir(dir, { recursive: true });
		const members = EXPORTS.map(e => `${e.name} = ${rString(e.member)}`).join(', ');
		const reply = await this._r.call<string[]>(tabId, label, dataset, `.cdai$run({
	members <- c(${members})
	written <- character()
	for (name in names(members)) {
		x <- tryCatch(.cache[[members[[name]]]], error = function(e) NULL)
		if (!is.data.frame(x) || !nrow(x)) next
		x <- as.data.frame(dplyr::ungroup(x))
		x <- x[, !vapply(x, is.list, NA), drop = FALSE]
		attr(x, "class") <- "data.frame"
		# Stata's names: letters, digits and _, not starting with a digit, at most 32 characters
		n <- sub("^([0-9])", "v\\\\1", gsub("[^A-Za-z0-9_]", "_", names(x)))
		names(x) <- make.unique(substr(n, 1, 32), sep = "_")
		haven::write_dta(x, file.path(${rString(slashes(dir))}, paste0(name, ".dta")))
		written <- c(written, name)
	}
	I(written)
})`, 600000);
		if (!reply.ok || !reply.result?.length) {
			void vscode.window.showErrorMessage(vscode.l10n.t('Could not export the app\'s data: {0}', reply.ok ? vscode.l10n.t('the dataset has no data yet') : reply.error ?? ''));
			return undefined;
		}
		return { dir, files: reply.result };
	}
}
