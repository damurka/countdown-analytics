/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// What the Countdown AI knows without R: the CacheConnection guide and the report-kind guide (ai/*.json, generated
// by scripts/generate-ai-guide.R from the installed cd2030.core and the docs), and the methodology docs corpus
// (ai/corpus.json, a snapshot of https://datasuite.damurka.com/ai/corpus.json, refreshed from the site when newer).

import * as vscode from 'vscode';

export interface IGuideArg {
	readonly name: string;
	readonly required?: boolean;
	readonly default?: string;
	readonly choices?: readonly string[];
	readonly description?: string;
}

export interface IGuideMember {
	readonly kind: 'method' | 'binding';
	readonly access: 'read' | 'write';
	readonly group: string;
	readonly question: string;
	readonly returns?: string;
	readonly precomputed: boolean;
	readonly chartable: boolean;
	readonly args: readonly IGuideArg[];
	/** Bridge filter that supplies an argument by default: `{ admin_level: "admin_level" }`. */
	readonly defaults?: Record<string, string>;
	readonly reportKinds?: readonly string[];
	readonly docs?: readonly string[];
	readonly status?: 'draft' | 'reviewed';
}

export interface IGuide {
	readonly package: string;
	readonly version: string;
	readonly generatedAt: string;
	readonly members: Record<string, IGuideMember>;
}

export interface IReportKind {
	readonly label: string;
	readonly type: string;
	readonly group: string;
	readonly groups: readonly string[];
	readonly indicators?: readonly string[] | null;
	readonly levels?: readonly string[] | null;
	readonly variants?: readonly string[] | null;
	readonly year?: boolean;
	readonly regional?: boolean;
	readonly shows?: string;
	readonly members?: readonly string[];
	readonly docs?: readonly string[];
	readonly status?: 'draft' | 'reviewed';
}

export interface IReportKinds {
	readonly version: string;
	readonly kinds: Record<string, IReportKind>;
}

interface ICorpusSection { readonly anchor: string; readonly heading: string; readonly text: string }
/** A page's AI brief (datasuite-docs src/ai/BRIEFS.md): the method as explicit lists, each item citing its section. */
export interface IBrief {
	readonly status: 'draft' | 'reviewed';
	readonly summary: string;
	readonly definitions?: readonly string[];
	readonly options?: readonly string[];
	readonly steps?: readonly string[];
	readonly rules?: readonly string[];
	readonly interpretation?: readonly string[];
	readonly notCovered?: readonly string[];
}
/** A brief as the tools send it (see citedBrief). */
export interface IPageBrief extends IBrief {
	readonly title: string;
	/** The page: an item's `(#anchor)` is a section of it (link = url + #anchor); countdown_docs fetches it in full. */
	readonly url: string;
}
interface ICorpusPage {
	readonly url: string;
	readonly lang: string;
	readonly title: string;
	readonly slug: string;
	readonly frontmatter: { readonly topics?: string[]; readonly indicators?: string[]; readonly reportKinds?: string[]; readonly cacheMembers?: string[]; readonly appPages?: string[] };
	readonly sections: readonly ICorpusSection[];
	readonly ai?: IBrief;
}
interface ICorpus { readonly version: string; readonly generatedAt: string; readonly pages: readonly ICorpusPage[] }

export interface IDocHit {
	readonly url: string;
	readonly title: string;
	readonly heading: string;
	readonly lang: string;
	readonly text: string;
	readonly score?: number;
}

const CORPUS_URL = 'https://datasuite.damurka.com/ai/corpus.json';
const SITE = 'https://datasuite.damurka.com';

/**
 * A page's brief as the tools send it. Items keep their short source -- `(#anchor)`, a section of this page (`(#)`
 * is its introduction) -- and the page's `url` is given once, so the link to cite is `url` + `#anchor`; `(/en/...)`
 * sources become full site links.
 */
function citedBrief(page: ICorpusPage): IPageBrief {
	const brief = page.ai!;
	const cite = (item: string) => item.replace(/\((\/(?:en|fr|pt)\/[^)\s]*)\)/g, (_, route: string) => `(${SITE}${route})`);
	const list = (items: readonly string[] | undefined) => items?.length ? items.map(cite) : undefined;
	return {
		title: page.title, url: page.url, status: brief.status, summary: brief.summary,
		definitions: list(brief.definitions), options: list(brief.options), steps: list(brief.steps), rules: list(brief.rules),
		interpretation: list(brief.interpretation), notCovered: list(brief.notCovered)
	};
}

