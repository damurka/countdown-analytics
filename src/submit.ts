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
// Submit Analysis to DataSuite uploads the .rds and the report together, each with the fingerprints of the data files
// they were made from (`IAnalysisProvenance`): DataSuite warns the reviewer when those aren't the country's approved
// DHIS2 data and additional data.
//
// It signs in with the DataSuite data client and the `data_submit` scope: its own session beside the Datasets
// panel's (data_read). The scope only gets the request in: the Api lets only the country's own uploaders submit.

import { randomUUID } from 'crypto';
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
	readonly submissionId: string | null;
	readonly itemRole?: string;
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
	/** What the item is in the data process: Dhis2Data, AdditionalData, Analysis or Other. */
	readonly role: string;
}

/** Where a DHIS2 download came from, sent with it and shown to the reviewers. */
export interface IDhis2Provenance {
	readonly source: 'dhis2';
	readonly dhis2Url: string;
	/** The country's mapping version in DataSuite it was extracted with, and its fingerprint: null when there is none
	 * for its server. `mappingDifferences`: how the mapping used differs from that version (none: it is that version). */
	readonly mappingVersion: number | null;
	readonly mappingSha256: string | null;
	readonly mappingDifferences: readonly string[];
	readonly districtLevel: number;
	/** DHIS2 periods, e.g. "202401" and "202412". */
	readonly startPeriod: string;
	readonly endPeriod: string;
	readonly extractedAtUtc: string;
	readonly tool: string;
}

/** What an analysis (the .rds or the report) was made from, sent with it: the data files' fingerprints, and the
 * bundle the .rds and report submitted together share. */
export interface IAnalysisProvenance {
	readonly source: 'countdown-analysis';
	readonly inputs: readonly { readonly fileName: string; readonly sha256: string }[];
	readonly bundle: string;
	readonly tool: string;
}

/** A country's DHIS2 data in DataSuite: a submission of a DHIS2 data item. */
export interface IDhis2Submission {
	readonly submissionId: string;
	readonly countryCycleId: string;
	/** "Kenya · Cycle 2026 · Data retrieval: DHIS2 data". */
	readonly label: string;
	readonly status: string;
}

/** `MissingDataDto`: what the DHIS2 data lacks, once its waiting days after the checks are over (`ready`). */
export interface IMissingData {
	readonly itemId: string;
	readonly versionNumber: number;
	readonly availableFromUtc: string;
	readonly ready: boolean;
	readonly count: number;
	readonly truncated: boolean;
	readonly cells: readonly { readonly indicator: string; readonly district: string; readonly year: number; readonly month: number }[];
}

