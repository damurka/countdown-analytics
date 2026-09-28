/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Meaning search for countdown_documents: a document's chunks embedded by DataSuite's AI service
// (google/gemini-embedding-2, 768 dimensions; datasuite docs/adr/0028) through the `datasuite.embeddings.compute`
// command -- which also takes images, for scanned PDF pages -- or, for text, the proposed `vscode.lm.computeEmbeddings`.
// Both are optional: an older DataSuite, a signed-out user or `datasuite.embeddings.enabled: false` leave keyword
// search alone. Vectors are stored as float16 next to the document's text cache and made again only when the file changes.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { chunkUnits, decodeVectors, encodeVectors, IChunk, IDocUnit, normalize, vectorFileName } from './docsearch';

const EXTENSION_ID = 'datasuite.countdown-analytics';
const COMMAND = 'datasuite.embeddings.compute';
const PROPOSED_MODEL = 'google/gemini-embedding-2-768';
/** The model the vectors are stored under (what the command answers with). */
export const EMBED_MODEL = 'google/gemini-embedding-2';
export const EMBED_DIMENSIONS = 768;
/** A document with more chunks than this isn't embedded (cost); keyword search still covers it. */
export const MAX_CHUNKS = 3000;
/** Scanned pages embedded per document at most. */
export const MAX_IMAGES = 300;
/** Inputs per command call (its limit is 1,024); images go 16 at a time (the service's limit per request). */
const TEXT_BATCH = 256;
const IMAGE_BATCH = 16;

export type EmbedFailure = { readonly ok: false; readonly reason: string; readonly message: string };
type EmbedInput = string | { readonly imageDataUrl: string } | { readonly text: string; readonly imageDataUrl: string };
type EmbedResult = { readonly ok: true; readonly model: string; readonly dimensions: number; readonly vectors: Float32Array[] } | EmbedFailure;

/** A document's stored vectors: its chunks (spans in the text cache's units) and one vector each. */
export interface IDocVectors {
	readonly model: string;
	readonly dimensions: number;
	readonly chunks: readonly IChunk[];
	readonly vectors: readonly Float32Array[];
	/** Scanned pages: their rendered image, by 0-based unit. */
	readonly images: Readonly<Record<number, string>>;
}

interface IStoredVectors {
	readonly version: 1;
	readonly model: string;
	readonly dimensions: number;
	readonly chunks: readonly IChunk[];
	readonly images: Record<number, string>;
	readonly vectors: string;
}

let log: vscode.LogOutputChannel | undefined;
function logger(): vscode.LogOutputChannel {
	return log ??= vscode.window.createOutputChannel('Countdown AI documents', { log: true });
}

/** The embeddings setting (DataSuite's): off means nothing is sent. */
function embeddingsDisabled(): boolean {
	return vscode.workspace.getConfiguration().get<boolean>('datasuite.embeddings.enabled') === false;
}

/**
 * Embeds texts and images with DataSuite's AI service. Never throws: `{ ok: false, reason }` when embeddings are off,
 * signed out, not in this DataSuite build (`unavailable`), over quota, etc.
 */
