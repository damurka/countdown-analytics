/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// What "Open Notebook" writes: the cells, and the .ipynb (nbformat 4.5) with the kernel's language, so DataSuite picks
// its R, Python or Stata kernel. No vscode here (npm test runs it as plain node).

import * as path from 'path';

export type Language = 'r' | 'python' | 'stata';

export interface ICell {
	readonly kind: 'markdown' | 'code';
	readonly source: string;
}

/** The data a Python or Stata notebook gets: the name of the .dta file and the CacheConnection member it comes from. */
export const EXPORTS = [
	{ name: 'countdown_data', member: 'countdown_data', label: 'the data as loaded' },
	{ name: 'data_kept', member: 'data_with_excluded_years', label: 'the data kept for analysis (the years and areas the adjustment removes left out)' },
	{ name: 'adjusted_data', member: 'adjusted_data', label: 'the adjusted data, what the analysis pages use (only once the data is adjusted)' },
];

const KERNELSPECS: Record<Language, { kernelspec: object; language_info: object }> = {
	r: { kernelspec: { name: 'datasuite-r', display_name: 'R', language: 'R' }, language_info: { name: 'R' } },
	python: { kernelspec: { name: 'datasuite-python', display_name: 'Python', language: 'python' }, language_info: { name: 'python' } },
	stata: { kernelspec: { name: 'datasuite-stata', display_name: 'Stata', language: 'stata' }, language_info: { name: 'stata' } },
};

/** An R string literal (as r.ts's rString). */
function rString(value: string): string {
	return `"${value.replace(/\\/g, '/').replace(/"/g, '\\"')}"`;
}

/** A path as R, Python and Stata all read it (forward slashes work everywhere, Windows included). */
export function slashes(p: string): string {
	return p.replace(/\\/g, '/');
}

/** Python's string literal for a path. */
function pyString(value: string): string {
	return JSON.stringify(value);
}

export function notebookCells(language: Language, title: string, dataset: { path: string; revision?: number }, exported?: { dir: string; files: string[] }): ICell[] {
	const intro = `# ${title}: analysis\n\n`;
	if (language === 'r') {
		return [
			{ kind: 'markdown', source: `${intro}This notebook reads the app's dataset **read-only**: nothing here changes the app or its file. After you change something in the app (Adjust data, the denominators, ...), run the first cell again to see it.` },
			{ kind: 'code', source: `library(cd2030.core)\nlibrary(dplyr)\n\ncache <- init_CacheConnection(rds_path = ${rString(slashes(dataset.path))}, read_only = TRUE)\ncache$country` },
			{ kind: 'markdown', source: '## The data' },
			{ kind: 'code', source: 'raw      <- cache$countdown_data            # as loaded\nkept     <- cache$data_with_excluded_years  # the years and areas the adjustment removes, left out\nadjusted <- cache$adjusted_data             # what the analysis pages use (NULL until the data is adjusted)\n\ncache$adjustment_settings                   # the adjustment\'s rules' },
			{ kind: 'markdown', source: '## Check the app: Data Adjustment Changes\n\nEach year\'s reported count and what each step of the adjustment added, for one indicator (every area; `area = "<region>"` for one region).' },
			{ kind: 'code', source: 'kept |>\n  generate_adjustment_values(settings = cache$adjustment_settings) |>\n  filter_adjustment_value("penta1")' },
			{ kind: 'markdown', source: '`names(cache)` lists everything else the dataset holds (national rates, the survey data, the denominators chosen, ...).' },
			{ kind: 'code', source: '' },
		];
	}
	const files = exported?.files ?? [];
	const list = EXPORTS.filter(e => files.includes(e.name)).map(e => `- \`${e.name}.dta\`: ${e.label}`).join('\n');
	const copy = `${intro}The app's data, exported as Stata files into \`${slashes(exported?.dir ?? '')}\`${dataset.revision !== undefined ? ` (the dataset's revision ${dataset.revision})` : ''}. They are a copy: after you change something in the app, run **Countdown: Open Notebook** again for a new one.\n\n${list}`;
	const data = (name: string) => slashes(path.join(exported?.dir ?? '', `${name}.dta`));
	const main = files.includes('adjusted_data') ? 'adjusted_data' : files.includes('data_kept') ? 'data_kept' : 'countdown_data';
	if (language === 'python') {
		return [
			{ kind: 'markdown', source: `${copy}\n\nThe notebook needs pandas. If it is missing, install it into the Python DataSuite uses (\`py -m pip install pandas\` in a terminal), then restart the kernel.` },
			{ kind: 'code', source: `import pandas as pd\n\n${EXPORTS.filter(e => files.includes(e.name)).map(e => `${e.name} = pd.read_stata(${pyString(data(e.name))})`).join('\n')}\n${main}.head()` },
			{ kind: 'code', source: '' },
		];
	}
	return [
		{ kind: 'markdown', source: copy },
		{ kind: 'code', source: `use "${data(main)}", clear\ndescribe, short` },
		{ kind: 'code', source: '' },
	];
}

export function notebookJson(language: Language, cells: ICell[]): string {
	return JSON.stringify({
		cells: cells.map((cell, index) => cell.kind === 'markdown'
			? { cell_type: 'markdown', id: `cell-${index}`, metadata: {}, source: cell.source.split(/(?<=\n)/) }
			: { cell_type: 'code', id: `cell-${index}`, metadata: {}, execution_count: null, outputs: [], source: cell.source ? cell.source.split(/(?<=\n)/) : [] }),
		metadata: KERNELSPECS[language],
		nbformat: 4,
		nbformat_minor: 5,
	}, null, 1) + '\n';
}
