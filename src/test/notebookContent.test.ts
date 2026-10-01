/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// npm test: compiles, then node --test runs this against out/notebookContent.js (no vscode needed).

import * as assert from 'assert';
import { describe, it } from 'node:test';
import { notebookCells, notebookJson } from '../notebookContent';

const code = (nb: { cells: { cell_type: string; source: string[] }[] }) => nb.cells.filter(c => c.cell_type === 'code').map(c => c.source.join(''));

describe('notebookJson', () => {
	it('writes an R notebook that uses the tables by name, and says it is R', () => {
		const nb = JSON.parse(notebookJson('r', notebookCells('r', 'Benin')));
		assert.strictEqual(nb.nbformat, 4);
		assert.strictEqual(nb.metadata.language_info.name, 'R');
		assert.ok(nb.cells.every((cell: { id: string }) => typeof cell.id === 'string'));
		const cells = code(nb);
		assert.match(cells[0], /ds_list\(\)/);
		assert.match(cells.join('\n'), /adjusted_data/);
		// nothing loads a file by its path: the kernel gives the data by name
		assert.doesNotMatch(cells.join('\n'), /init_CacheConnection|\.rds|read_stata/);
		// lines keep their newlines, as nbformat has them
		assert.deepStrictEqual(nb.cells[1].source.slice(0, 2), ['library(cd2030.core)\n', 'library(dplyr)\n']);
	});

	it('gives Python the tables as variables and Stata sysuse', () => {
		const python = JSON.parse(notebookJson('python', notebookCells('python', 'Benin')));
		assert.strictEqual(python.metadata.kernelspec.language, 'python');
		assert.deepStrictEqual(code(python).slice(0, 2), ['ds.list()', 'adjusted_data.head()']);

		const stata = JSON.parse(notebookJson('stata', notebookCells('stata', 'Benin')));
		assert.strictEqual(stata.metadata.language_info.name, 'stata');
		assert.deepStrictEqual(code(stata).slice(0, 2), ['dslist', 'sysuse adjusted_data, clear\ndescribe, short']);
	});
});
