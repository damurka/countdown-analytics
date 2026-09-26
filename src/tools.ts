/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The Countdown AI's tools (docs/AI-PLAN.md). Numbers come from CacheConnection -- the single source of truth -- in
// the tab's own read-only R session; meaning comes from the methodology docs; the screen and anything that changes
// the app go through DataSuite's AI bridge API. Every data answer carries its provenance.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { appRequest, appState, countdownTabs, EXTENSION_ID, IAppState, ITab, pickTab, tabDataset, workspaceDir } from './app';
import { IGuideMember, Knowledge } from './knowledge';
import { CountdownR, IRReply, rString, toR } from './r';

const MAX_RESULT_CHARS = 60000;

function text(value: unknown): vscode.LanguageModelToolResult {
	let body = typeof value === 'string' ? value : JSON.stringify(value, null, 1);
	if (body.length > MAX_RESULT_CHARS) {
		body = `${body.slice(0, MAX_RESULT_CHARS)}\n... (cut at ${MAX_RESULT_CHARS} characters; ask for fewer rows)`;
	}
	return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(body)]);
}

function failure(message: string): vscode.LanguageModelToolResult {
	return text(`Error: ${message}`);
}

/** A Sources block the answer can end with, verbatim: docs sections as links, then the data sources. */
function sourcesMarkdown(docs: readonly { heading?: string; title?: string; url: string }[], data: readonly string[]): string {
	const seen = new Set<string>();
	const lines = ['**Sources**'];
	for (const d of docs) {
		if (!seen.has(d.url)) {
			seen.add(d.url);
			lines.push(`- [${[d.title, d.heading].filter(Boolean).join(' -- ') || d.url}](${d.url})`);
		}
	}
	for (const item of data) {
		lines.push(`- ${item}`);
	}
	return lines.join('\n');
}

/**
 * Methodology already sent, by page and chart kind: sent in full once, then only its links for a while, so a chat
 * that keeps asking about the same page doesn't re-send (and pay for) the same text every turn. `includeMethodology`
 * asks for it in full again (e.g. in a new chat).
 */
const METHOD_RESEND_MS = 30 * 60 * 1000;
const methodSent = new Map<string, number>();
function methodAlreadySent(key: string, force: boolean | undefined): boolean {
	const last = methodSent.get(key);
	const recent = !force && last !== undefined && Date.now() - last < METHOD_RESEND_MS;
	if (!recent) {
		methodSent.set(key, Date.now());
	}
	return recent;
}

/** Everything a tab-bound tool needs: the tab, its bridge state, the dataset to load, a label for its R session. */
interface ITabContext {
	readonly tab: ITab;
	readonly state: IAppState | undefined;
	readonly dataset: { path: string; revision?: number } | undefined;
	readonly label: string;
}

export class CountdownTools {

	constructor(private readonly _knowledge: Knowledge, private readonly _r: CountdownR) { }

	register(): vscode.Disposable[] {
		return [
			vscode.lm.registerTool('countdown_context', { invoke: options => this._context(options.input as { tabId?: string; includeMethodology?: boolean }) }),
			vscode.lm.registerTool('countdown_component', { invoke: options => this._component(options.input as { componentId?: string; tabId?: string; maxRows?: number; includeMethodology?: boolean }) }),
			vscode.lm.registerTool('countdown_cache', { invoke: options => this._cache(options.input as ICacheInput) }),
			vscode.lm.registerTool('countdown_catalog', { invoke: options => this._catalog(options.input as ICatalogInput) }),
			vscode.lm.registerTool('countdown_docs', { invoke: options => this._docs(options.input as IDocsInput) }),
			vscode.lm.registerTool('countdown_report', { invoke: options => this._report(options.input as IReportInput) }),
			vscode.lm.registerTool('countdown_graph', { invoke: options => this._graph(options.input as IGraphInput) }),
			vscode.lm.registerTool('countdown_run_r', { invoke: options => this._runR(options.input as { code: string; tabId?: string }) }),
			vscode.lm.registerTool('countdown_open_dataset', {
				prepareInvocation: options => ({
					invocationMessage: `Opening ${path.basename((options.input as IOpenInput).path ?? '')}`,
					confirmationMessages: {
						title: 'Open a dataset',
						message: `Open ${(options.input as IOpenInput).path} in a new ${(options.input as IOpenInput).app ?? 'Countdown'} tab?`
					}
				}),
				invoke: options => this._open(options.input as IOpenInput)
			})
		];
	}

