/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// npm test: against a stand-in of the Api's tus endpoint (in memory), no network and no vscode.

import * as assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it } from 'node:test';
import { Fetch, sha256File, submitUpload, uploadFile, UploadError } from '../tusUpload';

const ENDPOINT = 'https://datasuite.test/api/data/submit/uploads';

/** The Api's tus endpoint, as far as the client uses it: one upload; `dropAfter` PATCHes, one fails as a dropped
 * connection would (after the server kept half of it). */
function standIn(options: { dropAfter?: number; refuseCreate?: number } = {}) {
	const state = { received: Buffer.alloc(0), length: 0, metadata: '', patches: 0, heads: 0, submitted: undefined as unknown, tokens: new Set<string>() };
	const fetchFn: Fetch = async (url, init) => {
		state.tokens.add(String((init.headers as Record<string, string>).Authorization));
		const method = init.method ?? 'GET';
		if (method === 'POST' && url === ENDPOINT) {
			if (options.refuseCreate) {
				return new Response(JSON.stringify({ detail: 'Send the file\'s SHA-256.' }), { status: options.refuseCreate });
			}
			state.length = Number((init.headers as Record<string, string>)['Upload-Length']);
			state.metadata = (init.headers as Record<string, string>)['Upload-Metadata'];
			return new Response(null, { status: 201, headers: { Location: '/api/data/submit/uploads/abc123' } });
		}
		if (method === 'PATCH') {
			state.patches++;
			const offset = Number((init.headers as Record<string, string>)['Upload-Offset']);
			if (offset !== state.received.length) {
				return new Response(null, { status: 409 });
			}
			const piece = init.body as Buffer;
			if (options.dropAfter !== undefined && state.patches === options.dropAfter + 1) {
				state.received = Buffer.concat([state.received, piece.subarray(0, Math.floor(piece.length / 2))]);
				throw new TypeError('fetch failed');
			}
			state.received = Buffer.concat([state.received, piece]);
			return new Response(null, { status: 204, headers: { 'Upload-Offset': String(state.received.length) } });
		}
		if (method === 'HEAD') {
			state.heads++;
			return new Response(null, { status: 200, headers: { 'Upload-Offset': String(state.received.length) } });
		}
		if (method === 'POST' && url.endsWith('/abc123/version')) {
			state.submitted = JSON.parse(String(init.body));
			return new Response(null, { status: 201, headers: { Location: '/data/process/items/item-1' } });
		}
		return new Response(null, { status: 404 });
	};
	return { state, fetchFn };
}

function aFile(bytes: number): string {
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tus-test-')), 'kenya.csv');
	fs.writeFileSync(file, Buffer.from(Array.from({ length: bytes }, (_, i) => i % 251)));
	return file;
}

describe('uploadFile', () => {
	it('sends the file in pieces with its name and fingerprint, and resumes where a dropped piece stopped', async () => {
		const file = aFile(25_000);
		const sha256 = await sha256File(file);
		const { state, fetchFn } = standIn({ dropAfter: 1 });
		const progress: number[] = [];

		const location = await uploadFile({ endpoint: ENDPOINT, token: 'tok', filePath: file, fileName: 'kenya.csv', sha256, chunkBytes: 10_000, fetch: fetchFn, backoff: () => 0, onProgress: sent => progress.push(sent) });

		assert.strictEqual(location, 'https://datasuite.test/api/data/submit/uploads/abc123');
		assert.ok(state.received.equals(fs.readFileSync(file)), 'the whole file, once');
		assert.strictEqual(state.heads, 1, 'asked where to resume after the drop');
		assert.strictEqual(state.metadata, `filename ${Buffer.from('kenya.csv').toString('base64')},sha256 ${Buffer.from(sha256).toString('base64')}`);
		assert.strictEqual(progress[progress.length - 1], 25_000);
		assert.deepStrictEqual([...state.tokens], ['Bearer tok']);
	});

	it('gives up after its tries when the connection keeps failing', async () => {
		const file = aFile(100);
		const fetchFn: Fetch = async (_url, init) => init.method === 'POST'
			? new Response(null, { status: 201, headers: { Location: '/x/1' } })
			: Promise.reject(new TypeError('fetch failed'));

		await assert.rejects(uploadFile({ endpoint: ENDPOINT, token: 't', filePath: file, fileName: 'a.csv', sha256: 'a'.repeat(64), fetch: fetchFn, retries: 2, backoff: () => 0 }),
			/stopped after 2 tries/);
	});

	it('says why the server refused to start it', async () => {
		const { fetchFn } = standIn({ refuseCreate: 400 });
		await assert.rejects(uploadFile({ endpoint: ENDPOINT, token: 't', filePath: aFile(10), fileName: 'a.csv', sha256: 'x', fetch: fetchFn }),
			(error: UploadError) => error.status === 400 && /SHA-256/.test(error.message));
	});
});

describe('submitUpload', () => {
	it('submits the finished upload to the item, and returns the submission', async () => {
		const { state, fetchFn } = standIn();
		const id = await submitUpload('https://datasuite.test/api/data/submit/uploads/abc123', 'tok', { countryCycleId: 'cc', activityItemId: 'item', day: 2, note: 'from DHIS2' }, fetchFn);

		assert.strictEqual(id, 'item-1');
		assert.deepStrictEqual(state.submitted, { countryCycleId: 'cc', activityItemId: 'item', day: 2, note: 'from DHIS2' });
	});

	it("passes the server's reason on", async () => {
		const fetchFn: Fetch = async () => new Response(JSON.stringify({ errors: { '': ["The file that arrived isn't the one sent (its SHA-256 differs). Upload it again."] } }), { status: 400 });
		await assert.rejects(submitUpload('https://x/u/1', 't', { countryCycleId: 'c', activityItemId: 'i' }, fetchFn), /SHA-256 differs/);
	});
});

describe('sha256File', () => {
	it('is the file\'s SHA-256, in lower-case hex', async () => {
		const file = aFile(5000);
		assert.strictEqual(await sha256File(file), createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
	});
});
