/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// npm test: compiles, then node --test runs this against out/notebookContent.js (no vscode needed).

import * as assert from 'assert';
import { describe, it } from 'node:test';
import { notebookCells, notebookJson } from '../notebookContent';

const dataset = { path: 'C:\\data\\Benin_rmncah.rds', revision: 12 };

describe('notebookJson', () => {
	it('writes an R notebook that reads the app\'s dataset read-only, and says it is R', () => {
		const nb = JSON.parse(notebookJson('r', notebookCells('r', 'Benin', dataset)));
		assert.strictEqual(nb.nbformat, 4);
		assert.strictEqual(nb.metadata.language_info.name, 'R');
		const code = nb.cells.filter((cell: { cell_type: string }) => cell.cell_type === 'code').map((cell: { source: string[] }) => cell.source.join(''));
		assert.match(code[0], /init_CacheConnection\(rds_path = "C:\/data\/Benin_rmncah\.rds", read_only = TRUE\)/);
		assert.ok(nb.cells.every((cell: { id: string }) => typeof cell.id === 'string'));
		// lines keep their newlines, as nbformat has them
		assert.deepStrictEqual(nb.cells[1].source.slice(0, 2), ['library(cd2030.core)\n', 'library(dplyr)\n']);
	});

	it('gives Python and Stata the exported files, the adjusted data first', () => {
		const exported = { dir: 'C:\\ws\\notebooks\\data', files: ['countdown_data', 'adjusted_data'] };
		const python = JSON.parse(notebookJson('python', notebookCells('python', 'Benin', dataset, exported)));
		assert.strictEqual(python.metadata.kernelspec.language, 'python');
		const read = python.cells[1].source.join('');
		assert.match(read, /countdown_data = pd\.read_stata\("C:\/ws\/notebooks\/data\/countdown_data\.dta"\)/);
		assert.doesNotMatch(read, /data_kept/);
		assert.match(read, /adjusted_data\.head\(\)$/);

		const stata = JSON.parse(notebookJson('stata', notebookCells('stata', 'Benin', dataset, exported)));
		assert.strictEqual(stata.metadata.language_info.name, 'stata');
		assert.match(stata.cells[1].source.join(''), /^use "C:\/ws\/notebooks\/data\/adjusted_data\.dta", clear/);
		assert.match(stata.cells[0].source.join(''), /revision 12/);
	});
});