export async function embed(inputs: readonly EmbedInput[], inputType: 'query' | 'document'): Promise<EmbedResult> {
	if (embeddingsDisabled()) {
		return { ok: false, reason: 'disabled', message: 'DataSuite embeddings are turned off (datasuite.embeddings.enabled).' };
	}
	if (!inputs.length) {
		return { ok: true, model: EMBED_MODEL, dimensions: EMBED_DIMENSIONS, vectors: [] };
	}
	const commands = await vscode.commands.getCommands(true).then(all => new Set(all), () => new Set<string>());
	if (commands.has(COMMAND)) {
		const vectors: Float32Array[] = [];
		let model = EMBED_MODEL;
		for (let i = 0; i < inputs.length;) {
			const batch = inputs.slice(i, i + (typeof inputs[i] === 'string' ? TEXT_BATCH : IMAGE_BATCH));
			// keep a batch all text or all images, so one big image batch never carries hundreds of texts
			const kind = typeof batch[0] === 'string';
			const cut = batch.findIndex(x => (typeof x === 'string') !== kind);
			const part = cut > 0 ? batch.slice(0, cut) : batch;
			let reply: { ok: true; model: string; dimensions: number; vectors: number[][] } | EmbedFailure | undefined;
			try {
				reply = await vscode.commands.executeCommand(COMMAND, { extensionId: EXTENSION_ID, inputs: part, dimensions: EMBED_DIMENSIONS, inputType });
			} catch (error) {
				return { ok: false, reason: 'unavailable', message: error instanceof Error ? error.message : String(error) };
			}
			if (!reply || !reply.ok) {
				return reply ?? { ok: false, reason: 'unavailable', message: 'No answer from DataSuite embeddings.' };
			}
			model = reply.model || model;
			vectors.push(...reply.vectors.map(normalize));
			i += part.length;
		}
		return { ok: true, model, dimensions: EMBED_DIMENSIONS, vectors };
	}
	// older builds: the proposed API, text only
	if (inputs.some(x => typeof x !== 'string')) {
		return { ok: false, reason: 'unavailable', message: 'This DataSuite build embeds text only (no datasuite.embeddings.compute command).' };
	}
	try {
		const lm = vscode.lm as unknown as { computeEmbeddings?: typeof vscode.lm.computeEmbeddings; embeddingModels?: string[] };
		if (typeof lm.computeEmbeddings !== 'function' || !(lm.embeddingModels ?? []).includes(PROPOSED_MODEL)) {
			return { ok: false, reason: 'unavailable', message: 'DataSuite embeddings are not available (an older DataSuite, or not signed in).' };
		}
		const out = await lm.computeEmbeddings(PROPOSED_MODEL, inputs as string[]);
		return { ok: true, model: EMBED_MODEL, dimensions: EMBED_DIMENSIONS, vectors: out.map(e => normalize(e.values)) };
	} catch (error) {
		return { ok: false, reason: 'unavailable', message: error instanceof Error ? error.message : String(error) };
	}
}

/** One query's vector (inputType 'query'). */
export async function embedQuery(query: string): Promise<{ ok: true; model: string; vector: Float32Array } | EmbedFailure> {
	const r = await embed([query], 'query');
	return r.ok ? (r.vectors.length ? { ok: true, model: r.model, vector: r.vectors[0] } : { ok: false, reason: 'unavailable', message: 'No vector came back.' }) : r;
}

/** Stored vectors of documents, by their text cache (`<dir>/<key>.json`). */
export class DocVectors {

	private readonly _pending = new Map<string, Promise<IDocVectors | EmbedFailure>>();
	/** Why a document isn't indexed (this session), for list. */
	private readonly _failed = new Map<string, string>();

	/** Where a document's vectors are kept, next to its text cache. */
	static fileFor(textCache: string, model = EMBED_MODEL, dimensions = EMBED_DIMENSIONS): string {
		return path.join(path.dirname(textCache), vectorFileName(path.basename(textCache, '.json'), model, dimensions));
	}

	/** The stored vectors, if the document is indexed. */
	load(textCache: string): IDocVectors | undefined {
		const file = DocVectors.fileFor(textCache);
		try {
			const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as IStoredVectors;
			return { model: stored.model, dimensions: stored.dimensions, chunks: stored.chunks, images: stored.images ?? {}, vectors: decodeVectors(stored.vectors, stored.dimensions) };
		} catch {
			return undefined;
		}
	}

	/** What list shows: indexed for meaning search (chunks, scanned pages), or why not. */
	status(textCache: string | undefined): { chunks: number; scannedPages: number } | string | undefined {
		if (!textCache) {
			return undefined;
		}
		const failed = this._failed.get(textCache);
		if (failed) {
			return `not indexed: ${failed}`;
		}
		try {
			const stored = JSON.parse(fs.readFileSync(DocVectors.fileFor(textCache), 'utf8')) as IStoredVectors;
			return { chunks: stored.chunks.filter(c => !c.image).length, scannedPages: stored.chunks.filter(c => c.image).length };
		} catch {
			return undefined;
		}
	}

