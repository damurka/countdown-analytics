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
import { appRequest, appState, countdownTabs, EXTENSION_ID, IAppState, ITab, pickTab, tabDataset, workspaceDir, appPlan } from './app';
import { IGuideMember, Knowledge } from './knowledge';
import { CountdownR, IExecuteResult, IRReply, riskyRReasons, rString, toR, truncateMiddle } from './r';
import { DocVectors, embedQuery, IDocVectors } from './docindex';
import { bm25, chunkUnits, cosine, docKey, IChunk, isScannedPage, quotedPhrase, rankBy, rrf, snippet, tokenize } from './docsearch';

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

	constructor(private readonly _knowledge: Knowledge, private readonly _r: CountdownR, private readonly _storageDir: string) { }

	register(): vscode.Disposable[] {
		return [
			vscode.lm.registerTool('countdown_context', { invoke: options => this._context(options.input as { tabId?: string; includeMethodology?: boolean }) }),
			vscode.lm.registerTool('countdown_component', { invoke: options => this._component(options.input as { componentId?: string; tabId?: string; maxRows?: number; includeMethodology?: boolean }) }),
			vscode.lm.registerTool('countdown_cache', { invoke: options => this._cache(options.input as ICacheInput) }),
			vscode.lm.registerTool('countdown_catalog', { invoke: options => this._catalog(options.input as ICatalogInput) }),
			vscode.lm.registerTool('countdown_docs', { invoke: options => this._docs(options.input as IDocsInput) }),
			vscode.lm.registerTool('countdown_report', {
				prepareInvocation: options => this._prepareChange(options.input as IReportInput, reportChange(options.input as IReportInput)),
				invoke: options => this._report(options.input as IReportInput)
			}),
			vscode.lm.registerTool('countdown_graph', {
				prepareInvocation: options => this._prepareChange(options.input as IGraphInput, graphChange(options.input as IGraphInput)),
				invoke: options => this._graph(options.input as IGraphInput)
			}),
			vscode.lm.registerTool('countdown_documents', {
				prepareInvocation: options => this._prepareDocuments(options.input as IDocumentsInput),
				invoke: options => this._documents(options.input as IDocumentsInput)
			}),
			vscode.lm.registerTool('countdown_run_r', {
				prepareInvocation: options => prepareRunR(options.input as IRunRInput),
				invoke: (options, token) => this._runR(options.input as IRunRInput, token)
			}),
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

	/**
	 * Before a tool changes the app: what the change would do, in words, and -- when the user's setting wants a
	 * replace confirmed -- the chat's Allow/Skip. Adding a report, chart or file and changing the view are not asked
	 * about. The tool then tells DataSuite the call is confirmed, so it doesn't ask again in a dialog.
	 */
	private async _prepareChange(input: { tabId?: string }, change: IAppChange | undefined): Promise<vscode.PreparedToolInvocation | undefined> {
		if (!change) {
			return undefined;
		}
		const tab = await pickTab(input.tabId);
		if (typeof tab === 'string') {
			return undefined;
		}
		const plan = await appPlan(tab, change.action, change.args);
		if (!plan) {
			return undefined;
		}
		return {
			invocationMessage: `${plan.summary}...`,
			confirmationMessages: plan.policy === 'confirm' ? {
				title: change.title ?? 'Replace something saved?',
				message: new vscode.MarkdownString(`${plan.summary}?\n\n(Setting: \`datasuite.shinyApps.aiAppControl\`.)`)
			} : undefined
		};
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
		// the dataset's key selections (country, denominators, survey, years, levels, adjustment), read in the tab's R
		// session while the rest is gathered: most simple questions are answered from these alone
		const dataset = tabDataset(picked, state);
		const selectionsPromise = dataset
			? this._r.call<Record<string, unknown>>(picked.tabId, `Countdown AI: ${picked.title ?? picked.localId}`, dataset, '.cdai$run(.cdai$selections())', 120000)
				.then(reply => reply.ok ? reply.result : { note: `Could not read them: ${reply.error}` }, () => undefined)
			: Promise.resolve(undefined);
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
		const selections = await selectionsPromise;
		return text({
			tab: { tabId: picked.tabId, app: picked.localId, title: picked.title, file: picked.file },
			selections: selections && { ...selections, note: 'The dataset\'s current settings, read from its CacheConnection (cite as the dataset\'s settings). Answer questions about them (the denominator, survey, years, levels, adjustment) from here without further calls.' },
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
		// what the chart's columns mean (cd2030.core's data dictionary), read in the tab's R session
		const dataColumns = (reply.result as { columns?: unknown } | undefined)?.columns;
		let columnMeanings: unknown;
		if (context.dataset && Array.isArray(dataColumns) && dataColumns.length) {
			const described = await this._r.call(context.tab.tabId, context.label, context.dataset,
				`.cdai$run(.cdai$meanings(.cdai$arg("${toR(dataColumns)}")))`);
			columnMeanings = described.ok ? described.result : undefined;
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
			columnMeanings: columnMeanings ?? undefined,
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
			`.cdai$run(.cdai$member(${rString(input.member)}, .cdai$arg("${toR(checked.args)}"), ${maxRows}, .cdai$arg("${toR(input.select ?? [])}"), .cdai$arg("${toR(input.where ?? {})}", FALSE)))`);
		if (!reply.ok) {
			return failure(reply.error ?? 'R failed.');
		}
		return text({
			provenance: {
				source: 'CacheConnection',
				member: input.member,
				args: checked.args,
				select: input.select?.length ? input.select : undefined,
				where: input.where && Object.keys(input.where).length ? input.where : undefined,
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
		// the naming conventions come with every catalog answer: column names and ids are read with them, never guessed
		const dictionary = guide.dictionary ? {
			note: 'What ids and column names mean. anc1/penta1 are the ANC1-/Penta1-derived denominators; ids ending in "derived" are the population-growth options. Results also carry columnMeanings.',
			denominators: guide.dictionary.denominators?.map(d => ({ id: d.id, label: d.label, meaning: d.meaning })),
			naming: guide.dictionary.grammar?.map(g => `${g.pattern}: ${g.meaning} (e.g. ${g.example})`)
		} : undefined;
		return text({ cacheConnection: `cd2030.core ${guide.version}`, dictionary, groups, members: found.slice(0, 25), total: found.length, hint: found.length > 25 ? 'Only the first 25: narrow with query (and group).' : undefined });
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
		// small results: a search is for finding the right sections; fetch one (url) for its full text
		const hits = await this._knowledge.search(input.query, input.lang ?? 'en', Math.min(input.limit ?? 5, 8));
		return text({ query: input.query, results: hits.map(h => ({ ...h, text: h.text.length > 600 ? `${h.text.slice(0, 600)}... (fetch this url for the full section)` : h.text })), cite: 'Cite the url of each section you use.' });
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
				// confirmed: the chat asked the user when the setting wanted it (prepareInvocation)
				const saved = await appRequest(context.tab, 'saveReport', reportChange(input)!.args, { confirmed: true });
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
				const made = await appRequest(context.tab, 'generateReport', reportChange(input)!.args, { confirmed: true });
				if (!made.ok) {
					return failure(made.error ?? 'The app did not generate the report.');
				}
				// a link the user can click: DataSuite opens a Word/PowerPoint file in its default application
				const file = (made.result as { file?: unknown } | undefined)?.file;
				const link = typeof file === 'string' ? `[${path.basename(file)}](${vscode.Uri.file(file).toString()})` : undefined;
				return text({ generated: made.result, link, note: link ? 'Give the user this link to the file (it opens in Word or PowerPoint).' : undefined });
			}
			case 'listReports': {
				const context = await this._needDataset(input.tabId);
				if (typeof context === 'string') {
					return failure(context);
				}
				const reply = await this._r.call(context.tab.tabId, context.label, context.dataset,
					`.cdai$run(${REPORT_FN('report_list')}(.cache$report_projects))`);
				return reply.ok ? text({ reports: reply.result, next: 'Read one with action "readReport" (reportId).' }) : failure(reply.error ?? 'R failed.');
			}
			case 'readReport': {
				if (!input.reportId) {
					return failure('reportId is required (see listReports).');
				}
				const context = await this._needDataset(input.tabId);
				if (typeof context === 'string') {
					return failure(context);
				}
				const maxRows = Math.max(1, Math.min(input.maxRows ?? 25, 100));
				const reply = await this._r.call(context.tab.tabId, context.label, context.dataset, `.cdai$run({
	id <- ${rString(input.reportId)}
	p <- .cache$report_projects[[id]]
	if (!is.list(p)) stop(sprintf("There is no saved report %s. The saved reports: %s.", id, paste(names(.cache$report_projects), collapse = ", ")), call. = FALSE)
	${REPORT_FN('report_read')}(.cache, p, id = id, lang = if (is.null(.cache$language)) "en" else .cache$language, data = ${input.data === false ? 'FALSE' : 'TRUE'}, max_rows = ${maxRows})
})`);
				if (!reply.ok) {
					return failure(reply.error ?? 'R failed.');
				}
				return text({
					report: reply.result,
					provenance: { source: 'the saved report, its charts and tables drawn from the dataset', dataset: context.dataset!.path, revision: context.dataset!.revision },
					note: 'To write or change text, or change blocks: action "updateBlocks" with this reportId and changes by block id -- never save the whole report again. Write in the report\'s language (lang), from these numbers only (a chart\'s data, title, subtitle and caption), in plain language, naming the period and the denominator where they matter.'
				});
			}
			case 'updateText':
			case 'updateBlocks': {
				if (!input.reportId || !Array.isArray(input.changes) || !input.changes.length) {
					return failure('reportId and changes are required: changes = [{ blockId, text } | { afterBlockId, insert: { type, text } } | { blockId, kind, options, ... } | { blockId, delete: true } | { blockId, moveAfter }] (block ids from readReport).');
				}
				const context = await this._needDataset(input.tabId);
				if (typeof context === 'string') {
					return failure(context);
				}
				const problem = await this._kindChangeProblem(context, input.reportId, input.changes);
				if (problem) {
					return failure(problem);
				}
				// confirmed: the chat asked the user when the setting wanted it (prepareInvocation)
				const changed = await appRequest(context.tab, 'updateBlocks', reportChange(input)!.args, { confirmed: true });
				return changed.ok ? text({ changed: changed.result, where: 'the Reports page of the app (an open report shows the change at once)' }) : failure(changed.error ?? 'The app did not change the report.');
			}
			default:
				return failure('action must be one of listPresets, listKinds, build, save, generate, listReports, readReport, updateBlocks.');
		}
	}

	/**
	 * A change of a chart's kind must keep its data: the new kind must draw from a CacheConnection member the old one
	 * does (ai/report-kinds.json). Returns why not, with the kinds that do, or undefined.
	 */
	private async _kindChangeProblem(context: ITabContext, reportId: string, changes: unknown[]): Promise<string | undefined> {
		const wanted = changes
			.map(c => c as { blockId?: unknown; kind?: unknown })
			.filter(c => typeof c?.kind === 'string' && typeof c.blockId === 'string') as { blockId: string; kind: string }[];
		if (!wanted.length) {
			return undefined;
		}
		const reply = await this._r.call<{ id: string; kind?: string }[]>(context.tab.tabId, context.label, context.dataset,
			`.cdai$run(lapply(datasuite.ui::report_project_blocks(.cache$report_projects[[${rString(reportId)}]]), function(b) list(id = if (is.null(b$id)) "" else b$id, kind = b$kind)))`);
		if (!reply.ok || !Array.isArray(reply.result)) {
			return undefined;
		}
		const kinds = (await this._knowledge.reportKinds()).kinds;
		const members = (id: string | undefined) => (id ? kinds[id]?.members ?? [] : []);
		for (const w of wanted) {
			const from = reply.result.find(b => b.id === w.blockId)?.kind;
			if (!from || from === w.kind || from === 'custom_chart' || w.kind === 'custom_chart') {
				continue;
			}
			const old = members(from);
			if (!old.length || !members(w.kind).length || members(w.kind).some(m => old.includes(m))) {
				continue;
			}
			const same = Object.entries(kinds).filter(([id, k]) => id !== from && (k.members ?? []).some(m => old.includes(m))).map(([id]) => id);
			return `Block ${w.blockId} is a "${from}", drawn from ${old.join(', ')}; "${w.kind}" draws other data. Kinds with the same data: ${same.join(', ') || 'none'}. Ask the user before replacing the chart with another one (delete it and insert the new kind).`;
		}
		return undefined;
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
		const reply = await this._r.call<{ rows: number; columns: string[] }>(context.tab.tabId, context.label, context.dataset, `.cdai$run({
	spec <- .cdai$arg("${toR(input.spec)}", FALSE)
	checked <- datasuite.ui::report_validate_spec(spec, members = cd2030.core::cd_chartable_members())
	if (is.list(checked)) spec <- checked
	data <- cd2030.core::cd_custom_chart_data(.cache, spec)
	# the plot's columns must be in the data (checked even without a preview, so a chart that can't be drawn isn't passed)
	used <- unlist(spec$plot[c("x", "y", "colour", "fill", "facet")], use.names = FALSE)
	unknown <- setdiff(used[is.character(used) & nzchar(used)], names(data))
	if (length(unknown)) stop(sprintf("The plot uses %s, which the data doesn't have. Its columns are: %s.", paste(unknown, collapse = ", "), paste(names(data), collapse = ", ")), call. = FALSE)
	plot <- datasuite.ui::report_plot_spec(data, spec$plot, spec$title)
	invisible(ggplot2::ggplot_build(plot))
	if (${preview ? 'TRUE' : 'FALSE'}) {
		# drawn on the session's own device: the kernel sends the plot, which comes back with the reply's images
		# (at this size for this call only, where the kernel can say so: .elara.cell_options() in tools:jovian from
		# Jovian 0.2.6, hera::cell_options() before)
		size <- if ("tools:jovian" %in% search()) get0(".elara.cell_options", envir = as.environment("tools:jovian"), inherits = FALSE)
			else if (requireNamespace("hera", quietly = TRUE) && "cell_options" %in% getNamespaceExports("hera")) getExportedValue("hera", "cell_options")
		if (is.function(size)) size(repr.plot.width = 10, repr.plot.height = 6.25, repr.plot.res = 160)
		print(plot)
	}
	list(rows = nrow(data), columns = names(data))
})`);
		if (!reply.ok) {
			return failure(`The graph is not valid: ${reply.error}`);
		}
		const parts: (vscode.LanguageModelTextPart | vscode.LanguageModelDataPart)[] = [];
		let saved: unknown;
		if (input.save) {
			const added = await appRequest(context.tab, 'addGraph', graphChange(input)!.args, { confirmed: true });
			if (!added.ok) {
				return failure(`Drawn, but not saved: ${added.error}`);
			}
			saved = added.result;
		}
		const image = preview ? reply.images?.find(i => i.mimeType === 'image/png') : undefined;
		const png = image ? Buffer.from(image.data, 'base64') : undefined;
		const figure = png ? saveFigure(context.tab, png, graphTitle(input.spec)) : undefined;
		parts.push(new vscode.LanguageModelTextPart(JSON.stringify({ valid: true, rows: reply.result?.rows, columns: reply.result?.columns, saved, note: saved ? 'Saved in the dataset: it redraws with the data and can be added to any report.' : 'Not saved: pass save: true when the user wants to keep it.', figure })));
		if (png) {
			parts.push(vscode.LanguageModelDataPart.image(png, 'image/png'));
		}
		return new vscode.LanguageModelToolResult(parts);
	}

	// ---------------------------------------------------------------------------------------------- countdown_run_r

	private async _runR(input: IRunRInput, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
		if (!input?.code) {
			return failure('code is required.');
		}
		const context = await this._needDataset(input.tabId);
		if (typeof context === 'string') {
			return failure(context);
		}
		const timeoutSeconds = Math.max(1, Math.min(Math.round(typeof input.timeoutSeconds === 'number' ? input.timeoutSeconds : 300), 3600));
		// the chat's Stop interrupts R (the objects made so far remain)
		const stop = token.onCancellationRequested(() => this._r.interrupt(context.tab.tabId));
		let result: IExecuteResult | IRReply;
		try {
			result = await this._r.executeRaw(context.tab.tabId, context.label, context.dataset, input.code, timeoutSeconds * 1000);
		} finally {
			stop.dispose();
		}
		if ('ok' in result) {
			return failure((result as IRReply).error ?? 'R failed.');
		}
		const executed = result;
		// only code that ran to the end is kept, as a script that re-runs on its own
		const kept = executed.success ? saveCode(context.tab, input.code, context.dataset!, input.title) : undefined;
		const figures = executed.images
			.filter(image => image.mimeType === 'image/png')
			.map((image, i) => saveFigure(context.tab, Buffer.from(image.data, 'base64'), `${input.title?.trim() || 'R plot'}${executed.images.length > 1 ? ` ${i + 1}` : ''}`))
			.filter(figure => !!figure);
		const status = executed.success ? 'ok' : executed.timedOut ? 'timed out' : executed.sessionEnded !== undefined ? 'session ended' : executed.interrupted ? 'interrupted' : 'error';
		const notes = [
			executed.restartNotice,
			executed.timedOut ? `Interrupted after ${timeoutSeconds} s (the timeout). Objects created before the interrupt still exist; run the slow part on less data, or call again with a larger timeoutSeconds.` : undefined,
			executed.sessionEnded !== undefined ? `The R session ended during this run (${executed.sessionEnded}); the next call starts a new one with .cache loaded again, but objects from earlier runs are gone.` : undefined,
			!executed.success && workspaceDir(context.tab) ? 'Not kept in scripts/ (only code that runs without error is kept).' : undefined,
			executed.images.length > MAX_R_IMAGES ? `${executed.images.length - MAX_R_IMAGES} more plots not attached (draw at most ${MAX_R_IMAGES} per call); all are kept in figures/.` : undefined
		].filter((note): note is string => !!note);
		const parts: (vscode.LanguageModelTextPart | vscode.LanguageModelDataPart)[] = [
			new vscode.LanguageModelTextPart(JSON.stringify({
				label: 'computed (not from the app screen or a single CacheConnection member)',
				status, success: executed.success,
				output: truncateMiddle(stripColours(executed.text), R_OUTPUT_CHARS),
				error: executed.error ? truncateMiddle(stripColours(executed.error), 6000) : undefined,
				notes: notes.length ? notes : undefined,
				dataset: context.dataset!.path, revision: context.dataset!.revision, codeSavedTo: kept,
				figures: figures.length ? figures : undefined
			}))
		];
		for (const image of executed.images.slice(0, MAX_R_IMAGES)) {
			parts.push(vscode.LanguageModelDataPart.image(Buffer.from(image.data, 'base64'), image.mimeType));
		}
		return new vscode.LanguageModelToolResult(parts);
	}

	// ---------------------------------------------------------------------------------------------- countdown_documents

	/** The documents' embeddings for meaning search (docindex.ts). */
	private readonly _vectors = new DocVectors();

	/**
	 * Documents the user gives the AI for context: the dataset's analysis folder `documents/`, or a file they attached.
	 * Reading a file outside that folder asks the user first (the chat's Allow/Skip).
	 */
	private async _prepareDocuments(input: IDocumentsInput): Promise<vscode.PreparedToolInvocation | undefined> {
		if (!input?.file || !path.isAbsolute(input.file)) {
			return undefined;
		}
		const tab = await pickTab(input.tabId);
		const home = typeof tab === 'string' ? undefined : workspaceDir(tab);
		if (home && isInside(input.file, home)) {
			return undefined;
		}
		return {
			invocationMessage: `Reading ${path.basename(input.file)}...`,
			confirmationMessages: {
				title: 'Read a document?',
				message: new vscode.MarkdownString(`Let the AI read \`${input.file}\`? It is outside the dataset's documents folder.`)
			}
		};
	}

	private async _documents(input: IDocumentsInput): Promise<vscode.LanguageModelToolResult> {
		const context = await this._tabContext(input?.tabId);
		if (typeof context === 'string') {
			return failure(context);
		}
		const home = workspaceDir(context.tab);
		const folder = home ? path.join(home, 'documents') : undefined;
		const action = input?.action ?? 'list';

		if (action === 'list') {
			const files = folder ? listDocuments(folder) : [];
			return text({
				folder: folder ?? null,
				documents: files.map(f => ({ file: path.relative(folder!, f.path).replace(/\\/g, '/'), path: f.path, type: f.type, size: f.size, modified: f.modified, units: this._cachedUnits(f.path), meaningSearch: this._vectors.status(this._docCachePath(f.path)) ?? 'not indexed yet (done on the first search)' })),
				note: files.length
					? 'Read one with action "read" (file = its name; range = pages/slides/sections, e.g. "3-5"), or search all of them with "search" (by keywords and meaning; "quoted" for an exact phrase). Cite as "<file>, <marker>".'
					: `No documents yet. The user can put PDF, Word, PowerPoint, Excel, CSV or text files in ${folder ?? "the dataset's analysis folder"}\\documents, or attach one to the chat (then pass its full path as file).`
			});
		}

		if (action === 'read') {
			const file = resolveDocument(input.file, folder);
			if (typeof file !== 'string' || !fs.existsSync(file)) {
				return failure(typeof file === 'string' ? `There is no document ${input.file}.` : file.error);
			}
			const doc = await this._docText(context, file);
			if (typeof doc === 'string') {
				return failure(doc);
			}
			const [from, to] = parseRange(input.range, doc.units.length);
			// scanned pages (no text layer): their rendered image, for the AI to look at
			const scanned: number[] = [];
			for (let i = from; i <= to && scanned.length < DOC_READ_IMAGES; i++) {
				if (isScannedPage(doc.type, doc.units[i - 1].text)) {
					scanned.push(i - 1);
				}
			}
			const cache = this._docCachePath(file);
			const rendered = scanned.length && cache ? await this._renderPages(context, file, cache, scanned) : {};
			const images: { marker: string; path: string; markdown: string }[] = [];
			let body = '';
			let last = from - 1;
			for (let i = from; i <= to; i++) {
				const unit = doc.units[i - 1];
				const isScanned = isScannedPage(doc.type, unit.text);
				const png = isScanned && typeof rendered !== 'string' ? rendered[i - 1] : undefined;
				const piece = isScanned
					? `[${unit.marker}]\n(scanned page: no text layer. ${png ? `Its image is attached -- read it from the image; saved at ${png}` : typeof rendered === 'string' ? `Its image could not be rendered: ${rendered}` : `Read this page alone (range "${i}") to see its image`}.)\n\n`
					: `[${unit.marker}]\n${unit.text.trim()}\n\n`;
				if (body.length && body.length + piece.length > DOC_READ_CHARS) {
					break;
				}
				body += piece.length > DOC_READ_CHARS ? `${piece.slice(0, DOC_READ_CHARS)}\n... (cut)\n` : piece;
				last = i;
				if (png) {
					images.push({ marker: unit.marker, path: png, markdown: `![${path.basename(file)}, ${unit.marker}](${vscode.Uri.file(png).toString()})` });
				}
			}
			const result = text({
				file: path.basename(file), path: file, type: doc.type, units: doc.units.length,
				shown: `${from}-${last}`, next: last < to ? `${last + 1}-${to}` : undefined,
				cite: `Cite as "${path.basename(file)}, <marker>" (the [marker] before each part).`,
				text: body || '(no text: a scanned PDF has no text layer)',
				scannedPages: images.length ? { note: 'Scanned pages have no text: their images are attached (read the words from them; no OCR was run). Show one to the user with its markdown.', images } : undefined
			});
			if (!images.length) {
				return result;
			}
			const parts: (vscode.LanguageModelTextPart | vscode.LanguageModelDataPart)[] = [...result.content as vscode.LanguageModelTextPart[]];
			for (const image of images) {
				parts.push(vscode.LanguageModelDataPart.image(fs.readFileSync(image.path), 'image/png'));
			}
			return new vscode.LanguageModelToolResult(parts);
		}

		if (action === 'search') {
			if (!input.query) {
				return failure('query is required for search.');
			}
			const single = input.file ? resolveDocument(input.file, folder) : undefined;
			if (single && typeof single !== 'string') {
				return failure(single.error);
			}
			const files = single ? [single] : folder ? listDocuments(folder).map(f => f.path) : [];
			// a regex or a "quoted phrase" is found exactly; anything else is ranked by keywords and meaning
			const exact = input.isRegexp ? input.query : quotedPhrase(input.query);
			if (exact === undefined) {
				return this._rankedSearch(context, input.query, files, Math.max(1, Math.min(input.maxResults ?? 12, 100)));
			}
			let pattern: RegExp;
			try {
				pattern = new RegExp(input.isRegexp ? exact : exact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
			} catch (error) {
				return failure(`Not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`);
			}
			const max = Math.max(1, Math.min(input.maxResults ?? 30, 200));
			const matches: { file: string; marker: string; snippet: string }[] = [];
			const problems: string[] = [];
			for (const file of files) {
				const doc = await this._docText(context, file);
				if (typeof doc === 'string') {
					problems.push(`${path.basename(file)}: ${doc}`);
					continue;
				}
				for (const u of doc.units) {
					for (const m of u.text.matchAll(pattern)) {
						const at = m.index ?? 0;
						matches.push({ file: path.basename(file), marker: u.marker, snippet: u.text.slice(Math.max(0, at - 160), at + m[0].length + 160).replace(/\s+/g, ' ').trim() });
						if (matches.length >= max) {
							break;
						}
					}
					if (matches.length >= max) {
						break;
					}
				}
				if (matches.length >= max) {
					break;
				}
			}
			return text({ query: input.query, searched: files.map(f => path.basename(f)), matches, more: matches.length >= max ? 'more matches: narrow the query or raise maxResults' : undefined, problems: problems.length ? problems : undefined });
		}
		return failure('action must be list, read or search.');
	}

	/** A document's text as citable units, extracted once in the tab's R session and cached by file, size and time. */
	private async _docText(context: ITabContext, file: string): Promise<IDocText | string> {
		const cache = this._docCachePath(file);
		if (cache && fs.existsSync(cache)) {
			try {
				return JSON.parse(fs.readFileSync(cache, 'utf8')) as IDocText;
			} catch {
				// re-extract
			}
		}
		if (!cache) {
			return `Can't read ${file}.`;
		}
		fs.mkdirSync(path.dirname(cache), { recursive: true });
		// R writes the text to the cache file (a long document would be too much to pass back through the session)
		const reply = await this._r.call<{ units: number }>(context.tab.tabId, context.label, undefined,
			`.cdai$run({ x <- .cdai$doc_units(${rString(file)}); jsonlite::write_json(x, ${rString(cache)}, auto_unbox = TRUE, null = "null"); list(units = length(x$units)) })`, 600000);
		if (!reply.ok) {
			return reply.error ?? 'R could not read the document.';
		}
		let doc: IDocText;
		try {
			doc = JSON.parse(fs.readFileSync(cache, 'utf8')) as IDocText;
		} catch (error) {
			return `Could not read the extracted text: ${error instanceof Error ? error.message : String(error)}`;
		}
		// a new or changed document: index it for meaning search in the background (a search waits for it)
		void this._index(context, file, cache, doc);
		return doc;
	}

	private _docCachePath(file: string): string | undefined {
		try {
			const stat = fs.statSync(file);
			return path.join(this._storageDir, 'documents', `${docKey(path.resolve(file), stat.size, stat.mtimeMs)}.json`);
		} catch {
			return undefined;
		}
	}

	private _cachedUnits(file: string): number | undefined {
		const cache = this._docCachePath(file);
		if (!cache || !fs.existsSync(cache)) {
			return undefined;
		}
		try {
			return (JSON.parse(fs.readFileSync(cache, 'utf8')) as IDocText).units.length;
		} catch {
			return undefined;
		}
	}

	/** A document's vectors for meaning search, embedding it (text chunks and scanned pages) when it has none. */
	private _index(context: ITabContext, file: string, cache: string, doc: IDocText) {
		return this._vectors.ensure(path.basename(file), cache, doc.type, doc.units, units => this._renderPages(context, file, cache, units));
	}

	/** Scanned PDF pages (0-based units) rendered to PNGs next to the text cache, by unit; an error message when R can't. */
	private async _renderPages(context: ITabContext, file: string, cache: string, units: readonly number[]): Promise<Record<number, string> | string> {
		const pngFor = (unit: number) => cache.replace(/\.json$/, `-p${unit + 1}.png`);
		const out: Record<number, string> = {};
		const missing = units.filter(u => !fs.existsSync(pngFor(u)));
		if (missing.length) {
			const reply = await this._r.call<unknown>(context.tab.tabId, context.label, undefined,
				`.cdai$run(.cdai$doc_render_pages(${rString(file)}, .cdai$arg("${toR(missing.map(u => u + 1))}"), .cdai$arg("${toR(missing.map(u => pngFor(u).replace(/\\/g, '/')))}")))`, 900000);
			if (!reply.ok) {
				return reply.error ?? 'R could not render the pages.';
			}
		}
		for (const u of units) {
			if (fs.existsSync(pngFor(u))) {
				out[u] = pngFor(u);
			}
		}
		return out;
	}

	/**
	 * Search ranked by keywords (BM25 over ~1,500-character chunks) and, when DataSuite's embeddings are available, by
	 * meaning (the query's embedding against the chunks' and the scanned pages'), fused by reciprocal rank (k = 60).
	 * Without embeddings it is keyword alone, with a note saying why.
	 */
	private async _rankedSearch(context: ITabContext, query: string, files: readonly string[], max: number): Promise<vscode.LanguageModelToolResult> {
		const problems: string[] = [];
		const q = files.length ? await embedQuery(query) : undefined;
		const entries: { file: string; doc: IDocText; chunk: IChunk; vector?: Float32Array }[] = [];
		let embedded = 0;
		for (const file of files) {
			const doc = await this._docText(context, file);
			if (typeof doc === 'string') {
				problems.push(`${path.basename(file)}: ${doc}`);
				continue;
			}
			let vectors: IDocVectors | undefined;
			if (q?.ok) {
				const indexed = await this._index(context, file, this._docCachePath(file)!, doc);
				if ('ok' in indexed) {
					problems.push(`${path.basename(file)}: keyword search only (${indexed.message})`);
				} else if (indexed.model !== q.model || indexed.dimensions !== q.vector.length) {
					problems.push(`${path.basename(file)}: keyword search only (indexed with ${indexed.model}, not ${q.model})`);
				} else {
					vectors = indexed;
					embedded++;
				}
			}
			const chunks = vectors?.chunks ?? chunkUnits(doc.type, doc.units);
			chunks.forEach((chunk, i) => entries.push({ file, doc, chunk, vector: vectors?.vectors[i] }));
		}
		const chunkText = (e: typeof entries[number]) => e.chunk.image ? '' : e.doc.units[e.chunk.unit].text.slice(e.chunk.start, e.chunk.end);
		const words = tokenize(query);
		const keyword = rankBy(bm25(entries.map(e => tokenize(chunkText(e))), words), 100);
		const similarity = entries.map(e => q?.ok && e.vector ? cosine(q.vector, e.vector) : -1);
		const meaning = rankBy(similarity, 50, -1);
		const seen = new Set<string>();
		const matches: { file: string; marker: string; matched: string; similarity?: number; snippet: string }[] = [];
		for (const hit of rrf([keyword, meaning])) {
			const e = entries[hit.id];
			const id = `${e.file}|${e.chunk.unit}`;
			if (seen.has(id)) {
				continue;
			}
			seen.add(id);
			matches.push({
				file: path.basename(e.file), marker: e.chunk.marker,
				matched: hit.in.length > 1 ? 'both' : hit.in[0] === 0 ? 'keyword' : 'meaning',
				similarity: similarity[hit.id] >= 0 ? Math.round(similarity[hit.id] * 100) / 100 : undefined,
				snippet: e.chunk.image ? '(scanned page with no text: read it to see the page image)' : snippet(chunkText(e), words)
			});
			if (matches.length >= max) {
				break;
			}
		}
		const note = !q || q.ok
			? (embedded ? undefined : files.length ? 'Keyword search only (no document is indexed for meaning search).' : undefined)
			: `Keyword search only: meaning search is unavailable (${q.reason}: ${q.message}).`;
		return text({
			query, searchedBy: embedded ? 'keywords and meaning' : 'keywords', searched: files.map(f => path.basename(f)), matches,
			note, howToRead: matches.length ? 'Ranked best first. Meaning-only matches may be loosely related: read the part before citing it. Put the query in "double quotes" for an exact phrase, or use isRegexp.' : undefined,
			problems: problems.length ? problems : undefined
		});
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

interface ICacheInput { readonly member: string; readonly args?: Record<string, unknown>; readonly tabId?: string; readonly maxRows?: number; readonly select?: string[]; readonly where?: Record<string, unknown> }
interface ICatalogInput { readonly query?: string; readonly group?: string; readonly what?: 'members' | 'reportKinds' }
interface IDocsInput { readonly query?: string; readonly url?: string; readonly lang?: string; readonly limit?: number }
interface IReportInput { readonly action: string; readonly tabId?: string; readonly project?: unknown; readonly preset?: string; readonly reportId?: string; readonly format?: string; readonly query?: string; readonly group?: string; readonly changes?: unknown[]; readonly maxRows?: number; readonly data?: boolean }

/** A datasuite.ui report function in the tab's R session, or an error saying the app's R packages need updating. */
const REPORT_FN = (name: string) => `(function() { f <- tryCatch(getExportedValue("datasuite.ui", "${name}"), error = function(e) NULL); if (is.null(f)) stop("Reading and changing saved reports needs datasuite.ui 0.3.4 and cd2030.core 1.3.4: update the app's R packages (DataSuite updates them when the Countdown extension updates).", call. = FALSE); f })()`;
interface IGraphInput { readonly spec: unknown; readonly preview?: boolean; readonly save?: boolean; readonly graphId?: string; readonly tabId?: string }

/** An app action a tool call would run, with its arguments. */
interface IAppChange { readonly action: string; readonly args: Record<string, unknown>; readonly title?: string }

/**
 * The app change a countdown_report call makes: save (saveReport), generate (generateReport) or updateBlocks
 * (updateBlocks; updateText is its older name); none for the others.
 */
function reportChange(input: IReportInput): IAppChange | undefined {
	if ((input?.action === 'updateBlocks' || input?.action === 'updateText') && input.reportId && Array.isArray(input.changes) && input.changes.length) {
		return { action: 'updateBlocks', args: { reportId: input.reportId, changes: input.changes }, title: 'Change a saved report?' };
	}
	if (input?.action === 'save' && input.project) {
		return { action: 'saveReport', args: input.reportId ? { project: input.project, reportId: input.reportId } : { project: input.project } };
	}
	if (input?.action === 'generate' && (input.preset || input.reportId)) {
		const args: Record<string, unknown> = { format: input.format ?? 'docx' };
		if (input.preset) { args.preset = input.preset; }
		if (input.reportId) { args.reportId = input.reportId; }
		return { action: 'generateReport', args };
	}
	return undefined;
}

/** The app change a countdown_graph call makes: addGraph when it saves the graph. */
function graphChange(input: IGraphInput): IAppChange | undefined {
	return input?.save && input.spec ? { action: 'addGraph', args: input.graphId ? { spec: input.spec, graphId: input.graphId } : { spec: input.spec } } : undefined;
}
interface IOpenInput { readonly path: string; readonly app?: 'rmncah' | 'vaxx' | 'pooled' }
interface IRunRInput { readonly code: string; readonly tabId?: string; readonly title?: string; readonly timeoutSeconds?: number }

/** The most R output countdown_run_r returns (the start and end are kept) and the most plots it attaches. */
const R_OUTPUT_CHARS = 20000;
const MAX_R_IMAGES = 4;

/**
 * Before countdown_run_r runs: the code's purpose as the chat's message, and -- when the code looks risky, or the
 * user's setting (datasuite.r.aiCodeConfirmation, shared with DataSuite's runR) wants every run confirmed -- the
 * chat's Allow/Skip with the code.
 */
function prepareRunR(input: IRunRInput): vscode.PreparedToolInvocation {
	const code = typeof input?.code === 'string' ? input.code : '';
	const what = input?.title?.trim() || code.split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith('#'))?.slice(0, 80) || 'R';
	const invocationMessage = `Running R on the dataset: ${what}`;
	const setting = vscode.workspace.getConfiguration('datasuite.r').get<string>('aiCodeConfirmation') ?? 'risky';
	const reasons = riskyRReasons(code);
	if (setting === 'never' || (setting !== 'always' && !reasons.length)) {
		return { invocationMessage };
	}
	const fence = '`'.repeat(3);
	return {
		invocationMessage,
		confirmationMessages: {
			title: reasons.length ? `Run this R code? It ${reasons.join('; ')}.` : 'Run this R code?',
			message: new vscode.MarkdownString(`${fence}r\n${code}\n${fence}\n\n(Setting: \`datasuite.r.aiCodeConfirmation\`.)`)
		}
	};
}
interface IDocumentsInput { readonly action?: 'list' | 'read' | 'search'; readonly file?: string; readonly range?: string; readonly query?: string; readonly isRegexp?: boolean; readonly maxResults?: number; readonly tabId?: string }
interface IDocText { readonly type: string; readonly units: readonly { readonly marker: string; readonly text: string }[] }

/** The most text one read returns; `next` gives the rest. */
const DOC_READ_CHARS = 20000;
/** Scanned page images one read attaches at most. */
const DOC_READ_IMAGES = 4;
const DOC_TYPES = new Set(['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'txt', 'md', 'markdown', 'json', 'html', 'htm', 'rmd']);

function isInside(file: string, folder: string): boolean {
	const rel = path.relative(path.resolve(folder), path.resolve(file));
	return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** The documents in a folder (and one level of subfolders): the types the tool can read. */
function listDocuments(folder: string): { path: string; type: string; size: number; modified: string }[] {
	const out: { path: string; type: string; size: number; modified: string }[] = [];
	const walk = (dir: string, depth: number) => {
		let entries: fs.Dirent[] = [];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory() && depth < 1) {
				walk(full, depth + 1);
			} else if (entry.isFile() && !entry.name.startsWith('~$')) {
				const type = path.extname(entry.name).slice(1).toLowerCase();
				if (DOC_TYPES.has(type)) {
					const stat = fs.statSync(full);
					out.push({ path: full, type, size: stat.size, modified: stat.mtime.toISOString() });
				}
			}
		}
	};
	walk(folder, 0);
	return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** A document named by the model: a full path (an attached file), or a name in the dataset's documents folder. */
function resolveDocument(file: string | undefined, folder: string | undefined): string | { error: string } {
	if (!file) {
		return { error: 'file is required: a document name from action "list", or the full path of an attached file.' };
	}
	if (path.isAbsolute(file)) {
		return file;
	}
	if (!folder) {
		return { error: 'This tab has no analysis folder; give the full path of the document.' };
	}
	const direct = path.join(folder, file);
	if (fs.existsSync(direct)) {
		return direct;
	}
	const byName = listDocuments(folder).find(f => path.basename(f.path).toLowerCase() === path.basename(file).toLowerCase());
	return byName ? byName.path : direct;
}

/** "3", "3-5" or "3-" as 1-based units, clamped; everything when empty. */
function parseRange(range: string | undefined, count: number): [number, number] {
	if (!count) {
		return [1, 0];
	}
	const m = /^\s*(\d+)?\s*(?:-\s*(\d+)?)?\s*$/.exec(range ?? '');
	if (!m || (!m[1] && !m[2])) {
		return [1, count];
	}
	const from = Math.min(Math.max(1, Number(m[1] ?? 1)), count);
	const to = range!.includes('-') ? Math.min(count, Number(m[2] ?? count)) : from;
	return [from, Math.max(from, to)];
}

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

/** A figure the AI drew, kept in the dataset's analysis folder. */
interface IFigure {
	/** The saved PNG, in the dataset's analysis folder. */
	readonly path: string;
	/** Paste this into the answer to show the figure (the user can open or save it from there). */
	readonly markdown: string;
}

/** The title of a custom_chart spec, for a figure's name and alt text. */
function graphTitle(spec: unknown): string {
	const title = (spec as { title?: unknown } | undefined)?.title;
	return typeof title === 'string' && title.trim() ? title.trim() : 'Custom graph';
}

/** R's console colour codes (tibbles, cli messages) mean nothing to the model and cost tokens: drop them. */
const COLOUR_CODES = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
function stripColours(text: string): string {
	return text.replace(COLOUR_CODES, '');
}

/**
 * Keeps a figure the AI drew with the data it is about: `<stem>.shiny-workspace/figures/<title>-<time>.png`
 * (the dataset's analysis folder; chats live elsewhere). Returns the file and a Markdown image to embed, or undefined
 * when the tab has no analysis folder or it can't be written.
 */
function saveFigure(tab: ITab, png: Buffer, title: string): IFigure | undefined {
	const dir = workspaceDir(tab);
	if (!dir) {
		return undefined;
	}
	try {
		const target = path.join(dir, 'figures');
		fs.mkdirSync(target, { recursive: true });
		const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'figure';
		const file = path.join(target, `${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
		fs.writeFileSync(file, png);
		const alt = title.replace(/[\[\]\\]/g, '');
		return { path: file, markdown: `![${alt}](${vscode.Uri.file(file).toString()})` };
	} catch {
		return undefined;
	}
}

/**
 * The R code the AI ran on the dataset, as a script that re-runs on its own: it attaches what the AI's session has and
 * opens the same dataset read-only as `.cache` (the revision it ran on is noted), then the code.
 */
export function rerunnableScript(code: string, dataset: { path: string; revision?: number }, title: string | undefined, when: Date): string {
	return [
		`# ${title?.trim() || 'Countdown analysis'} -- run by the Countdown AI on ${when.toISOString()}`,
		`# Dataset: ${dataset.path.replace(/\\/g, '/')}${dataset.revision !== undefined ? ` (revision ${dataset.revision})` : ''}`,
		'# Re-run: source() this file in R with cd2030.core installed. The dataset is opened read-only.',
		'suppressPackageStartupMessages({ library(cd2030.core); library(dplyr); library(tidyr) })',
		`.cache <- cd2030.core::init_CacheConnection(rds_path = ${rString(dataset.path)}, read_only = TRUE)`,
		'',
		code,
		''
	].join('\n');
}

/**
 * Keeps the R code the AI ran on the dataset (only code that ran without error):
 * `<stem>.shiny-workspace/scripts/<title>-<time>.R`, re-runnable on its own, and appended to the day's
 * `scripts/session-<date>.R` (the analysis in order).
 */
function saveCode(tab: ITab, code: string, dataset: { path: string; revision?: number }, title?: string): string | undefined {
	const dir = workspaceDir(tab);
	if (!dir) {
		return undefined;
	}
	try {
		const target = path.join(dir, 'scripts');
		fs.mkdirSync(target, { recursive: true });
		const now = new Date();
		const slug = (title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'analysis';
		const file = path.join(target, `${slug}-${now.toISOString().replace(/[:.]/g, '-')}.R`);
		fs.writeFileSync(file, rerunnableScript(code, dataset, title, now));
		const session = path.join(target, `session-${now.toISOString().slice(0, 10)}.R`);
		fs.appendFileSync(session, fs.existsSync(session)
			? `\n# ---- ${title?.trim() || 'analysis'} (${now.toISOString()})\n${code}\n`
			: rerunnableScript(code, dataset, `Countdown AI session of ${now.toISOString().slice(0, 10)}: ${title?.trim() || 'analysis'}`, now));
		return file;
	} catch {
		return undefined;
	}
}
