/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The pure parts of countdown_documents' search (no vscode import, so node --test runs them): chunks of a document's
// units, BM25 over the chunks, cosine over their embeddings, reciprocal rank fusion of the two, the float16 codec the
// stored vectors use and the cache keys.

import * as crypto from 'crypto';

/** A document's text as extracted in R: citable units (pages, slides, sections, sheets, line ranges). */
export interface IDocUnit { readonly marker: string; readonly text: string }

/** A piece of one unit that is ranked (and embedded) on its own; `image` for a scanned page (no text, an image vector). */
export interface IChunk {
	/** 0-based index of the unit. */
	readonly unit: number;
	readonly marker: string;
	/** Character span within the unit's text. */
	readonly start: number;
	readonly end: number;
	readonly image?: boolean;
}

export const CHUNK_SIZE = 1500;
export const CHUNK_OVERLAP = 150;
/** Bumped when chunking changes, so stored vectors are made again. */
export const CHUNK_VERSION = 1;

/** A PDF page with fewer non-space characters than this has no usable text layer (a scanned page). */
const SCANNED_MIN_CHARS = 30;

export function isScannedPage(type: string, text: string): boolean {
	return type === 'pdf' && text.replace(/\s+/g, '').length < SCANNED_MIN_CHARS;
}

/**
 * Splits units into chunks of about `size` characters that overlap by `overlap`, cutting at a paragraph, line or
 * sentence end, else a space, near the size. Each chunk keeps its unit's marker (what is cited). Scanned PDF pages
 * become one image chunk each; other empty units none.
 */
export function chunkUnits(type: string, units: readonly IDocUnit[], size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): IChunk[] {
	const out: IChunk[] = [];
	units.forEach((u, unit) => {
		const text = u.text ?? '';
		if (isScannedPage(type, text)) {
			out.push({ unit, marker: u.marker, start: 0, end: 0, image: true });
			return;
		}
		// skip leading/trailing space so spans point at text
		let start = text.search(/\S/);
		if (start < 0) {
			return;
		}
		const last = text.trimEnd().length;
		while (start < last) {
			let end = Math.min(last, start + size);
			if (end < last && last - end > size * 0.2) {
				end = cutPoint(text, start + Math.floor(size * 0.6), end);
			} else {
				end = last;
			}
			out.push({ unit, marker: u.marker, start, end });
			if (end >= last) {
				break;
			}
			let next = Math.max(start + 1, end - overlap);
			// start the overlap at a word
			const space = text.indexOf(' ', next);
			if (space > 0 && space < end) {
				next = space + 1;
			}
			start = next;
		}
	});
	return out;
}

/** The best place to cut in [min, max): a blank line, a line end, a sentence end, a space -- the last of the first kind found. */
function cutPoint(text: string, min: number, max: number): number {
	const window = text.slice(min, max);
	for (const re of [/\n\s*\n/g, /\n/g, /[.!?;:]\s/g, /\s/g]) {
		let at = -1;
		for (const m of window.matchAll(re)) {
			at = (m.index ?? 0) + m[0].length;
		}
		if (at > 0) {
			return min + at;
		}
	}
	return max;
}

/** Lower-case words and numbers without accents (so "vacinação" matches "vacinacao"); single letters dropped. */
export function tokenize(text: string): string[] {
	const words = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
	return words.filter(w => w.length > 1 || /\d/.test(w));
}

/** BM25 scores of each document (token lists) for the query tokens. */
export function bm25(docs: readonly (readonly string[])[], query: readonly string[], k1 = 1.2, b = 0.75): number[] {
	const n = docs.length;
	const scores = new Array<number>(n).fill(0);
	if (!n) {
		return scores;
	}
	const terms = [...new Set(query)];
	const avgLen = docs.reduce((s, d) => s + d.length, 0) / n || 1;
	const freqs = docs.map(d => {
		const f = new Map<string, number>();
		for (const t of d) {
			f.set(t, (f.get(t) ?? 0) + 1);
		}
		return f;
	});
	for (const term of terms) {
		const df = freqs.reduce((c, f) => c + (f.has(term) ? 1 : 0), 0);
		if (!df) {
			continue;
		}
		const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
		freqs.forEach((f, i) => {
			const tf = f.get(term);
			if (tf) {
				scores[i] += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docs[i].length / avgLen));
			}
		});
	}
	return scores;
}

/** Indices ordered by score, highest first, keeping only those above `min`, at most `limit`. */
export function rankBy(scores: readonly number[], limit: number, min = 0): number[] {
	return scores.map((s, i) => [s, i] as const).filter(([s]) => s > min).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, limit).map(([, i]) => i);
}

