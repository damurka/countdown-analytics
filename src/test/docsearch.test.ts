/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// npm test: compiles, then node --test runs this against out/docsearch.js (no vscode needed).

import * as assert from 'assert';
import { describe, it } from 'node:test';
import { bm25, CHUNK_OVERLAP, CHUNK_SIZE, chunkUnits, cosine, decodeVectors, docKey, encodeVectors, fromFloat16, isScannedPage, normalize, quotedPhrase, rankBy, rrf, snippet, tokenize, toFloat16, vectorFileName } from '../docsearch';

describe('chunkUnits', () => {
	it('keeps a short unit whole, with its marker', () => {
		const chunks = chunkUnits('docx', [{ marker: 'section: Methods', text: '  The denominator is DHIS2 live births.  ' }]);
		assert.deepStrictEqual(chunks, [{ unit: 0, marker: 'section: Methods', start: 2, end: 39 }]);
	});

	it('splits a long unit into overlapping chunks of about the size, covering all of it', () => {
		const sentence = 'Coverage of ANC4 rose in most districts after the campaign. ';
		const text = sentence.repeat(120);
		const chunks = chunkUnits('pdf', [{ marker: 'p. 7', text }]);
		assert.ok(chunks.length > 3);
		for (const c of chunks) {
			assert.strictEqual(c.marker, 'p. 7');
			assert.ok(c.end - c.start <= CHUNK_SIZE, `chunk of ${c.end - c.start}`);
		}
		assert.strictEqual(chunks[0].start, 0);
		assert.strictEqual(chunks[chunks.length - 1].end, text.trimEnd().length);
		for (let i = 1; i < chunks.length; i++) {
			assert.ok(chunks[i].start < chunks[i - 1].end, 'overlaps');
			assert.ok(chunks[i - 1].end - chunks[i].start <= CHUNK_OVERLAP, 'small overlap');
		}
		// cut at sentence ends
		assert.ok(/\.\s$/.test(text.slice(chunks[0].start, chunks[0].end)));
	});

	it('makes a scanned PDF page one image chunk and skips empty units of other types', () => {
		const chunks = chunkUnits('pdf', [{ marker: 'p. 1', text: 'Real text on this page, long enough to count.' }, { marker: 'p. 2', text: ' \n 12 ' }]);
		assert.deepStrictEqual(chunks[1], { unit: 1, marker: 'p. 2', start: 0, end: 0, image: true });
		assert.deepStrictEqual(chunkUnits('pptx', [{ marker: 'slide 1', text: '' }]), []);
		assert.ok(isScannedPage('pdf', ''));
		assert.ok(!isScannedPage('docx', ''));
	});
});

describe('tokenize', () => {
	it('lower-cases, drops accents and single letters, keeps numbers', () => {
		assert.deepStrictEqual(tokenize('Vacinação DTP3 em 2023: a cobertura é 9'), ['vacinacao', 'dtp3', 'em', '2023', 'cobertura', '9']);
	});
});

describe('bm25 and rankBy', () => {
	it('ranks the chunk with more (and rarer) query terms first and leaves non-matching ones out', () => {
		const docs = ['penta coverage fell in the north', 'the the the the report', 'penta penta dropout rate penta coverage', 'nothing here'].map(tokenize);
		const scores = bm25(docs, tokenize('penta dropout'));
		assert.deepStrictEqual(rankBy(scores, 10), [2, 0]);
		assert.strictEqual(scores[3], 0);
	});

	it('handles no documents', () => {
		assert.deepStrictEqual(bm25([], ['x']), []);
	});
});

describe('rrf', () => {
	it('fuses rankings with 1/(k + rank), recording which rankings found each id', () => {
		const fused = rrf([[1, 2, 3], [3, 1]], 60);
		assert.deepStrictEqual(fused.map(f => f.id), [1, 3, 2]);
		assert.ok(Math.abs(fused[0].score - (1 / 61 + 1 / 62)) < 1e-12);
		assert.deepStrictEqual(fused.find(f => f.id === 2)!.in, [0]);
		assert.deepStrictEqual(fused.find(f => f.id === 3)!.in, [0, 1]);
	});
});

describe('cosine and normalize', () => {
	it('is 1 for the same direction, 0 for orthogonal, and 0 for a zero vector', () => {
		assert.ok(Math.abs(cosine([1, 2, 3], [2, 4, 6]) - 1) < 1e-12);
		assert.strictEqual(cosine([1, 0], [0, 1]), 0);
		assert.strictEqual(cosine([0, 0], [1, 1]), 0);
		const n = normalize([3, 4]);
		assert.ok(Math.abs(n[0] - 0.6) < 1e-6 && Math.abs(n[1] - 0.8) < 1e-6);
	});
});

describe('float16', () => {
	it('round-trips exact values and the special ones', () => {
		for (const v of [0, 1, -1, 0.5, 65504, -2, 2 ** -14, 2 ** -24]) {
			assert.strictEqual(fromFloat16(toFloat16(v)), v);
		}
		assert.strictEqual(fromFloat16(toFloat16(1e6)), Infinity);
		assert.ok(Number.isNaN(fromFloat16(toFloat16(NaN))));
		assert.strictEqual(Object.is(fromFloat16(toFloat16(-0)), -0), true);
	});

	it('keeps unit vectors close enough for ranking', () => {
		const dims = 768;
		const vectors = [0, 1, 2].map(seed => normalize(Array.from({ length: dims }, (_, i) => Math.sin(i * (seed + 1) * 0.37))));
		const decoded = decodeVectors(encodeVectors(vectors, dims), dims);
		assert.strictEqual(decoded.length, 3);
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < dims; j++) {
				assert.ok(Math.abs(decoded[i][j] - vectors[i][j]) < 1e-3);
			}
			assert.ok(cosine(decoded[i], vectors[i]) > 0.99999);
		}
	});
});

describe('cache keys', () => {
	it('depends on path (case-insensitive), size and time', () => {
		const k = docKey('C:/Data/report.pdf', 100, 5);
		assert.strictEqual(k, docKey('c:/data/REPORT.pdf', 100, 5));
		assert.notStrictEqual(k, docKey('C:/Data/report.pdf', 101, 5));
		assert.notStrictEqual(k, docKey('C:/Data/report.pdf', 100, 6));
		assert.match(k, /^[0-9a-f]{40}$/);
	});

	it('names the vectors by key, model, dimensions and chunking version', () => {
		assert.strictEqual(vectorFileName('abc', 'google/gemini-embedding-2', 768), 'abc.google_gemini-embedding-2-768-c1.vec.json');
	});
});

describe('snippet and quotedPhrase', () => {
	it('centres on the first query word, ignoring accents', () => {
		const text = `${'x '.repeat(300)}a taxa de vacinação subiu ${'y '.repeat(300)}`;
		const s = snippet(text, tokenize('vacinacao'), 100);
		assert.ok(s.includes('vacinação'));
		assert.ok(s.startsWith('... ') && s.endsWith(' ...'));
	});

	it('recognises a phrase in double quotes', () => {
		assert.strictEqual(quotedPhrase('"live births"'), 'live births');
		assert.strictEqual(quotedPhrase('“live births”'), 'live births');
		assert.strictEqual(quotedPhrase('live births'), undefined);
	});
});