	/**
	 * The document's vectors, embedding it first when it has none (once at a time per document). Scanned PDF pages are
	 * rendered by `render` (0-based units -> PNG files) and embedded as images.
	 */
	ensure(name: string, textCache: string, type: string, units: readonly IDocUnit[], render: (units: number[]) => Promise<Record<number, string> | string>): Promise<IDocVectors | EmbedFailure> {
		const stored = this.load(textCache);
		if (stored) {
			return Promise.resolve(stored);
		}
		let pending = this._pending.get(textCache);
		if (!pending) {
			pending = this._build(name, textCache, type, units, render).then(result => {
				if ('ok' in result) {
					this._failed.set(textCache, result.message);
				} else {
					this._failed.delete(textCache);
				}
				return result;
			}).finally(() => this._pending.delete(textCache));
			this._pending.set(textCache, pending);
		}
		return pending;
	}

	private async _build(name: string, textCache: string, type: string, units: readonly IDocUnit[], render: (units: number[]) => Promise<Record<number, string> | string>): Promise<IDocVectors | EmbedFailure> {
		let chunks = chunkUnits(type, units);
		if (chunks.length > MAX_CHUNKS) {
			logger().info(`${name}: ${chunks.length} chunks, over the ${MAX_CHUNKS} limit; not embedded`);
			return { ok: false, reason: 'tooLarge', message: `${name} is too long for meaning search (${chunks.length} chunks; the limit is ${MAX_CHUNKS}); keyword search covers it.` };
		}
		if (embeddingsDisabled()) {
			return { ok: false, reason: 'disabled', message: 'DataSuite embeddings are turned off (datasuite.embeddings.enabled).' };
		}
		// scanned pages: render them, keep those that rendered (up to MAX_IMAGES)
		const scanned = chunks.filter(c => c.image).map(c => c.unit);
		let images: Record<number, string> = {};
		const notes: string[] = [];
		if (scanned.length) {
			const rendered = await render(scanned.slice(0, MAX_IMAGES));
			if (typeof rendered === 'string') {
				notes.push(`scanned pages not rendered: ${rendered}`);
			} else {
				images = rendered;
			}
			if (scanned.length > MAX_IMAGES) {
				notes.push(`only the first ${MAX_IMAGES} of ${scanned.length} scanned pages`);
			}
			chunks = chunks.filter(c => !c.image || images[c.unit]);
		}
		const inputs: EmbedInput[] = [];
		for (const c of chunks) {
			if (c.image) {
				const data = fs.readFileSync(images[c.unit]).toString('base64');
				inputs.push({ imageDataUrl: `data:image/png;base64,${data}` });
			} else {
				inputs.push(units[c.unit].text.slice(c.start, c.end));
			}
		}
		const chars = inputs.reduce((s, x) => s + (typeof x === 'string' ? x.length : 0), 0);
		const imageCount = chunks.filter(c => c.image).length;
		logger().info(`${name}: embedding ${chunks.length - imageCount} text chunks (${chars} characters, about ${Math.round(chars / 4)} tokens) and ${imageCount} page images${notes.length ? `; ${notes.join('; ')}` : ''}`);
		const started = Date.now();
		let result = await embed(inputs, 'document');
		if (!result.ok && result.reason === 'unavailable' && imageCount) {
			// an older build without the command: text alone
			const textOnly = chunks.filter(c => !c.image);
			const retry = await embed(textOnly.map(c => units[c.unit].text.slice(c.start, c.end)), 'document');
			if (retry.ok) {
				chunks = textOnly;
				images = {};
			}
			result = retry;
		}
		if (!result.ok) {
			logger().warn(`${name}: not embedded (${result.reason}): ${result.message}`);
			return result;
		}
		logger().info(`${name}: embedded in ${((Date.now() - started) / 1000).toFixed(1)} s`);
		const stored: IStoredVectors = { version: 1, model: result.model, dimensions: result.dimensions, chunks, images, vectors: encodeVectors(result.vectors, result.dimensions) };
		try {
			fs.mkdirSync(path.dirname(textCache), { recursive: true });
			fs.writeFileSync(DocVectors.fileFor(textCache), JSON.stringify(stored));
		} catch (error) {
			logger().warn(`${name}: vectors not saved: ${error instanceof Error ? error.message : String(error)}`);
		}
		// the stored copy is float16: use the same values the next load gives
		return { model: result.model, dimensions: result.dimensions, chunks, images, vectors: decodeVectors(stored.vectors, stored.dimensions) };
	}
}