/** Reciprocal rank fusion: each ranking (ids best first) adds 1 / (k + rank) to an id's score. Best first. */
export function rrf(rankings: readonly (readonly number[])[], k = 60): { id: number; score: number; in: number[] }[] {
	const fused = new Map<number, { id: number; score: number; in: number[] }>();
	rankings.forEach((ranking, which) => {
		ranking.forEach((id, rank) => {
			const entry = fused.get(id) ?? { id, score: 0, in: [] };
			entry.score += 1 / (k + rank + 1);
			entry.in.push(which);
			fused.set(id, entry);
		});
	});
	return [...fused.values()].sort((a, b) => b.score - a.score || a.id - b.id);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
	let dot = 0, na = 0, nb = 0;
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function normalize(v: ArrayLike<number>): Float32Array {
	let n = 0;
	for (let i = 0; i < v.length; i++) {
		n += v[i] * v[i];
	}
	n = Math.sqrt(n) || 1;
	const out = new Float32Array(v.length);
	for (let i = 0; i < v.length; i++) {
		out[i] = v[i] / n;
	}
	return out;
}

// ---------------------------------------------------------------------------------------------- float16

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** IEEE 754 half precision, round to nearest even. */
export function toFloat16(value: number): number {
	f32[0] = value;
	const x = u32[0];
	const sign = (x >>> 16) & 0x8000;
	const exp = (x >>> 23) & 0xff;
	let mant = x & 0x7fffff;
	if (exp === 0xff) {
		return sign | 0x7c00 | (mant ? 0x200 : 0);
	}
	let e = exp - 127 + 15;
	if (e >= 0x1f) {
		return sign | 0x7c00;
	}
	if (e <= 0) {
		if (e < -10) {
			return sign;
		}
		mant |= 0x800000;
		const shift = 14 - e;
		let half = mant >> shift;
		const rem = mant & ((1 << shift) - 1);
		const mid = 1 << (shift - 1);
		if (rem > mid || (rem === mid && (half & 1))) {
			half++;
		}
		return sign | half;
	}
	let half = sign | (e << 10) | (mant >> 13);
	const rem = mant & 0x1fff;
	if (rem > 0x1000 || (rem === 0x1000 && (half & 1))) {
		half++;
	}
	return half;
}

export function fromFloat16(h: number): number {
	const sign = h & 0x8000 ? -1 : 1;
	const exp = (h >> 10) & 0x1f;
	const mant = h & 0x3ff;
	if (exp === 0) {
		return sign * mant * 2 ** -24;
	}
	if (exp === 0x1f) {
		return mant ? NaN : sign * Infinity;
	}
	return sign * (1 + mant / 1024) * 2 ** (exp - 15);
}

/** Vectors (all `dimensions` long) as little-endian float16, base64. */
export function encodeVectors(vectors: readonly ArrayLike<number>[], dimensions: number): string {
	const buf = Buffer.alloc(vectors.length * dimensions * 2);
	vectors.forEach((v, i) => {
		for (let j = 0; j < dimensions; j++) {
			buf.writeUInt16LE(toFloat16(v[j] ?? 0), (i * dimensions + j) * 2);
		}
	});
	return buf.toString('base64');
}

export function decodeVectors(base64: string, dimensions: number): Float32Array[] {
	const buf = Buffer.from(base64, 'base64');
	const count = Math.floor(buf.length / 2 / dimensions);
	const out: Float32Array[] = [];
	for (let i = 0; i < count; i++) {
		const v = new Float32Array(dimensions);
		for (let j = 0; j < dimensions; j++) {
			v[j] = fromFloat16(buf.readUInt16LE((i * dimensions + j) * 2));
		}
		out.push(v);
	}
	return out;
}

// ---------------------------------------------------------------------------------------------- cache keys

/** A document's cache key: its full path (case-insensitive), size and modification time. */
export function docKey(file: string, size: number, mtimeMs: number): string {
	return crypto.createHash('sha1').update(`${file.toLowerCase()}|${size}|${mtimeMs}`).digest('hex');
}

/** The file name of a document's vectors: its key, the model and dimensions, and the chunking version. */
export function vectorFileName(key: string, model: string, dimensions: number): string {
	return `${key}.${model.replace(/[^A-Za-z0-9.-]+/g, '_')}-${dimensions}-c${CHUNK_VERSION}.vec.json`;
}

// ---------------------------------------------------------------------------------------------- snippets

/** About `width` characters of `text` around the first query word found (or its start), on one line. */
export function snippet(text: string, queryTokens: readonly string[], width = 320): string {
	const plain = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
	let at = -1;
	for (const t of queryTokens) {
		const i = plain.search(new RegExp(`(^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'));
		if (i >= 0 && (at < 0 || i < at)) {
			at = i;
		}
	}
	const from = Math.max(0, at < 0 ? 0 : at - Math.floor(width / 3));
	const body = text.slice(from, from + width).replace(/\s+/g, ' ').trim();
	return `${from > 0 ? '... ' : ''}${body}${from + width < text.length ? ' ...' : ''}`;
}

/** A query in double quotes asks for that exact phrase (keyword search as before), not a ranked search. */
export function quotedPhrase(query: string): string | undefined {
	const m = /^\s*["“](.+)["”]\s*$/.exec(query);
	return m ? m[1] : undefined;
}