/** What other extensions get (`vscode.extensions.getExtension('datasuite.countdown-analytics').exports`). */
export interface ICountdownSubmitApi {
	/** Lets the user choose where `filePath` goes (only items taking its file type), then uploads it with progress. The
	 * submission's id, or undefined when they cancelled. */
	submitFile(filePath: string, options?: { note?: string }): Promise<string | undefined>;
	/** Uploads `filePath` to a known item, with progress; the submission's id. */
	uploadToSubmission(filePath: string, target: Omit<ISubmissionTarget, 'label' | 'allowedExtensions' | 'role'> & { note?: string; provenance?: Readonly<Record<string, unknown>> }): Promise<string>;
	/** Where the signed-in uploader can submit now. */
	listTargets(): Promise<ISubmissionTarget[]>;
	/** Uploads a DHIS2 download (`filePath`) as the country's DHIS2 data, with where it came from, choosing the item with
	 * the user when more than one is open. The submission's id, or undefined when they cancelled. */
	submitDhis2Data(filePath: string, provenance: IDhis2Provenance, options?: { note?: string }): Promise<string | undefined>;
	/** Uploads an analysis -- the .rds and, with it, the report -- to the analysis items, each with the fingerprints of
	 * `inputPaths`, the data files it was made from. The submissions' ids; none when the user cancelled. */
	submitAnalysis(files: readonly string[], inputPaths: readonly string[], options?: { note?: string }): Promise<string[]>;
	/** The country's DHIS2 data submitted so far, in the uploader's open activities. */
	listDhis2Data(): Promise<IDhis2Submission[]>;
	/** What a DHIS2 data submission lacks (GetMissingDataQuery), for the missing-data template. */
	missingData(submissionId: string): Promise<IMissingData>;
	/** Submits `mappingJson` (the DHIS2 server, the district level, each indicator's sources: SubmitCountryMappingCommand)
	 * as a new version of the uploader's country's mapping, choosing the country with the user when they upload for
	 * more than one. The version's number, or undefined when they cancelled. */
	submitCountryMapping(mappingJson: string, options?: { note?: string }): Promise<number | undefined>;
	/** A country's mapping as DataSuite has it (GetCountryMappingQuery): the version in force, if any, and the latest. */
	countryMapping(countryId: number): Promise<ICountryMapping>;
	/** The mappings of the countries the signed-in user uploads for. */
	myCountryMappings(): Promise<ICountryMapping[]>;
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
			vscode.commands.registerCommand('countdown.submit.analysis', async () => {
				try {
					const files = await vscode.window.showOpenDialog({ title: 'Submit which analysis? The .rds, and the report made with it', canSelectMany: true, openLabel: 'Submit These',
						filters: { 'Analysis and report': ['rds', 'docx', 'pdf', 'html'] } });
					if (!files?.length) {
						return;
					}
					const inputs = await vscode.window.showOpenDialog({ title: 'Which data files was it made from? (the DHIS2 data and the additional data)', canSelectMany: true, openLabel: 'Made From These',
						filters: { 'Countdown data': ['xlsx', 'xls', 'csv'] } });
					if (!inputs?.length) {
						return;
					}
					const ids = await this.submitAnalysis(files.map(f => f.fsPath), inputs.map(f => f.fsPath));
					if (ids.length > 0) {
						void vscode.window.showInformationMessage(`The analysis (${ids.length} file${ids.length === 1 ? '' : 's'}) was submitted to DataSuite. Its review starts now.`);
					}
				} catch (error) {
					void vscode.window.showErrorMessage(`The analysis wasn't submitted: ${messageOf(error)}`);
				}
			}),
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

