/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Uploading a file to DataSuite.Api in resumable pieces (the tus protocol, https://tus.io/protocols/resumable-upload),
// then submitting it as a version of one of a country's submission items. No vscode here: the commands (submit.ts)
// bring the token and show the progress, and the tests run this against a stand-in server.
//
// The protocol, as the Api serves it at {api}/data/submit/uploads: POST creates the upload (Upload-Length, and the
// metadata `filename` and `sha256`), PATCH sends a piece at Upload-Offset, HEAD says how far it got -- so a dropped
// connection resumes from there instead of starting again. Then POST {upload}/version submits it; the Api compares the
// SHA-256 sent at the start with what arrived, so a file changed on the way is refused.

import { createHash } from 'crypto';
import * as fs from 'fs';

/** 8 MB a piece: well under Cloudflare's 100 MB per request, and little to send again when one fails. */
export const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;

/** How often a failed piece is tried again (after asking where to resume) before the upload gives up. */
export const DEFAULT_RETRIES = 5;

const TUS_VERSION = '1.0.0';

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface IUploadOptions {
	/** `{api}/data/submit/uploads` */
	readonly endpoint: string;
	readonly token: string;
	readonly filePath: string;
	/** The name the submission keeps; the file's own by default. */
	readonly fileName: string;
	readonly sha256: string;
	readonly chunkBytes?: number;
	readonly retries?: number;
	readonly onProgress?: (sentBytes: number, totalBytes: number) => void;
	readonly signal?: AbortSignal;
	/** For the tests; the global fetch otherwise. */
	readonly fetch?: Fetch;
	/** Waits between tries (ms); for the tests. */
	readonly backoff?: (attempt: number) => number;
}

/** Where a finished upload is submitted: the country's submission item (and the day of a daily one). */
export interface ISubmitTarget {
	readonly countryCycleId: string;
	readonly activityItemId: string;
	readonly day?: number | null;
	readonly note?: string | null;
	/** Where the file came from (for a DHIS2 download, `IDhis2Provenance`), shown to the reviewers. */
	readonly provenance?: Readonly<Record<string, unknown>> | null;
}

export class UploadError extends Error {
	constructor(message: string, readonly status?: number) {
		super(message);
	}
}

/** The SHA-256 of a file, lower-case hex, read as a stream (a DHIS2 download can be large). */
export async function sha256File(filePath: string): Promise<string> {
	const hash = createHash('sha256');
	for await (const piece of fs.createReadStream(filePath)) {
		hash.update(piece as Buffer);
	}
	return hash.digest('hex');
}

/** Uploads the file in pieces, resuming after a failed one; the upload's address, ready to submit. */
export async function uploadFile(options: IUploadOptions): Promise<string> {
	const fetchFn = options.fetch ?? fetch;
	const size = (await fs.promises.stat(options.filePath)).size;
	const chunk = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
	const retries = options.retries ?? DEFAULT_RETRIES;
	const backoff = options.backoff ?? (attempt => Math.min(30_000, 1000 * 2 ** attempt));

	const created = await fetchFn(options.endpoint, {
		method: 'POST',
		headers: {
			...headers(options.token),
			'Upload-Length': String(size),
			'Upload-Metadata': `filename ${base64(options.fileName)},sha256 ${base64(options.sha256)}`,
		},
		signal: options.signal,
	});
	if (created.status !== 201) {
		throw new UploadError(`The upload couldn't be started: ${await problem(created)}`, created.status);
	}
	const location = new URL(created.headers.get('Location') ?? '', options.endpoint).toString();

	const file = await fs.promises.open(options.filePath, 'r');
	try {
		let offset = 0;
		let failures = 0;
		options.onProgress?.(0, size);
		while (offset < size) {
			const length = Math.min(chunk, size - offset);
			const piece = Buffer.alloc(length);
			await file.read(piece, 0, length, offset);
			try {
				const sent = await fetchFn(location, {
					method: 'PATCH',
					headers: { ...headers(options.token), 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
					body: piece,
					signal: options.signal,
				});
				if (sent.status !== 204) {
					throw new UploadError(`A piece was refused: ${await problem(sent)}`, sent.status);
				}
				offset = Number(sent.headers.get('Upload-Offset') ?? offset + length);
				failures = 0;
				options.onProgress?.(offset, size);
			} catch (error) {
				// a refusal that won't change (no such upload, too large, not allowed) isn't tried again
				if (options.signal?.aborted || (error instanceof UploadError && error.status !== undefined && error.status < 500 && error.status !== 409)) {
					throw error;
				}
				if (++failures > retries) {
					throw new UploadError(`The upload stopped after ${retries} tries: ${messageOf(error)}`);
				}
				await delay(backoff(failures), options.signal);
				offset = await resumeAt(fetchFn, location, options.token, options.signal) ?? offset;
			}
		}
		return location;
	} finally {
		await file.close();
	}
}

/** Submits a finished upload as a version of `target`; the submission's id. */
export async function submitUpload(location: string, token: string, target: ISubmitTarget, fetchFn: Fetch = fetch, signal?: AbortSignal): Promise<string> {
	const response = await fetchFn(`${location.replace(/\/+$/, '')}/version`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ countryCycleId: target.countryCycleId, activityItemId: target.activityItemId, day: target.day ?? null, note: target.note ?? null, provenance: target.provenance ?? null }),
		signal,
	});
	if (response.status !== 201) {
		throw new UploadError(await problem(response), response.status);
	}
	// "/data/process/items/{id}"
	return (response.headers.get('Location') ?? '').split('/').pop() ?? '';
}

/** How far the server has the upload (HEAD), when it answers. */
async function resumeAt(fetchFn: Fetch, location: string, token: string, signal?: AbortSignal): Promise<number | undefined> {
	try {
		const head = await fetchFn(location, { method: 'HEAD', headers: headers(token), signal });
		const offset = head.ok ? head.headers.get('Upload-Offset') : null;
		return offset === null ? undefined : Number(offset);
	} catch {
		return undefined;
	}
}

function headers(token: string): Record<string, string> {
	return { Authorization: `Bearer ${token}`, 'Tus-Resumable': TUS_VERSION };
}

function base64(value: string): string {
	return Buffer.from(value, 'utf8').toString('base64');
}

/** What the server said: a problem's detail or errors, a result's error, else the status. */
async function problem(response: Response): Promise<string> {
	try {
		const text = await response.text();
		try {
			const body = JSON.parse(text) as { detail?: string; title?: string; errors?: Record<string, string[]>; error?: { description?: string } };
			const errors = body.errors ? Object.values(body.errors).flat().join(' ') : '';
			return body.detail || errors || body.error?.description || body.title || `${response.status} ${response.statusText}`;
		} catch {
			return text.trim() || `${response.status} ${response.statusText}`;
		}
	} catch {
		return `${response.status} ${response.statusText}`;
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
	});
}
