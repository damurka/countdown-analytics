/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The Countdown app tabs, through DataSuite's generic API (datasuite.shinyApps.*) and the AI bridge's state
// (protocol 2, datasuite.ui docs/AI-BRIDGE.md).

import * as path from 'path';
import * as vscode from 'vscode';

export const EXTENSION_ID = 'datasuite.countdown-analytics';

export interface ITab {
	readonly tabId: string;
	readonly appId: string;
	readonly extensionId: string;
	readonly localId: string;
	readonly file: string | undefined;
	/** The tab's analysis folder, named by DataSuite after the app's saved file (e.g. `Benin_rmncah.shiny-workspace`). */
	readonly workspaceDir?: string;
	readonly title: string | undefined;
	readonly active: boolean;
}

export interface IComponent {
	readonly id: string;
	readonly cardId?: string;
	readonly tabKey?: string;
	readonly type?: string;
	readonly title?: string;
	readonly drawn?: boolean;
	readonly about?: { readonly kind?: string; readonly options?: Record<string, unknown> };
}

export interface ICard {
	readonly id: string;
	readonly title?: string;
	readonly inView?: 'full' | 'partial' | 'none';
	readonly visibleFraction?: number;
	readonly activeTab?: string;
	readonly tabs?: ReadonlyArray<{ readonly key: string; readonly label?: string; readonly componentId?: string }>;
}

export interface IAppState {
	readonly protocol?: number;
	readonly app?: { readonly name?: string; readonly version?: string };
	readonly page?: { readonly id: string; readonly title?: string; readonly section?: string };
	readonly viewport?: { readonly scrollTop?: number; readonly height?: number; readonly pageHeight?: number };
	readonly cards?: readonly ICard[];
	readonly components?: readonly IComponent[];
	readonly filters?: Record<string, unknown>;
	readonly dataset?: { readonly path?: string; readonly country?: string; readonly revision?: number; readonly adjusted?: boolean };
	readonly actions?: ReadonlyArray<{ readonly name: string; readonly kind: string; readonly description?: string }>;
}

export interface IAppReply {
	readonly ok: boolean;
	readonly result?: unknown;
	readonly error?: string;
}

/** This extension's open app tabs. */
export async function countdownTabs(): Promise<ITab[]> {
	try {
		const tabs = await vscode.commands.executeCommand<ITab[]>('datasuite.shinyApps.listTabs');
		return (tabs ?? []).filter(tab => tab.extensionId?.toLowerCase() === EXTENSION_ID);
	} catch {
		return [];
	}
}

/** The tab asked for, else the active Countdown tab, else the only one; an error message when none fits. */
export async function pickTab(tabId?: string): Promise<ITab | string> {
	const tabs = await countdownTabs();
	if (!tabs.length) {
		return 'No Countdown app is open. Open a dataset in RMNCAH, Vaxx or Pooled (or use countdown_open_dataset) first.';
	}
	if (tabId) {
		return tabs.find(tab => tab.tabId === tabId) ?? `No open Countdown tab "${tabId}". Open tabs: ${tabs.map(describeTab).join('; ')}.`;
	}
	return tabs.find(tab => tab.active) ?? (tabs.length === 1 ? tabs[0] : `Several Countdown tabs are open and none is active; pass tabId. Open tabs: ${tabs.map(describeTab).join('; ')}.`);
}

export function describeTab(tab: ITab): string {
	return `${tab.tabId} (${tab.title ?? tab.localId}${tab.file ? `, ${path.basename(tab.file)}` : ''})`;
}

export async function appState(tab: ITab): Promise<IAppState | undefined> {
	try {
		return (await vscode.commands.executeCommand<IAppState | null>('datasuite.shinyApps.getState', tab.tabId)) ?? undefined;
	} catch {
		return undefined;
	}
}

/** An action in the app; change actions go through the user's aiAppControl setting on DataSuite's side. */
export async function appRequest(tab: ITab, action: string, args: Record<string, unknown>, options?: { confirmed?: boolean; plan?: boolean }): Promise<IAppReply> {
	try {
		return (await vscode.commands.executeCommand<IAppReply>('datasuite.shinyApps.request', tab.tabId, action, args, options)) ?? { ok: false, error: 'DataSuite did not answer.' };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * What an app change would do, without doing it: its level (`view`, `add`, `replace`), a sentence for the user and
 * what the user's setting says (`run`, `confirm` in the chat, or `refuse`). `undefined` when DataSuite can't say (an
 * older DataSuite, no bridge): the change then goes through DataSuite's own dialog.
 */
export interface IAppPlan {
	readonly level: string;
	readonly summary: string;
	readonly policy: 'run' | 'confirm' | 'refuse';
}

export async function appPlan(tab: ITab, action: string, args: Record<string, unknown>): Promise<IAppPlan | undefined> {
	const reply = await appRequest(tab, action, args, { plan: true });
	const plan = reply.ok ? reply.result as Partial<IAppPlan> | undefined : undefined;
	return plan && typeof plan.summary === 'string' && (plan.policy === 'run' || plan.policy === 'confirm' || plan.policy === 'refuse')
		? { level: String(plan.level), summary: plan.summary, policy: plan.policy }
		: undefined;
}

/** The dataset a tab works on: the bridge's dataset path (the saved .rds), else the tab's file when it is an .rds. */
export function tabDataset(tab: ITab, state: IAppState | undefined): { path: string; revision?: number } | undefined {
	const saved = state?.dataset?.path;
	if (saved) {
		return { path: saved, revision: state?.dataset?.revision };
	}
	if (tab.file && tab.file.toLowerCase().endsWith('.rds')) {
		return { path: tab.file };
	}
	return undefined;
}

/**
 * The tab's analysis folder, where AI-written files go. DataSuite names it after the app's saved file
 * (`<stem>_rmncah.shiny-workspace`, `<stem>_vaccine.shiny-workspace`), so RMNCAH and Vaxx on the same data file keep
 * their work apart; an older DataSuite that doesn't say gets `<stem>.shiny-workspace` next to the tab's file.
 */
export function workspaceDir(tab: ITab): string | undefined {
	if (tab.workspaceDir) {
		return tab.workspaceDir;
	}
	if (!tab.file) {
		return undefined;
	}
	const stem = path.basename(tab.file).replace(/\.[^.]+$/, '');
	return path.join(path.dirname(tab.file), `${stem}.shiny-workspace`);
}