	// ---------------------------------------------------------------------------------------------- tabs

	private async _tabContext(tabId: string | undefined): Promise<ITabContext | string> {
		const picked = await pickTab(tabId);
		if (typeof picked === 'string') {
			return picked;
		}
		const tabs = await countdownTabs();
		this._r.prune(new Set(tabs.map(t => t.tabId)));
		const state = await appState(picked);
		return { tab: picked, state, dataset: tabDataset(picked, state), label: `Countdown AI: ${picked.title ?? picked.localId}` };
	}

	private async _needDataset(tabId: string | undefined): Promise<ITabContext | string> {
		const context = await this._tabContext(tabId);
		if (typeof context === 'string') {
			return context;
		}
		if (!context.dataset) {
			return `The ${context.tab.title ?? context.tab.localId} tab has no saved dataset yet (finish loading the data in the app first).`;
		}
		return context;
	}

	// ---------------------------------------------------------------------------------------------- countdown_context

	private async _context(input: { tabId?: string; includeMethodology?: boolean }): Promise<vscode.LanguageModelToolResult> {
		const tabs = await countdownTabs();
		const picked = await pickTab(input.tabId);
		if (typeof picked === 'string') {
			return text({ tabs, note: picked });
		}
		const state = await appState(picked);
		if (!state) {
			return text({ tabs, tab: picked, note: 'The app is not ready (or does not answer the AI bridge yet).' });
		}
		const kinds = await this._knowledge.reportKinds();
		const pageDocs = (state.page ? await this._knowledge.pagesForAppPage(state.page.id) : [])
			.filter(page => !page.slug.startsWith('apps/') || page.slug.startsWith(`apps/${picked.localId}`));
		const components = state.components ?? [];
		const describe = (componentId: string | undefined) => {
			const component = components.find(c => c.id === componentId);
			if (!component) {
				return undefined;
			}
			const kind = component.about?.kind ? kinds.kinds[component.about.kind] : undefined;
			return {
				componentId: component.id, title: component.title, type: component.type, drawn: component.drawn,
				kind: component.about?.kind, options: component.about?.options,
				shows: kind?.shows ?? kind?.label, members: kind?.members, docs: kind?.docs
			};
		};
		const cards = (state.cards ?? []).map(card => {
			const shown = card.tabs?.length ? card.tabs.find(t => t.key === card.activeTab)?.componentId : components.find(c => c.cardId === card.id)?.id;
			return {
				cardId: card.id, title: card.title, inView: card.inView, visibleFraction: card.visibleFraction,
				activeTab: card.activeTab, tabs: card.tabs?.map(t => ({ key: t.key, label: t.label, componentId: t.componentId })),
				showing: describe(shown)
			};
		});
		const method = state.page ? await this._knowledge.methodology({ appPage: state.page.id }, picked.localId, 'en', 4500) : { briefs: [], sections: [], truncated: false };
		const sent = methodAlreadySent(`${picked.tabId}|page|${state.page?.id}`, input?.includeMethodology);
		return text({
			tab: { tabId: picked.tabId, app: picked.localId, title: picked.title, file: picked.file },
			otherTabs: tabs.filter(t => t.tabId !== picked.tabId).map(t => ({ tabId: t.tabId, app: t.localId, title: t.title })),
			page: state.page && {
				...state.page,
				docs: pageDocs.map(p => ({ title: p.title, url: p.url }))
			},
			methodology: sent
				? { note: 'Already given earlier in this conversation (same page): use it. If it is not in this conversation, call again with includeMethodology: true.', briefs: method.briefs.map(b => ({ title: b.title, url: b.url })), sections: method.sections.map(s => ({ heading: s.heading, url: s.url })) }
				: {
					note: 'The established Countdown methodology for this page. Ground every interpretation, judgement and recommendation in it, cite the section URLs, and do not add methods, options or rules it does not state.' + (method.truncated ? ' Cut to fit: fetch a section with countdown_docs (url) for the rest.' : ''),
					briefs: method.briefs.length ? method.briefs : undefined,
					sections: method.sections.map(s => ({ heading: s.heading, url: s.url, text: s.text }))
				},
			sourcesMarkdown: sourcesMarkdown([...method.briefs.map(b => ({ title: b.title, url: b.url })), ...method.sections], []),
			inView: cards.filter(c => c.inView && c.inView !== 'none'),
			elsewhereOnPage: cards.filter(c => !c.inView || c.inView === 'none').map(c => ({ cardId: c.cardId, title: c.title, activeTab: c.activeTab })),
			viewport: state.viewport,
			filters: state.filters,
			dataset: state.dataset,
			appActions: state.actions?.map(a => `${a.name} (${a.kind})`),
			note: 'Numbers: countdown_cache on this dataset. The data behind a chart on screen, with its methodology: countdown_component. Meaning and method: the methodology above, then countdown_docs -- cite the URLs in a Sources list. Changing the view: shinyApp (navigate, selectTab, setFilters) only when asked.'
		});
	}

