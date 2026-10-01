/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// "Open Notebook": a notebook beside a Countdown app, on the app's data, for analysis the app doesn't do or for checking
// its numbers. It goes in the dataset's workspace (<workspace>/notebooks), where DataSuite's kernels give it the
// folder's datasets by name, read-only and read again once the app has saved (cd2030.core's notebook_data(), which the
// apps declare as their notebookData).

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { appState, countdownTabs, pickTab, tabDataset, workspaceDir } from './app';
import { Language, notebookCells, notebookJson } from './notebookContent';

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
			{ label: 'R', language: 'r' as Language, description: vscode.l10n.t('the tables by name, and the whole dataset with the Countdown functions') },
			{ label: 'Python', language: 'python' as Language, description: vscode.l10n.t('the tables as pandas DataFrames') },
			{ label: 'Stata', language: 'stata' as Language, description: vscode.l10n.t('sysuse adjusted_data, clear (Stata 17 or newer on this computer)') },
		], { title: vscode.l10n.t('Open a notebook on {0}', tab.title ?? path.basename(dataset.path)), placeHolder: vscode.l10n.t('The notebook\'s language') });
		if (!picked) {
			return;
		}

		// in the dataset's workspace: DataSuite gives a notebook there the folder's datasets by name
		const dir = path.join(workspace, 'notebooks');
		await fs.promises.mkdir(dir, { recursive: true });
		const title = tab.title ?? path.basename(dataset.path).replace(/\.[^.]+$/, '');
		const stem = `analysis-${new Date().toISOString().slice(0, 10)}${picked.language === 'r' ? '' : `-${picked.language}`}`;
		const file = freeName(dir, stem);
		await fs.promises.writeFile(file, notebookJson(picked.language, notebookCells(picked.language, title)), 'utf8');
		try {
			const document = await vscode.workspace.openNotebookDocument(vscode.Uri.file(file));
			await vscode.window.showNotebookDocument(document, { viewColumn: vscode.ViewColumn.Beside });
		} catch (error) {
			// a DataSuite before notebooks (no ipynb extension): the file is written, it just can't be opened here
			void vscode.window.showErrorMessage(vscode.l10n.t('The notebook was saved as {0}, but this DataSuite cannot open notebooks: update DataSuite. ({1})', file, error instanceof Error ? error.message : String(error)));
		}
	}
}