function tokens(text: string): string[] {
	return (text.toLowerCase().match(/[a-z0-9À-ɏ_]{2,}/g) ?? []);
}

export class Knowledge {

	private _guide: IGuide | undefined;
	private _kinds: IReportKinds | undefined;
	private _corpus: ICorpus | undefined;
	private _df: Map<string, number> | undefined;

	constructor(private readonly _context: vscode.ExtensionContext) { }

	async guide(): Promise<IGuide> {
		return this._guide ??= await this._readJson<IGuide>(vscode.Uri.joinPath(this._context.extensionUri, 'ai', 'cache-guide.json'));
	}

	async reportKinds(): Promise<IReportKinds> {
		return this._kinds ??= await this._readJson<IReportKinds>(vscode.Uri.joinPath(this._context.extensionUri, 'ai', 'report-kinds.json'));
	}

	/** The docs corpus: the newer of the bundled snapshot and the one last fetched from the site. */
	async corpus(): Promise<ICorpus> {
		if (!this._corpus) {
			const bundled = await this._readJson<ICorpus>(vscode.Uri.joinPath(this._context.extensionUri, 'ai', 'corpus.json'));
			const fetched = await this._readJson<ICorpus>(vscode.Uri.joinPath(this._context.globalStorageUri, 'corpus.json')).catch(() => undefined);
			this._corpus = fetched && fetched.generatedAt > bundled.generatedAt ? fetched : bundled;
		}
		return this._corpus;
	}