	// ---------------------------------------------------------------------------------------------- countdown_component

	/**
	 * The data behind a chart or table on screen (what its download writes), with what it is -- its report kind and
	 * options -- and the methodology that explains it, so an interpretation is grounded and cited. Without an id, the
	 * one component in view; several in view -> the user is asked which.
	 */
	private async _component(input: { componentId?: string; tabId?: string; maxRows?: number; includeMethodology?: boolean }): Promise<vscode.LanguageModelToolResult> {
		const context = await this._tabContext(input?.tabId);
		if (typeof context === 'string') {
			return failure(context);
		}
		const state = context.state;
		if (!state) {
			return failure('The app is not ready (or does not answer the AI bridge yet).');
		}
		const components = state.components ?? [];
		let id = input?.componentId;
		if (!id) {
			const showing = (state.cards ?? [])
				.filter(card => card.inView && card.inView !== 'none')
				.map(card => card.tabs?.length ? card.tabs.find(t => t.key === card.activeTab)?.componentId : components.find(c => c.cardId === card.id)?.id)
				.filter((cid): cid is string => !!cid);
			if (showing.length !== 1) {
				const names = showing.map(cid => `${components.find(c => c.id === cid)?.title ?? cid} (${cid})`).join('; ');
				return failure(showing.length ? `Several charts are in view: ${names}. Ask the user which one, then pass its componentId.` : 'No chart or table is in view. Pass a componentId (see countdown_context).');
			}
			id = showing[0];
		}
		const component = components.find(c => c.id === id);
		if (!component) {
			return failure(`No component "${id}" on this page. Components: ${components.map(c => c.id).join(', ') || 'none'}.`);
		}
		const reply = await appRequest(context.tab, 'getComponentData', { componentId: id, maxRows: Math.max(1, Math.min(input?.maxRows ?? 40, 2000)) });
		if (!reply.ok) {
			return failure(reply.error ?? 'The app could not return the data.');
		}
		const kinds = await this._knowledge.reportKinds();
		const kindId = component.about?.kind;
		const kind = kindId ? kinds.kinds[kindId] : undefined;
		const method = await this._knowledge.methodology({ reportKind: kindId, appPage: state.page?.id }, context.tab.localId, 'en', 4000);
		const sent = methodAlreadySent(`${context.tab.tabId}|${state.page?.id}|${kindId ?? id}`, input?.includeMethodology);
		const dataset = state.dataset?.path ? `${state.dataset.path.split(/[\\/]/).pop()}${state.dataset.revision !== undefined ? `, revision ${state.dataset.revision}` : ''}` : 'the open dataset';
		// methodology and sources first: a long table must never push them out of the result
		return text({
			component: { id, title: component.title, type: component.type, page: state.page?.title, kind: kindId, options: component.about?.options, shows: kind?.shows ?? kind?.label },
			methodology: sent
				? { note: 'Already given earlier in this conversation (same chart and page): use it. If it is not in this conversation, call again with includeMethodology: true.', briefs: method.briefs.map(b => ({ title: b.title, url: b.url })), sections: method.sections.map(s => ({ heading: s.heading, url: s.url })) }
				: {
					note: 'The established Countdown methodology for this chart and page. Interpret, judge and recommend only as it says, citing the section URLs; if it does not cover the question, say so rather than applying general rules of thumb.',
					briefs: method.briefs.length ? method.briefs : undefined,
					sections: method.sections.map(s => ({ heading: s.heading, url: s.url, text: s.text }))
				},
			sourcesMarkdown: sourcesMarkdown([...method.briefs.map(b => ({ title: b.title, url: b.url })), ...method.sections], [`Chart on screen: \`${id}\` (${dataset})`]),
			provenance: { source: 'the chart on screen', componentId: id, dataset: state.dataset?.path, revision: state.dataset?.revision, filters: state.filters, cacheMembers: kind?.members },
			data: reply.result
		});
	}

