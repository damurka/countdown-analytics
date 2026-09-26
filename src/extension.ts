/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The Countdown AI: every Countdown-specific AI feature lives in this extension (docs/AI-PLAN.md), on top of
// DataSuite's generic Shiny app, AI bridge and R session API.

import * as vscode from 'vscode';
import { Knowledge } from './knowledge';
import { CountdownR } from './r';
import { CountdownTools } from './tools';

export function activate(context: vscode.ExtensionContext): void {
	const knowledge = new Knowledge(context);
	const r = new CountdownR();
	context.subscriptions.push(r, ...new CountdownTools(knowledge, r).register());
	// a newer methodology corpus from the site, when online; the bundled snapshot is used until then
	void knowledge.refreshCorpus();
}

export function deactivate(): void { }
