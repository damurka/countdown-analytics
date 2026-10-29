/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Submitting a country's data to DataSuite from the editor: Submit to DataSuite (on a file, or from the command
// palette) lists what the signed-in uploader has to submit -- the open activities of their country
// (GetMyDataProcessQuery) and each one's items (GetCountryCycleDetailQuery) -- and uploads the file to the chosen one
// in resumable pieces (tusUpload.ts). Other extensions (the Data Extractor) call the same through this extension's
// exports: `submitFile` (choose with the user) and `uploadToSubmission` (a known item).
//
// It signs in with the DataSuite data client and the `data_submit` scope: its own session beside the Datasets
// panel's (data_read). The scope only gets the request in: the Api lets only the country's own uploaders submit.

import * as path from 'path';
import * as vscode from 'vscode';
import { sha256File, submitUpload, uploadFile, UploadError } from './tusUpload';

const AUTH_PROVIDER_ID = 'datasuite';
const SUBMIT_SCOPES = ['openid', 'profile', 'data_submit', 'offline_access'];
const DEFAULT_API_URL = 'https://datasuite.damurka.com/api';

/** `MyActivityDto`, as far as this uses it. */
interface IMyActivity {
	readonly countryCycleId: string;
	readonly cycleName: string;
	readonly countryName: string;
	readonly activityId: string;
	readonly activityName: string;
	readonly dueAtUtc: string;
	readonly canSubmit: boolean;
}

/** `SlotDto`: one submission the country makes (an item, for a day of a daily one). */
interface ISlot {
	readonly itemId: string;
	readonly itemName: string;
	readonly day: number | null;
	readonly isRequired: boolean;
	readonly allowedExtensions: readonly string[];
	readonly deadlineUtc: string;
	readonly status: string;
}

interface ICountryActivity {
	readonly activity: { readonly id: string; readonly name: string; readonly phase: string };
	readonly slots: readonly ISlot[];
}

/** Where a file can be submitted: an activity's item in a country's cycle. */
export interface ISubmissionTarget {
	readonly countryCycleId: string;
	readonly activityItemId: string;
	readonly day?: number | null;
	/** For the user: "Kenya · Cycle 2026 · Data retrieval: Completed workbook". */
	readonly label: string;
	readonly allowedExtensions: readonly string[];
}

/** What other extensions get (`vscode.extensions.getExtension('countdown.countdown-analytics').exports`). */
export interface ICountdownSubmitApi {
	/** Lets the user choose where `filePath` goes (only items taking its file type), then uploads it with progress. The
	 * submission's id, or undefined when they cancelled. */
	submitFile(filePath: string, options?: { note?: string }): Promise<string | undefined>;
	/** Uploads `filePath` to a known item, with progress; the submission's id. */
	uploadToSubmission(filePath: string, target: Omit<ISubmissionTarget, 'label' | 'allowedExtensions'> & { note?: string }): Promise<string>;
	/** Where the signed-in uploader can submit now. */
	listTargets(): Promise<ISubmissionTarget[]>;
	/** Submits `mappingJson` (the DHIS2 server, the district level, each indicator's sources: SubmitCountryMappingCommand)
	 * as a new version of the uploader's country's mapping, choosing the country with the user when they upload for
	 * more than one. The version's number, or undefined when they cancelled. */
	submitCountryMapping(mappingJson: string, options?: { note?: string }): Promise<number | undefined>;
	/** A country's mapping as DataSuite has it (GetCountryMappingQuery): the version in force, if any, and the latest. */
	countryMapping(countryId: number): Promise<ICountryMapping>;
}

/** `CountryMappingDto`, as far as the extensions use it. */
export interface ICountryMapping {
	readonly countryId: number;
	readonly countryName: string;
	readonly status: string;
	readonly inForce: IMappingVersion | null;
	readonly versions: readonly IMappingVersion[];
	readonly abilities: { readonly canSubmit: boolean; readonly canReviewCountry: boolean; readonly canReviewGlobal: boolean };
}