	// ---------------------------------------------------------------------------------------------- countdown_cache

	private async _cache(input: ICacheInput): Promise<vscode.LanguageModelToolResult> {
		if (!input?.member) {
			return failure('member is required (see countdown_catalog).');
		}
		const guide = await this._knowledge.guide();
		const member = guide.members[input.member];
		if (!member) {
			const close = Object.keys(guide.members).filter(name => name.includes(input.member) || input.member.includes(name)).slice(0, 10);
			return failure(`CacheConnection has no member "${input.member}".${close.length ? ` Did you mean: ${close.join(', ')}?` : ''} Use countdown_catalog to find the right one.`);
		}
		if (member.access === 'write') {
			return failure(`"${input.member}" changes the dataset; the AI only reads it. Reports and graphs are added with countdown_report / countdown_graph.`);
		}
		const context = await this._needDataset(input.tabId);
		if (typeof context === 'string') {
			return failure(context);
		}
		const checked = checkArgs(input.member, member, input.args ?? {}, context.state?.filters ?? {});
		if (typeof checked === 'string') {
			return failure(checked);
		}
		const maxRows = Math.max(1, Math.min(input.maxRows ?? 200, 2000));
		const reply = await this._r.call(context.tab.tabId, context.label, context.dataset,
			`.cdai$run(.cdai$member(${rString(input.member)}, .cdai$arg("${toR(checked.args)}"), ${maxRows}))`);
		if (!reply.ok) {
			return failure(reply.error ?? 'R failed.');
		}
		return text({
			provenance: {
				source: 'CacheConnection',
				member: input.member,
				args: checked.args,
				defaultsFromApp: checked.defaultsUsed,
				dataset: context.dataset!.path,
				country: context.state?.dataset?.country,
				revision: context.dataset!.revision,
				computedAt: new Date().toISOString()
			},
			precomputed: member.precomputed,
			sourcesMarkdown: sourcesMarkdown((member.docs ?? []).map(url => ({ url })), [`Dataset: \`${input.member}(${Object.entries(checked.args).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ')})\` on ${context.dataset!.path.split(/[\\/]/).pop()}${context.dataset!.revision !== undefined ? `, revision ${context.dataset!.revision}` : ''}`]),
			result: reply.result,
			warnings: reply.warnings?.length ? reply.warnings : undefined,
			messages: reply.output
		});
	}

