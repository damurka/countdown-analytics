/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// What "Open Notebook" writes: the cells, and the .ipynb (nbformat 4.5) with the kernel's language, so DataSuite picks
// its R, Python or Stata kernel. The notebook goes in the dataset's workspace, where DataSuite gives it the folder's
// datasets by name (cd2030.core's notebook_data(), the apps' notebookData). No vscode here (npm test runs it as node).

export type Language = 'r' | 'python' | 'stata';

export interface ICell {
	readonly kind: 'markdown' | 'code';
	readonly source: string;
}

const KERNELSPECS: Record<Language, { kernelspec: object; language_info: object }> = {
	r: { kernelspec: { name: 'datasuite-r', display_name: 'R', language: 'R' }, language_info: { name: 'R' } },
	python: { kernelspec: { name: 'datasuite-python', display_name: 'Python', language: 'python' }, language_info: { name: 'python' } },
	stata: { kernelspec: { name: 'datasuite-stata', display_name: 'Stata', language: 'stata' }, language_info: { name: 'stata' } },
};

const TABLES = '`countdown_data` (as loaded), `kept_data` (the years and areas the adjustment removes left out), `adjusted_data` (what the analysis pages use), `national_rates`, the survey tables and `settings` (the choices made in the app, the adjustment\'s rules among them)';

export function notebookCells(language: Language, title: string): ICell[] {
	const intro = `# ${title}: analysis\n\nThis dataset's tables are here by name: ${TABLES}. The folder's other datasets are \`<file>/<table>\`, the reference data \`ref_<table>\`. They are read from the app's dataset, read-only -- nothing here changes the app -- and read again once the app has saved since.`;
	if (language === 'r') {
		return [
			{ kind: 'markdown', source: `${intro}\n\n\`ds_list()\` lists them, \`ds_save(x, "name")\` keeps a table in this workspace (for R, Python and Stata), \`ds_reload()\` reads the app's dataset again now; \`cache\` is the whole dataset.` },
			{ kind: 'code', source: 'library(cd2030.core)\nlibrary(dplyr)\n\nds_list()' },
			{ kind: 'code', source: 'adjusted_data |> glimpse()' },
			{ kind: 'markdown', source: '## Check the app: Data Adjustment Changes\n\nEach year\'s reported count and what each step of the adjustment added, for one indicator (every area; `area = "<region>"` for one region).' },
			{ kind: 'code', source: 'kept_data |>\n  generate_adjustment_values(settings = cache$adjustment_settings) |>\n  filter_adjustment_value("penta1")' },
			{ kind: 'code', source: '' },
		];
	}
	if (language === 'python') {
		return [
			{ kind: 'markdown', source: `${intro}\n\nThis dataset's tables are pandas DataFrames already; another's is \`ds.use("<file>/<table>")\`. \`ds.list()\` lists them, \`ds.save(df, "name")\` keeps a table in this workspace (for R, Python and Stata), \`ds.reload()\` reads the app's dataset again now. Needs pandas.` },
			{ kind: 'code', source: 'ds.list()' },
			{ kind: 'code', source: 'adjusted_data.head()' },
			{ kind: 'code', source: '' },
		];
	}
	return [
		{ kind: 'markdown', source: `${intro}\n\nIn Stata they are on the ado-path: \`sysuse adjusted_data, clear\`; another dataset's is \`sysuse <file>__<table>\` (its file name with _ for spaces and signs). \`dslist\` lists them, \`dssave name\` keeps the data in memory in this workspace (for R, Python and Stata), \`dsreload\` reads the app's dataset again now.` },
		{ kind: 'code', source: 'dslist' },
		{ kind: 'code', source: 'sysuse adjusted_data, clear\ndescribe, short' },
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