export interface IMappingVersion {
	readonly number: number;
	readonly dhis2Url: string;
	readonly districtLevel: number;
	readonly sha256: string;
	readonly indicators: readonly { readonly code: string; readonly sources: readonly { readonly uid: string; readonly type: string; readonly name: string | null; readonly categoryOptionCombos: readonly string[] }[]; readonly notAvailable: string | null }[] | null;
}

/** States a submission takes no new version in: the data supervisor has it, or it is approved (locked). */
const CLOSED_STATUSES = new Set(['GlobalReview', 'Approved', 'Published']);

export class Submissions implements ICountdownSubmitApi {
	register(): vscode.Disposable[] {
		return [
			vscode.commands.registerCommand('countdown.submit.file', async (uri?: vscode.Uri) => {
				const filePath = uri?.fsPath ?? (await pickFile());
				if (!filePath) {
					return;
				}
				try {
					const id = await this.submitFile(filePath);
					if (id) {
						void vscode.window.showInformationMessage(`${path.basename(filePath)} was submitted to DataSuite. Its review starts now.`);
					}
				} catch (error) {
					void vscode.window.showErrorMessage(`The file wasn't submitted: ${messageOf(error)}`);
				}
			}),
		];
	}

	async submitFile(filePath: string, options?: { note?: string }): Promise<string | undefined> {
		const extension = path.extname(filePath).toLowerCase();
		const all = await this.listTargets(true);
		const targets = all.filter(t => t.allowedExtensions.length === 0 || t.allowedExtensions.includes(extension));
		if (targets.length === 0) {
			throw new UploadError(all.length === 0
				? 'Nothing is open for you to submit. Only a country\'s uploaders submit, while its activity is open.'
				: `None of your open items takes ${extension || 'this'} files.`);
		}
		const chosen = await vscode.window.showQuickPick(targets.map(t => ({ label: t.label, description: t.allowedExtensions.join(', '), target: t })),
			{ title: `Submit ${path.basename(filePath)} to DataSuite`, placeHolder: 'Where it goes' });
		if (!chosen) {
			return undefined;
		}
		const note = options?.note ?? await vscode.window.showInputBox({ title: 'A note for the reviewers (optional)', prompt: 'What this version is, or what changed' });
		return this.uploadToSubmission(filePath, { ...chosen.target, note: note || undefined });
	}