	// ---------------------------------------------------------------------------------------------- countdown_catalog

	private async _catalog(input: ICatalogInput): Promise<vscode.LanguageModelToolResult> {
		const guide = await this._knowledge.guide();
		const kinds = await this._knowledge.reportKinds();
		const terms = (input?.query ?? '').toLowerCase().split(/\W+/).filter(t => t.length > 1);
		// every word must match somewhere; a match in the name counts most, then the question
		const score = (name: string, question: string, rest: string) => {
			let total = 0;
			for (const t of terms) {
				const inName = name.toLowerCase().includes(t);
				const inQuestion = question.toLowerCase().includes(t);
				if (!inName && !inQuestion && !rest.toLowerCase().includes(t)) {
					return -1;
				}
				total += (inName ? 3 : 0) + (inQuestion ? 1 : 0.2);
			}
			return total;
		};
		if (input?.what === 'reportKinds') {
			const found = Object.entries(kinds.kinds)
				.map(([id, k]) => ({ id, k, s: score(id, `${k.label} ${k.shows ?? ''}`, `${k.group} ${(k.members ?? []).join(' ')}`) }))
				.filter(({ k, s }) => (!input.group || k.group === input.group) && s >= 0)
				.sort((a, b) => b.s - a.s)
				.map(({ id, k }) => [id, k] as const)
				.map(([id, k]) => ({ id, label: k.label, type: k.type, group: k.group, appGroups: k.groups, options: { indicators: k.indicators, levels: k.levels, variants: k.variants, year: k.year, regional: k.regional }, members: k.members, docs: k.docs }));
			return text({ reportKinds: found.slice(0, 60), total: found.length });
		}
		const found = Object.entries(guide.members)
			.map(([name, m]) => ({ name, m, s: score(name, m.question, `${m.group} ${m.returns ?? ''} ${(m.reportKinds ?? []).join(' ')}`) }))
			.filter(({ m, s }) => m.access === 'read' && (!input?.group || m.group === input.group) && s >= 0)
			.sort((a, b) => b.s - a.s)
			.map(({ name, m }) => [name, m] as const)
			// compact: the answer usually needs one member; the full entry is a second, narrower call away
			.map(([name, m], i) => ({ member: name, kind: m.kind, group: m.group, question: m.question.length > 160 ? `${m.question.slice(0, 157)}...` : m.question, precomputed: m.precomputed, args: m.args.map(a => `${a.name}${a.required ? '' : '?'}${a.choices?.length ? `: ${a.choices.join('|')}` : ''}`), ...(i < 5 ? { returns: m.returns || undefined, chartable: m.chartable, reportKinds: m.reportKinds, docs: m.docs } : {}) }));
		const groups = [...new Set(Object.values(guide.members).filter(m => m.access === 'read').map(m => m.group))].sort();
		return text({ cacheConnection: `cd2030.core ${guide.version}`, groups, members: found.slice(0, 25), total: found.length, hint: found.length > 25 ? 'Only the first 25: narrow with query (and group).' : undefined });
	}

	// ---------------------------------------------------------------------------------------------- countdown_docs

	private async _docs(input: IDocsInput): Promise<vscode.LanguageModelToolResult> {
		if (input?.url) {
			const sections = await this._knowledge.fetch(input.url);
			return sections.length ? text({ sections }) : failure(`No docs page at ${input.url}. Search with query instead.`);
		}
		if (!input?.query) {
			return failure('Give query (a search) or url (a page or section to read).');
		}
		const hits = await this._knowledge.search(input.query, input.lang ?? 'en', Math.min(input.limit ?? 5, 12));
		return text({ query: input.query, results: hits.map(h => ({ ...h, text: h.text.length > 1500 ? `${h.text.slice(0, 1500)}...` : h.text })), cite: 'Cite the url of each section you use.' });
	}