	async uploadToSubmission(filePath: string, target: Omit<ISubmissionTarget, 'label' | 'allowedExtensions' | 'role'> & { note?: string; provenance?: Readonly<Record<string, unknown>> }): Promise<string> {
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

	async submitDhis2Data(filePath: string, provenance: IDhis2Provenance, options?: { note?: string }): Promise<string | undefined> {
		const extension = path.extname(filePath).toLowerCase();
		const targets = (await this.listTargets(true)).filter(t => t.role === 'Dhis2Data' && (t.allowedExtensions.length === 0 || t.allowedExtensions.includes(extension)));
		if (targets.length === 0) {
			throw new UploadError("No activity open for you takes the country's DHIS2 data now. Only a country's uploaders submit it, while its activity is open.");
		}
		const target = targets.length === 1 ? targets[0]
			: (await vscode.window.showQuickPick(targets.map(t => ({ label: t.label, target: t })), { title: 'Submit the DHIS2 data where?' }))?.target;
		if (!target) {
			return undefined;
		}
		return this.uploadToSubmission(filePath, { ...target, note: options?.note, provenance: { ...provenance } });
	}

	async submitAnalysis(files: readonly string[], inputPaths: readonly string[], options?: { note?: string }): Promise<string[]> {
		if (inputPaths.length === 0) {
			throw new UploadError('Say which data files the analysis was made from: DataSuite checks them against the approved data.');
		}
		const targets = (await this.listTargets(true)).filter(t => t.role === 'Analysis');
		if (targets.length === 0) {
			throw new UploadError("No activity open for you takes the analysis now. Only a country's uploaders submit it, while its activity is open.");
		}
		// each file to an analysis item that takes its type, the user choosing when more than one does
		const plan: { file: string; target: ISubmissionTarget }[] = [];
		for (const file of files) {
			const extension = path.extname(file).toLowerCase();
			const fits = targets.filter(t => (t.allowedExtensions.length === 0 || t.allowedExtensions.includes(extension)) && !plan.some(p => p.target === t));
			if (fits.length === 0) {
				throw new UploadError(`None of your open analysis items takes ${path.basename(file)} (${extension || 'no type'}).`);
			}
			const target = fits.length === 1 ? fits[0]
				: (await vscode.window.showQuickPick(fits.map(t => ({ label: t.label, description: t.allowedExtensions.join(', '), target: t })), { title: `Submit ${path.basename(file)} where?` }))?.target;
			if (!target) {
				return [];
			}
			plan.push({ file, target });
		}
		const note = options?.note ?? await vscode.window.showInputBox({ title: 'A note for the reviewers (optional)', prompt: 'What this analysis is, or what changed' });
		const provenance: IAnalysisProvenance = {
			source: 'countdown-analysis',
			inputs: await Promise.all(inputPaths.map(async p => ({ fileName: path.basename(p), sha256: await sha256File(p) }))),
			bundle: randomUUID(),
			tool: `Countdown Analytics ${vscode.extensions.getExtension('datasuite.countdown-analytics')?.packageJSON?.version ?? ''}`.trim(),
		};
		const ids: string[] = [];
		for (const { file, target } of plan) {
			ids.push(await this.uploadToSubmission(file, { ...target, note: note || undefined, provenance: { ...provenance } }));
		}
		return ids;
	}

	async listDhis2Data(): Promise<IDhis2Submission[]> {
		const session = await this.session(true);
		const mine = await this.request<{ countries: { countryCycleId: string }[] }>(session, 'GetMyDataProcessQuery', {});
		const found: IDhis2Submission[] = [];
		for (const { countryCycleId } of mine.countries) {
			const detail = await this.request<{ isSuccess: boolean; value?: { cycleName: string; countryName: string; activities: ICountryActivity[] } }>(
				session, 'GetCountryCycleDetailQuery', { countryCycleId });
			for (const activity of detail.isSuccess ? detail.value?.activities ?? [] : []) {
				for (const slot of activity.slots.filter(s => s.itemRole === 'Dhis2Data' && s.submissionId)) {
					found.push({
						submissionId: slot.submissionId!, countryCycleId, status: slot.status,
						label: `${detail.value!.countryName} · ${detail.value!.cycleName} · ${activity.activity.name}: ${slot.itemName}`,
					});
				}
			}
		}
		return found;
	}

	async missingData(submissionId: string): Promise<IMissingData> {
		const result = await this.request<{ isSuccess: boolean; value?: IMissingData; error?: { description?: string } }>(
			await this.session(true), 'GetMissingDataQuery', { itemId: submissionId });
		if (!result.isSuccess || !result.value) {
			throw new UploadError(result.error?.description ?? 'What the DHIS2 data lacks could not be read.');
		}
		return result.value;
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
						role: slot.itemRole ?? 'Other',
					});
				}
			}
		}
		return targets;
	}

	async myCountryMappings(): Promise<ICountryMapping[]> {
		const session = await this.session(true);
		const countries = await this.request<{ countryId: number; countryName: string }[]>(session, 'ListCountryMappingsQuery', {});
		const mine: ICountryMapping[] = [];
		for (const country of countries) {
			const mapping = await this.countryMappingWith(session, country.countryId);
			if (mapping.abilities.canSubmit) {
				mine.push(mapping);
			}
		}
		return mine;
	}

	async submitCountryMapping(mappingJson: string, options?: { note?: string }): Promise<number | undefined> {
		const session = await this.session(true);
		const mine = await this.myCountryMappings();
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