	async uploadToSubmission(filePath: string, target: Omit<ISubmissionTarget, 'label' | 'allowedExtensions'> & { note?: string }): Promise<string> {
		const session = await this.session(true);
		const fileName = path.basename(filePath);
		return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Submitting ${fileName}`, cancellable: true }, async (progress, cancel) => {
			const controller = new AbortController();
			cancel.onCancellationRequested(() => controller.abort());
			progress.report({ message: 'Fingerprinting the file…' });
			const sha256 = await sha256File(filePath);
			let reported = 0;
			const location = await uploadFile({
				endpoint: `${apiUrl()}/data/submit/uploads`, token: session.accessToken, filePath, fileName, sha256, signal: controller.signal,
				onProgress: (sent, total) => {
					const percent = total === 0 ? 100 : Math.floor((sent / total) * 100);
					progress.report({ increment: percent - reported, message: `${percent}%` });
					reported = percent;
				},
			});
			progress.report({ message: 'Checking it on the server…' });
			return submitUpload(location, session.accessToken, target, fetch, controller.signal);
		});
	}

	async listTargets(interactive = false): Promise<ISubmissionTarget[]> {
		const session = await this.session(interactive);
		const mine = await this.request<{ openActivities: IMyActivity[] }>(session, 'GetMyDataProcessQuery', {});
		const targets: ISubmissionTarget[] = [];
		for (const countryCycleId of [...new Set(mine.openActivities.filter(a => a.canSubmit).map(a => a.countryCycleId))]) {
			const detail = await this.request<{ isSuccess: boolean; value?: { cycleName: string; countryName: string; abilities: { canSubmit: boolean }; activities: ICountryActivity[] } }>(
				session, 'GetCountryCycleDetailQuery', { countryCycleId });
			const value = detail.value;
			if (!detail.isSuccess || !value?.abilities.canSubmit) {
				continue;
			}
			for (const activity of value.activities.filter(a => a.activity.phase === 'Open')) {
				for (const slot of activity.slots.filter(s => !CLOSED_STATUSES.has(s.status))) {
					targets.push({
						countryCycleId, activityItemId: slot.itemId, day: slot.day,
						label: `${value.countryName} · ${value.cycleName} · ${activity.activity.name}: ${slot.itemName}${slot.day ? `, day ${slot.day}` : ''}`,
						allowedExtensions: slot.allowedExtensions.map(e => e.toLowerCase()),
					});
				}
			}
		}
		return targets;
	}

	async submitCountryMapping(mappingJson: string, options?: { note?: string }): Promise<number | undefined> {
		const session = await this.session(true);
		const countries = await this.request<{ countryId: number; countryName: string }[]>(session, 'ListCountryMappingsQuery', {});
		const mine: ICountryMapping[] = [];
		for (const country of countries) {
			const mapping = await this.countryMappingWith(session, country.countryId);
			if (mapping.abilities.canSubmit) {
				mine.push(mapping);
			}
		}
		if (mine.length === 0) {
			throw new UploadError("You don't upload for any country, so you can't submit its mapping. Ask your country's administrator to make you an uploader.");
		}
		const country = mine.length === 1 ? mine[0] : (await vscode.window.showQuickPick(mine.map(m => ({ label: m.countryName, description: m.inForce ? `v${m.inForce.number} in force` : 'none in force', mapping: m })),
			{ title: 'Submit the mapping for which country?' }))?.mapping;
		if (!country) {
			return undefined;
		}
		const result = await this.request<{ isSuccess: boolean; value?: number; error?: { description?: string } }>(session, 'SubmitCountryMappingCommand',
			{ countryId: country.countryId, mappingJson, note: options?.note ?? null });
		if (!result.isSuccess) {
			throw new UploadError(result.error?.description ?? 'DataSuite refused the mapping.');
		}
		return result.value;
	}

	async countryMapping(countryId: number): Promise<ICountryMapping> {
		return this.countryMappingWith(await this.session(true), countryId);
	}

	private async countryMappingWith(session: vscode.AuthenticationSession, countryId: number): Promise<ICountryMapping> {
		const result = await this.request<{ isSuccess: boolean; value?: ICountryMapping; error?: { description?: string } }>(session, 'GetCountryMappingQuery', { countryId });
		if (!result.isSuccess || !result.value) {
			throw new UploadError(result.error?.description ?? "The country's mapping could not be read.");
		}
		return result.value;
	}

	private async session(create: boolean): Promise<vscode.AuthenticationSession> {
		const session = create
			? await vscode.authentication.getSession(AUTH_PROVIDER_ID, SUBMIT_SCOPES, { createIfNone: { detail: 'Sign in to submit your country\'s data to DataSuite.' } })
			: await vscode.authentication.getSession(AUTH_PROVIDER_ID, SUBMIT_SCOPES, { silent: true });
		if (!session) {
			throw new UploadError('Sign in to DataSuite first (Submit to DataSuite asks for it).');
		}
		return session;
	}

	/** One of the Api's requests (POST {api}/manage/{name}) with the submit session's token. */
	private async request<T>(session: vscode.AuthenticationSession, name: string, body: unknown): Promise<T> {
		const response = await fetch(`${apiUrl()}/manage/${name}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		if (response.status === 401) {
			throw new UploadError('Your DataSuite sign-in has ended. Sign in again.', 401);
		}
		if (response.status === 403) {
			throw new UploadError('Your DataSuite account can\'t submit Countdown data. Ask your country\'s administrator to make you an uploader.', 403);
		}
		if (!response.ok) {
			throw new UploadError(`DataSuite answered ${response.status} to ${name}.`, response.status);
		}
		return await response.json() as T;
	}
}

/** The Datasets panel's Api address setting, so one setting points both at a test server. */
function apiUrl(): string {
	const configured = vscode.workspace.getConfiguration('countdown.datasets').get<string>('apiUrl');
	return (configured || DEFAULT_API_URL).replace(/\/+$/, '');
}

async function pickFile(): Promise<string | undefined> {
	const picked = await vscode.window.showOpenDialog({ title: 'Submit to DataSuite', openLabel: 'Submit', canSelectMany: false });
	return picked?.[0]?.fsPath;
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