	// ---------------------------------------------------------------------------------------------- countdown_report

	private async _report(input: IReportInput): Promise<vscode.LanguageModelToolResult> {
		switch (input?.action) {
			case 'listKinds':
				return this._catalog({ what: 'reportKinds', query: input.query, group: input.group });
			case 'listPresets': {
				const context = await this._needDataset(input.tabId);
				if (typeof context === 'string') {
					return failure(context);
				}
				const reply = await this._r.call(context.tab.tabId, context.label, context.dataset,
					'.cdai$run({ ps <- cd2030.core::report_presets(); unname(lapply(names(ps), function(id) list(id = id, name = ps[[id]]$name, blocks = length(ps[[id]]$blocks), kinds = as.list(unique(unlist(lapply(ps[[id]]$blocks, function(b) b$kind))))))) })');
				return reply.ok ? text({ presets: reply.result }) : failure(reply.error ?? 'R failed.');
			}
			case 'build':
			case 'save': {
				if (!input.project) {
					return failure('project is required: { name, blocks: [...] } (see countdown_report listKinds for chart kinds).');
				}
				const context = await this._needDataset(input.tabId);
				if (typeof context === 'string') {
					return failure(context);
				}
				const reply = await this._r.call<{ blocks: number }>(context.tab.tabId, context.label, context.dataset,
					`.cdai$run({ p <- datasuite.ui::report_validate_project(.cdai$arg("${toR(input.project)}", FALSE), members = cd2030.core::cd_chartable_members()); list(valid = TRUE, name = p$name, blocks = length(p$blocks)) })`);
				if (!reply.ok) {
					return failure(`The report is not valid: ${reply.error}`);
				}
				if (input.action === 'build') {
					return text({ valid: true, ...(reply.result as object), next: 'Save it with action "save" (it opens in the Reports page), or export with "generate" after saving.' });
				}
				const saved = await appRequest(context.tab, 'saveReport', { project: input.project });
				return saved.ok ? text({ saved: saved.result, where: 'the Reports page of the app' }) : failure(saved.error ?? 'The app did not save the report.');
			}
			case 'generate': {
				const context = await this._tabContext(input.tabId);
				if (typeof context === 'string') {
					return failure(context);
				}
				if (!input.preset && !input.reportId) {
					return failure('Give preset (a standard report id, see listPresets) or reportId (a saved report).');
				}
				const args: Record<string, unknown> = { format: input.format ?? 'docx' };
				if (input.preset) { args.preset = input.preset; }
				if (input.reportId) { args.reportId = input.reportId; }
				const made = await appRequest(context.tab, 'generateReport', args);
				return made.ok ? text({ generated: made.result }) : failure(made.error ?? 'The app did not generate the report.');
			}
			default:
				return failure('action must be one of listPresets, listKinds, build, save, generate.');
		}
	}

	// ---------------------------------------------------------------------------------------------- countdown_graph

