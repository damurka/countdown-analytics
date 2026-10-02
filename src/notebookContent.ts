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

/**
 * The Countdown 2030 analysis, step by step as the Stata do-files run it (0_import_data.do ... 5_Mapping.do), with
 * cd2030.core: one block per output, on this dataset's tables and with the choices made in the app (its threshold,
 * rates, survey year, denominator, adjustment). Where cd2030.core and the Stata code differ by choice, its
 * STATA-DIFFERENCES.md says how.
 */
const R_PIPELINE: ICell[] = [
	{ kind: 'markdown', source: '## Settings\n\nThe choices made in the app: the reporting-rate threshold, the national rates (survey coverage, mortality), the survey year and the denominator. Change them here to try other values; the app is not changed.' },
	{ kind: 'code', source: 'threshold <- cache$performance_threshold\nrates <- cache$national_estimates\nsurvey_year <- cache$survey_year\nden <- cache$denominator\nstr(list(threshold = threshold, survey_year = survey_year, denominator = den, rates = rates))' },

	{ kind: 'markdown', source: '## 1a. Data quality checks (1a_checks.do)\n\n### Reporting rates (Tables 1a, 1b; Figure 1a)' },
	{ kind: 'code', source: 'calculate_average_reporting_rate(countdown_data, "national")' },
	{ kind: 'code', source: 'district_rr <- calculate_district_reporting_rate(countdown_data, threshold = threshold)\ndistrict_rr\nplot(district_rr)' },
	{ kind: 'markdown', source: '### Outliers (Tables 2a, 2b)\n\nExtreme outliers: more than 5 MADs from the median of the earlier years.' },
	{ kind: 'code', source: 'calculate_outliers_summary(countdown_data, "national")\ncalculate_district_outlier_summary(countdown_data)' },
	{ kind: 'markdown', source: '### Internal consistency (Figures 3a, 3b; Tables 3a-d)' },
	{ kind: 'code', source: 'plot_comparison(countdown_data, "anc1", "penta1")\nplot_comparison(countdown_data, "penta1", "penta3")' },
	{ kind: 'code', source: 'ratios <- calculate_ratios_and_adequacy(countdown_data)\ncalculate_ratios_summary(ratios)\ncalculate_district_ratios_summary(ratios)' },
	{ kind: 'markdown', source: '### Missing values (Tables 4a, 4b)' },
	{ kind: 'code', source: 'calculate_completeness_summary(countdown_data, "national", threshold = threshold)\ncalculate_district_completeness_summary(countdown_data)' },
	{ kind: 'markdown', source: '### Overall data quality score (Table 5)' },
	{ kind: 'code', source: 'calculate_overall_score(countdown_data, threshold = threshold)' },

	{ kind: 'markdown', source: '## 1b. Years removed (1b_remove_data.do)\n\n`kept_data` is `countdown_data` without the years and areas removed in the app.' },
	{ kind: 'code', source: 'cache$excluded_years\nsetdiff(unique(countdown_data$year), unique(kept_data$year))' },

	{ kind: 'markdown', source: '## 1c. Adjustment for incomplete reporting and outliers (1c_adjustment.do)\n\nThe adjusted numerators, with the k factors and switches set in the app; and, for one indicator, what each step added.' },
	{ kind: 'code', source: 'adjusted <- adjust_service_data(kept_data, settings = cache$adjustment_settings)\nkept_data |>\n  generate_adjustment_values(settings = cache$adjustment_settings) |>\n  filter_adjustment_value("penta1")' },

	{ kind: 'markdown', source: '## 1d. First-level region checks (1d_admin1_checks.do)' },
	{ kind: 'code', source: 'calculate_average_reporting_rate(countdown_data, "adminlevel_1")\ncalculate_completeness_summary(countdown_data, "adminlevel_1", threshold = threshold)\ncalculate_outliers_summary(countdown_data, "adminlevel_1")' },

	{ kind: 'markdown', source: '## 2. Denominators and coverage (2_denominators.do)\n\n### Population: DHIS2 against the UN estimates (Table 2a; Figures 2a, 2b)' },
	{ kind: 'code', source: 'population <- prepare_population_metrics(adjusted_data, "national", un_estimates = cache$un_estimates)\npopulation\nplot(population, metric = "population")\nplot(population, metric = "births")' },
	{ kind: 'markdown', source: '### Coverage by every denominator: national, first-level regions, districts' },
	{ kind: 'code', source: 'coverage_at <- function(level) {\n  calculate_indicator_coverage(adjusted_data, level,\n    derivation_population = cache$derivation_population, un_estimates = cache$un_estimates,\n    survey_estimates = cache$regional_survey, subnational_map = cache$survey_mapping,\n    sbr = rates$sbr, nmr = rates$nmr, pnmr = rates$pnmr, anc1survey = rates$anc1, dpt1survey = rates$penta1,\n    survey_year = survey_year, twin = rates$twin_rate, preg_loss = rates$preg_loss)\n}\ncov_national <- coverage_at("national")\ncov_admin1 <- coverage_at("adminlevel_1")\ncov_district <- coverage_at("district")\ncov_national |> select(year, starts_with("cov_penta3_"))' },
	{ kind: 'markdown', source: '### Areas below and above the thresholds (Tables 4-6)' },
	{ kind: 'code', source: 'calculate_threshold(cov_admin1, den, "dropout")\nfilter_high_performers(cov_admin1, "penta3", den, threshold = 90)' },

	{ kind: 'markdown', source: '## 3. National: DHIS2 against the surveys and WUENIC (3_national.do)' },
	{ kind: 'code', source: 'national <- calculate_coverage(cov_national, survey_data = cache$national_survey, wuenic_data = cache$wuenic_estimates, subnational_map = cache$survey_mapping)\nplot(filter_coverage(national, "penta3", den))' },

	{ kind: 'markdown', source: '## 4a. Subnational equity (4a_subnational_equity.do)\n\nMADM and MRDM against the national value, each year.' },
	{ kind: 'code', source: 'inequality <- calculate_inequality(cov_admin1, cov_national)\nplot(filter_inequality(inequality, "penta3", den))\ncalculate_threshold(cov_admin1, den, "vaccine")' },

	{ kind: 'markdown', source: '## 4b. First-level regions: DHIS2 against the surveys (4b_subnational_integration.do)' },
	{ kind: 'code', source: 'regional <- calculate_coverage(cov_admin1, survey_data = cache$regional_survey, wuenic_data = cache$wuenic_estimates, subnational_map = cache$survey_mapping)\nfor (region in unique(cov_admin1$adminlevel_1)) print(plot(filter_coverage(regional, "penta3", den, region = region)))' },

	{ kind: 'markdown', source: '## 5. Maps (5_Mapping.do)\n\nFirst-level regions. (The district maps of 5b_Mapping_districts.do have no cd2030.core equivalent.)' },
	{ kind: 'code', source: 'cov_admin1 |>\n  get_mapping_data(subnational_map = cache$map_mapping) |>\n  filter_mapping_data("penta3", den, plot_year = max(cov_admin1$year)) |>\n  plot()' },
];

export function notebookCells(language: Language, title: string): ICell[] {
	const intro = `# ${title}: analysis\n\nThis dataset's tables are here by name: ${TABLES}. The folder's other datasets are \`<file>/<table>\`, the reference data \`ref_<table>\`. They are read from the app's dataset, read-only -- nothing here changes the app -- and read again once the app has saved since.`;
	if (language === 'r') {
		return [
			{ kind: 'markdown', source: `${intro}\n\n\`ds_list()\` lists them, \`ds_save(x, "name")\` keeps a table in this workspace (for R, Python and Stata), \`ds_reload()\` reads the app's dataset again now; \`cache\` is the whole dataset.` },
			{ kind: 'code', source: 'library(cd2030.core)\nlibrary(dplyr)\n\nds_list()' },
			{ kind: 'code', source: 'adjusted_data |> glimpse()' },
			...R_PIPELINE,
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