	/** Fetches the site's corpus in the background and keeps it when it is newer (next load uses it). */
	async refreshCorpus(): Promise<void> {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 15000);
			const response = await fetch(CORPUS_URL, { signal: controller.signal }).finally(() => clearTimeout(timer));
			if (!response.ok) {
				return;
			}
			const text = await response.text();
			const remote = JSON.parse(text) as ICorpus;
			const current = await this.corpus();
			if (!Array.isArray(remote.pages) || remote.version === current.version || remote.generatedAt <= current.generatedAt) {
				return;
			}
			await vscode.workspace.fs.createDirectory(this._context.globalStorageUri);
			await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(this._context.globalStorageUri, 'corpus.json'), Buffer.from(text, 'utf8'));
			this._corpus = remote;
			this._df = undefined;
		} catch {
			// offline or not published yet: the bundled snapshot stays
		}
	}

	/** Pages whose front matter names this app page id. */
	async pagesForAppPage(pageId: string, lang = 'en'): Promise<ICorpusPage[]> {
		const corpus = await this.corpus();
		return corpus.pages.filter(page => page.lang === lang && (page.frontmatter.appPages ?? []).includes(pageId));
	}

	/**
	 * The methodology for an app page (or a report kind): the full sections of the docs pages linked to it, the
	 * framework pages (the method itself) first, then the app's own pages (how the screen presents it). Capped so it
	 * fits a tool result; `truncated` says when sections were cut. This is what answers are to be grounded in.
	 */
	async methodology(link: { appPage?: string; reportKind?: string }, app: string, lang = 'en', maxChars = 9000): Promise<{ briefs: IPageBrief[]; sections: IDocHit[]; truncated: boolean }> {
		const corpus = await this.corpus();
		let pages = corpus.pages.filter(page => page.lang === lang);
		if (!pages.length) {
			pages = corpus.pages.filter(page => page.lang === 'en');
		}
		const linked = pages.filter(page =>
			(link.appPage && (page.frontmatter.appPages ?? []).includes(link.appPage)) ||
			(link.reportKind && (page.frontmatter.reportKinds ?? []).includes(link.reportKind)))
			// another app's pages describe that app's screens, not this one's
			.filter(page => !page.slug.startsWith('apps/') || page.slug.startsWith(`apps/${app}`));
		const ordered = [...linked.filter(p => p.slug.includes('framework')), ...linked.filter(p => !p.slug.includes('framework'))];
		// a page with a usable brief is sent as its brief (short, explicit, every item cited); the others as sections
		const useDrafts = vscode.workspace.getConfiguration('countdown.ai').get<boolean>('useDraftBriefs', false);
		const briefs: IPageBrief[] = [];
		const withoutBrief: ICorpusPage[] = [];
		for (const page of ordered) {
			if (page.ai && page.ai.summary && (page.ai.status === 'reviewed' || useDrafts)) {
				briefs.push(citedBrief(page));
			} else {
				withoutBrief.push(page);
			}
		}
		const sections: IDocHit[] = [];
		let used = 0;
		let truncated = false;
		for (const page of withoutBrief) {
			for (const section of page.sections) {
				if (!section.text.trim()) {
					continue;
				}
				const room = maxChars - used;
				if (room < 200) {
					truncated = true;
					break;
				}
				const body = section.text.length > room ? `${section.text.slice(0, room)} ...` : section.text;
				truncated ||= body.length < section.text.length;
				sections.push({ url: section.anchor ? `${page.url}#${section.anchor}` : page.url, title: page.title, heading: section.heading, lang: page.lang, text: body });
				used += body.length;
			}
		}
		return { briefs, sections, truncated };
	}

	/** Search the docs: sections ranked by the query's terms (rarer terms weigh more; headings and titles more than text). */
	async search(query: string, lang = 'en', limit = 5): Promise<IDocHit[]> {
		const corpus = await this.corpus();
		let pages = corpus.pages.filter(page => page.lang === lang);
		if (!pages.length) {
			pages = corpus.pages.filter(page => page.lang === 'en');
		}
		const df = this._documentFrequencies(corpus);
		const total = corpus.pages.reduce((n, page) => n + page.sections.length, 0) || 1;
		const terms = [...new Set(tokens(query))];
		const hits: IDocHit[] = [];
		for (const page of pages) {
			const title = new Set(tokens(page.title));
			const links = new Set([...(page.frontmatter.indicators ?? []), ...(page.frontmatter.reportKinds ?? []), ...(page.frontmatter.cacheMembers ?? []), ...(page.frontmatter.topics ?? [])].map(s => s.toLowerCase()));
			for (const section of page.sections) {
				const heading = tokens(section.heading);
				const body = tokens(section.text);
				let score = 0;
				for (const term of terms) {
					const idf = Math.log(1 + total / (1 + (df.get(term) ?? 0)));
					const count = body.filter(t => t === term).length;
					score += idf * ((count ? 1 + Math.log(count) : 0) + (heading.includes(term) ? 3 : 0) + (title.has(term) ? 2 : 0) + (links.has(term) ? 2 : 0));
				}
				if (score > 0) {
					hits.push({ url: section.anchor ? `${page.url}#${section.anchor}` : page.url, title: page.title, heading: section.heading, lang: page.lang, text: section.text, score: Math.round(score * 100) / 100 });
				}
			}
		}
		return hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, limit);
	}

	/** A page (all its sections) or one section, by URL (`...#anchor`). */
	async fetch(url: string): Promise<IDocHit[]> {
		const corpus = await this.corpus();
		const [base, anchor] = url.split('#');
		const normalise = (u: string) => u.replace(/\/+$/, '');
		const page = corpus.pages.find(p => normalise(p.url) === normalise(base)) ?? corpus.pages.find(p => normalise(p.url).endsWith(normalise(base)) || p.slug === base.replace(/^\/+|\/+$/g, ''));
		if (!page) {
			return [];
		}
		const sections = anchor ? page.sections.filter(s => s.anchor === anchor) : page.sections;
		return sections.map(s => ({ url: s.anchor ? `${page.url}#${s.anchor}` : page.url, title: page.title, heading: s.heading, lang: page.lang, text: s.text }));
	}

	private _documentFrequencies(corpus: ICorpus): Map<string, number> {
		if (!this._df) {
			this._df = new Map();
			for (const page of corpus.pages) {
				for (const section of page.sections) {
					for (const term of new Set(tokens(`${section.heading} ${section.text}`))) {
						this._df.set(term, (this._df.get(term) ?? 0) + 1);
					}
				}
			}
		}
		return this._df;
	}

	private async _readJson<T>(uri: vscode.Uri): Promise<T> {
		const bytes = await vscode.workspace.fs.readFile(uri);
		return JSON.parse(Buffer.from(bytes).toString('utf8')) as T;
	}
}