	private async _graph(input: IGraphInput): Promise<vscode.LanguageModelToolResult> {
		if (!input?.spec) {
			return failure('spec is required (see the custom_chart format in the instructions).');
		}
		const context = await this._needDataset(input.tabId);
		if (typeof context === 'string') {
			return failure(context);
		}
		const preview = input.preview !== false;
		const reply = await this._r.call<{ rows: number; columns: string[]; png?: string }>(context.tab.tabId, context.label, context.dataset, `.cdai$run({
	spec <- .cdai$arg("${toR(input.spec)}", FALSE)
	checked <- datasuite.ui::report_validate_spec(spec, members = cd2030.core::cd_chartable_members())
	if (is.list(checked)) spec <- checked
	data <- cd2030.core::cd_custom_chart_data(.cache, spec)
	out <- list(rows = nrow(data), columns = names(data))
	if (${preview ? 'TRUE' : 'FALSE'}) {
		file <- tempfile(fileext = ".png")
		if (requireNamespace("ragg", quietly = TRUE)) ragg::agg_png(file, width = 1600, height = 1000, res = 160) else grDevices::png(file, width = 1600, height = 1000, res = 160)
		print(datasuite.ui::report_plot_spec(data, spec$plot, spec$title))
		grDevices::dev.off()
		out$png <- jsonlite::base64_enc(readBin(file, "raw", file.size(file)))
	}
	out
})`);
		if (!reply.ok) {
			return failure(`The graph is not valid: ${reply.error}`);
		}
		const parts: (vscode.LanguageModelTextPart | vscode.LanguageModelDataPart)[] = [];
		let saved: unknown;
		if (input.save) {
			const added = await appRequest(context.tab, 'addGraph', { spec: input.spec });
			if (!added.ok) {
				return failure(`Drawn, but not saved: ${added.error}`);
			}
			saved = added.result;
		}
		parts.push(new vscode.LanguageModelTextPart(JSON.stringify({ valid: true, rows: reply.result?.rows, columns: reply.result?.columns, saved, note: saved ? 'Saved in the dataset: it redraws with the data and can be added to any report.' : 'Not saved: pass save: true when the user wants to keep it.' })));
		if (reply.result?.png) {
			parts.push(vscode.LanguageModelDataPart.image(Buffer.from(reply.result.png, 'base64'), 'image/png'));
		}
		return new vscode.LanguageModelToolResult(parts);
	}

	// ---------------------------------------------------------------------------------------------- countdown_run_r

	private async _runR(input: { code: string; tabId?: string }): Promise<vscode.LanguageModelToolResult> {
		if (!input?.code) {
			return failure('code is required.');
		}
		const context = await this._needDataset(input.tabId);
		if (typeof context === 'string') {
			return failure(context);
		}
		const kept = saveCode(context.tab, input.code);
		const result = await this._r.executeRaw(context.tab.tabId, context.label, context.dataset, input.code);
		if ('ok' in result) {
			return failure((result as IRReply).error ?? 'R failed.');
		}
		const parts: (vscode.LanguageModelTextPart | vscode.LanguageModelDataPart)[] = [
			new vscode.LanguageModelTextPart(JSON.stringify({
				label: 'computed (not from the app screen or a single CacheConnection member)',
				success: result.success, output: result.text.slice(0, MAX_RESULT_CHARS), error: result.error,
				dataset: context.dataset!.path, revision: context.dataset!.revision, codeSavedTo: kept
			}))
		];
		for (const image of result.images) {
			parts.push(vscode.LanguageModelDataPart.image(Buffer.from(image.data, 'base64'), image.mimeType));
		}
		return new vscode.LanguageModelToolResult(parts);
	}

	// ---------------------------------------------------------------------------------------------- countdown_open_dataset

	private async _open(input: IOpenInput): Promise<vscode.LanguageModelToolResult> {
		if (!input?.path) {
			return failure('path is required.');
		}
		let app = input.app;
		if (!app) {
			const isDir = fs.existsSync(input.path) && fs.statSync(input.path).isDirectory();
			app = isDir ? 'pooled' : 'rmncah';
			if (!isDir && input.path.toLowerCase().endsWith('.rds')) {
				const reply = await this._r.call<string>('countdown-ai-util', 'Countdown AI', undefined,
					`.cdai$run({ x <- readRDS(${rString(input.path)}); tryCatch(cd2030.core::detect_indicator_group(names(x$countdown_data)), error = function(e) NA_character_) })`, 120000);
				if (reply.ok && reply.result === 'vaccine') {
					app = 'vaxx';
				}
			}
		}
		const opened = await vscode.commands.executeCommand<{ tabId: string } | { error: string }>('datasuite.shinyApps.open', `${EXTENSION_ID}#${app}`, input.path);
		if (!opened || 'error' in opened) {
			return failure(opened && 'error' in opened ? opened.error : 'DataSuite did not open the app.');
		}
		return text({ opened: { tabId: opened.tabId, app, file: input.path }, note: 'Use this tabId with the other countdown_* tools; its context is separate from other tabs.' });
	}
}

interface ICacheInput { readonly member: string; readonly args?: Record<string, unknown>; readonly tabId?: string; readonly maxRows?: number }
interface ICatalogInput { readonly query?: string; readonly group?: string; readonly what?: 'members' | 'reportKinds' }
interface IDocsInput { readonly query?: string; readonly url?: string; readonly lang?: string; readonly limit?: number }
interface IReportInput { readonly action: string; readonly tabId?: string; readonly project?: unknown; readonly preset?: string; readonly reportId?: string; readonly format?: string; readonly query?: string; readonly group?: string }
interface IGraphInput { readonly spec: unknown; readonly preview?: boolean; readonly save?: boolean; readonly tabId?: string }
interface IOpenInput { readonly path: string; readonly app?: 'rmncah' | 'vaxx' | 'pooled' }

/** Checks a member's arguments against the guide, filling missing ones from the app's filters where the guide maps them. */
export function checkArgs(name: string, member: IGuideMember, given: Record<string, unknown>, filters: Record<string, unknown>): { args: Record<string, unknown>; defaultsUsed: Record<string, unknown> } | string {
	if (member.kind === 'binding') {
		return Object.keys(given).length ? `"${name}" is a precomputed value; it takes no arguments.` : { args: {}, defaultsUsed: {} };
	}
	const known = new Map(member.args.map(a => [a.name, a]));
	const unknown = Object.keys(given).filter(k => !known.has(k));
	if (unknown.length) {
		return `"${name}" has no argument ${unknown.join(', ')}. Its arguments: ${member.args.map(a => a.name).join(', ') || '(none)'}.`;
	}
	const args: Record<string, unknown> = { ...given };
	const defaultsUsed: Record<string, unknown> = {};
	for (const arg of member.args) {
		const filter = member.defaults?.[arg.name];
		const fromApp = filter ? filters[filter] : undefined;
		// a filter only fills an argument it is a valid value for (the national page's admin_level "national" is not
		// a level decompose_change attributes to; its own default applies then)
		const allowed = !arg.choices?.length || (Array.isArray(fromApp) ? fromApp : [fromApp]).every(v => arg.choices!.includes(String(v)));
		if (args[arg.name] === undefined && filter && fromApp !== undefined && fromApp !== null && fromApp !== '' && allowed) {
			args[arg.name] = filters[filter];
			defaultsUsed[arg.name] = filters[filter];
		}
	}
	for (const arg of member.args) {
		const value = args[arg.name];
		if (value === undefined) {
			if (arg.required) {
				return `"${name}" needs ${arg.name}${arg.choices?.length ? ` (one of ${arg.choices.join(', ')})` : ''}.`;
			}
			continue;
		}
		if (arg.choices?.length) {
			const values = Array.isArray(value) ? value : [value];
			const bad = values.filter(v => !arg.choices!.includes(String(v)));
			if (bad.length) {
				return `${arg.name} must be one of ${arg.choices.join(', ')} (got ${bad.join(', ')}).`;
			}
		}
	}
	return { args, defaultsUsed };
}

/** Keeps free R code in the tab's working folder (`<stem>.shiny-workspace/ai/`), for the record. */
function saveCode(tab: ITab, code: string): string | undefined {
	const dir = workspaceDir(tab);
	if (!dir) {
		return undefined;
	}
	try {
		const target = path.join(dir, 'ai');
		fs.mkdirSync(target, { recursive: true });
		const file = path.join(target, `analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.R`);
		fs.writeFileSync(file, `# Written by the Countdown AI; .cache is the dataset (read-only CacheConnection).\n${code}\n`);
		return file;
	} catch {
		return undefined;
	}
}
