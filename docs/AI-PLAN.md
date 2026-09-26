# The Countdown AI: plan

Rewritten 2026-09-26 around these decisions:

- **`CacheConnection` is the single source of truth.** Almost everything is precomputed and cached there; the AI needs
  nothing else from cd2030.core.
- **The MCP server in cd2030.core is deleted.**
- **No Countdown tools or knowledge in the DataSuite workbench.** Everything Countdown -- tools, instructions,
  knowledge, DHIS2 Countdown mode -- lives in this extension, so another extension with its own AI can't collide.
- **The methodology lives in datasuite-docs** (https://datasuite.damurka.com); the AI reads it from there.
- **One dataset, one tab.** An open app puts its dataset in the context; a dataset the user names is opened in its own
  app tab, with its own context.
- **Countdown knowledge is always available**; data needs a dataset tab.
- **The AI is mostly read-only**, but may add to a dataset: custom graphs (as report blocks), custom reports, and it
  may start standard report generation.
- **The AI bridge is held** and released with the rest, since this changes it.
- **Custom graphs redraw** like the other charts: a declarative chart kind, not a picture.
- **The guides stay current through CI**: generated from the packages, with pull requests for what needs a person.
- **Heavy work runs in its own R session**, so the app and the chat stay responsive.
- **DHIS2 is a separate area**: its Countdown mode is out of this plan.

## 1. What the AI must be able to do

| The user asks | The AI needs |
| --- | --- |
| Which page am I on? What can you see? | the screen: page, cards, tabs, what is in view |
| What is this page / chart about? What is its significance? | the meaning of a page or chart, from the methodology docs, plus the chart's own data |
| Which district is behind this drop? | the same data one level down, and a correct way to attribute a change |
| How is Penta3 at district level? (asked on another page) | the data regardless of the page, and where it is shown |
| What is a denominator? How does Countdown work? How do I get DHIS2 data for Countdown? | the docs, with no dataset open |
| Make me a graph of X / a report on Y / the standard coverage report | report kinds, blocks, presets, export, and a way to save into the dataset |
| Look at `C:\data\ghana.rds` | open it in its own tab and work there |

And it must never guess a method, an argument, a number or a definition, and never answer from the wrong dataset.

## 2. Architecture

```
DataSuite (generic)                         countdown-analytics (all Countdown AI)       cd2030 packages
-----------------------------------         ---------------------------------------      -------------------------------
R sessions, package installer, runR          instructions (scoped to Countdown tabs)     CacheConnection  <- the data
shinyApps contribution point                 countdown_* tools                           (precomputed members, reports,
AI bridge: state + requests + permission     a Countdown AI R session per dataset tab     report kinds and presets,
browser tools (read page, screenshot)        knowledge: CacheConnection guide,            custom_chart, revision)
API for extensions: app tabs, bridge,          report-kind guide, docs corpus snapshot   bridge state and actions:
  R sessions, open an app                    CI: guide updates, agreement check, evals     filters, dataset, reports,
                                                                                            graphs; chart identity
datasuite.ui: the in-page bridge,            datasuite-docs: the methodology,              (report kind + options)
report engine (blocks, export, plots)          published with an AI corpus
```

### The vocabulary that links everything: report kinds

cd2030.core already names every chart and table it can draw: the **46 report kinds** (`report_block_kinds()`, e.g.
`reporting_rate`, `derived_coverage`, `denominator_trend`), each with its options (indicators, levels, variants, year,
regional). We use that name everywhere:

- **On screen**, every chart card says which kind it is and with which options (its `about`).
- **In reports**, a chart block *is* a kind with options.
- **In the knowledge**, the extension's report-kind guide says for each kind: what it shows, which `CacheConnection`
  members produce its data, which docs page explains it, how to read it, and how it drills down.

So "this chart" -> kind + options -> its data (members) and its meaning (docs); "add this to a report" -> the same kind;
"which district is behind this" -> the same kind at `district` level.

## 3. The data: teaching `CacheConnection` to the AI

`CacheConnection` has 192 public members: 106 methods (45 `set_*`, 13 `calculate_*`, 11 `get_*`, `check_*`,
`filter_*`...) and 86 active bindings, most of them precomputed results (`reporting_rate_district`,
`completeness_admin1`, `outliers_district`, ...). All are documented in `CacheConnection.Rd`.

**What the AI gets:**

1. **A generated manifest**, read from the *installed* cd2030.core (R6 introspection + `CacheConnection.Rd`), so it
   always matches the code the app runs: every member, method or binding, its arguments and allowed values
   (`arg_match` choices), its documentation, and its prerequisites (the `check_*` bindings).
2. **A curated guide in this extension** (`ai/cache-guide.json`), keyed by member name, adding what code can't say:
   the group (data quality, denominators, coverage, equity, mortality, ...), the question it answers, the columns and
   units it returns, whether it is precomputed or computed on call, which report kinds use it, the docs page that
   explains it, and a short example. Setters are marked `write` and are not callable by the AI except the few allowed
   (section 6).
3. **Kept current by CI**: the manifest is regenerated from each cd2030.core release. When `CacheConnection` or the
   report kinds change, cd2030.core's release workflow opens a pull request on this extension that updates the guide
   (removed members dropped, changed arguments updated, new members added as drafts filled from their documentation and
   marked for review). The extension's own CI checks that the guide and the installed package agree, so nothing ships
   out of step.

**How the AI gets data -- no free-form guessing:**

- Each dataset tab gets its own **Countdown AI R session** (started by this extension through DataSuite's R session
  API), holding a **read-only** copy of the tab's `.rds` as `.cache`. The app saves every change to the `.rds` at once,
  and the bridge state carries the cache's **revision**; before each call the session reloads if the revision moved.
  So the AI computes on exactly what the app has, and neither the app nor the chat waits on the other.
- `countdown_cache` runs **one member** of that `CacheConnection` by name, with arguments checked against the manifest.
  Arguments not given take the app's current values (filters from the bridge state; denominator, adjustments, survey
  values from the cache itself), and the result says which were used. Members that compute on call are marked in the
  guide, so the AI can tell the user it is working.
- The result is a table with **provenance**: member, arguments, dataset, revision, time.
- `runR` in the same session stays for analysis no member covers. Anything computed this way is labelled computed,
  with its code kept in the tab's working folder.

## 4. The knowledge: the methodology docs

The methodology stays in datasuite-docs (185 pages in English, French and Portuguese: 16 framework pages, RMNCAH 13,
Vaxx 9, Pooled, data extractor). To make it usable by the AI:

- **Front matter links** on each docs page: `topics`, `indicators`, `reportKinds`, `cacheMembers`, `appPages`. That is
  how a chart or member finds its explanation, and the docs team keeps it with the text.
- **An AI corpus published with the site** at build time: every page split into sections (heading, anchor, text,
  language, front matter), as `https://datasuite.damurka.com/ai/corpus.json`, plus `llms.txt`. Answers cite the
  section URL.
- **A snapshot in this extension** (built from the corpus at release), so it works offline; refreshed from the site
  when online (the corpus carries a version).
- `countdown_docs` searches it and fetches sections, in the user's language when available.

## 5. The screen: the AI bridge

The generic bridge (datasuite.ui in the page, DataSuite reading it) reports, when read:

- **page**: id, title, section;
- **cards**: id, title, kind, the **active tab**, **in view** (full / partial / none, measured in the browser at that
  moment) and the viewport's scroll position; **tabs** with key, label, component id, `drawn`;
- **components** (charts and tables): id, card, tab, and `about` -- for Countdown charts `{ kind, options }` (the report
  kind and its options), passed through untouched by the generic layers;
- **filters** and **dataset** (path, country, revision), from cd2030.core.

Actions: `listPages`, `listComponents`, `getComponentData`, `focusComponent`, `selectTab`, `navigate`, plus the
Countdown ones cd2030.core registers: `setFilters`, `saveReport`, `addGraph`, `generateReport` -- read ones freely,
the others under the user's `aiAppControl` setting. (Data queries don't go through the app; see section 3.)

The context shows the in-view components first, so "what can you see" is answered from what is actually on screen; the
AI calls `getState` for a fresh reading, or takes a screenshot of the visible window, when unsure.

## 6. What the AI may add: graphs and reports

All writes go **through the running app** (bridge actions), so the app's own `CacheConnection` saves them -- never a
second process writing the same `.rds` behind the app's back.

| The user asks | The AI does | Saved as |
| --- | --- | --- |
| "Generate the national coverage report" | picks the standard report (`report_presets()`, 11 today), `generateReport(preset, format)` | a Word/PowerPoint/PDF file in the tab's working folder; optionally the report in the dataset |
| "Make me a report on data quality in the north" | builds a report project: its own text blocks + chart/table blocks from the report kinds, with options (regions, years); `saveReport` | a report in the dataset: it opens in the Reports page, the user edits it, exports it |
| "Plot ANC4 against Penta3 by region" (no kind fits) | writes a `custom_chart` spec (section 13), previews it in its R session, `addGraph` | a chart in the dataset's saved graphs, drawn like any other kind: it redraws when the data changes, takes chart options, and can be added to any report |

The report-kind guide (extension) tells the AI what each kind shows and which options it takes; the report engine
(datasuite.ui) validates a project or spec before it is saved. No code is stored in a dataset: a custom chart is data
(a member, simple transforms, a plot description), so opening a dataset never runs anything the AI wrote.

## 7. Datasets and tabs

- An open app tab **is** a dataset context: its path, country and revision are in the context.
- "Look at `ghana.rds`": the AI asks to open it (`countdown_open_dataset`) in the right app, in a **new tab**; from then
  on that tab has its own context. Tools take a tab and default to the active one; the answer names the dataset.
- With no tab open, the AI answers Countdown questions from the docs, and for data asks the user to open a dataset.

## 8. DataSuite: what leaves, what stays

**Leaves the workbench (moves here, or goes):**

| Today | Goes to |
| --- | --- |
| Countdown text in the agent prompts (`defaultAgentInstructions.tsx`, `kimiPrompts.tsx`) | this extension's instructions |
| `cd2030Docs`, `readCd2030Cache` in the R tool set; Countdown words in the "Shiny App" context | this extension's tools and context |
| The `.rds`-next-to-the-data rule (`resolveShinySourcePath`) | a `shinyApps[].cache` contribution field, filled by this extension |
| `docsSearch` over apps' `docs-index.json` | `countdown_docs` here |
| "Countdown to 2030" on the Start page, Countdown themes | contributed by this extension |

**Stays (generic):** R sessions and the package installer, `runR`, the `shinyApps` contribution point, the AI bridge
and its permission setting, the browser tools, and the API for extensions (section 13) -- which is how this
extension's tools reach app tabs and R sessions.

**Out of scope:** DHIS2, including its Countdown mapping mode and `dhis2_getCountdownIndicators`. It is a separate area
with its own plan.

Also fixed: the context key that scopes instructions to an app (`shinyAppEditorAppId` holds the full id
`datasuite.countdown-analytics#rmncah`, so this extension's `when` clauses never matched).

## 9. cd2030.core and datasuite.ui changes

- **cd2030.core**: delete the MCP server (`R/mcp_*.R`, its tests, `ellmer`/`mcptools` from Suggests); chart cards
  declare `about = { kind, options }`; register the Countdown bridge actions (`setFilters`, `saveReport`, `addGraph`,
  `generateReport`) and state (filters, dataset with revision); a cache revision that increases on every save; opening
  read-only for the AI's copy; the `custom_chart` kind (data from a member, transforms) and saved graphs in the
  dataset; the manifest generator and the release workflow that opens the guide pull request.
- **datasuite.ui**: the bridge's cards, tabs, in view, `drawn`, tables, `selectTab`, `about` passthrough (protocol 2);
  the report engine's project and spec validation; drawing a `custom_chart` plot description (generic: a table in, a
  ggplot out).
- **datasuite-docs**: front matter links; the corpus and `llms.txt` at build; CI checks the links against the
  manifest.

## 10. Rules the AI follows (this extension's instructions)

1. Every number comes from a tool result: on screen (`getChartData`), from the cache (`countdown_cache`), or computed
   (`runR`) -- and the answer says which, with the settings used.
2. Meaning comes from the docs (`countdown_docs`), cited.
3. Never invent a member, argument, report kind or definition; if the manifest or docs don't have it, say so.
4. "This" is resolved from what is in view; if several things match, ask.
5. The dataset is only changed by adding a report or graph, through the app, and only when asked; the view only under
   the user's permission setting.
6. A question about another page is answered from the cache, naming the page where it is shown, offering to open it.
7. "Why did this change" uses `decompose_change()`, and says that its higher-level figure is rebuilt from the lower
   level, so it can differ a little from the figure the app shows (e.g. 27.5% against 28.0%). It uses the attribution method (a `CacheConnection` member for it, to be added if missing), checks
   reporting rates, and says when a change may be missing reports rather than fewer services.

## 11. Evaluation

A set of questions with expected tools, members, arguments and numbers on cd2030.core's sample dataset, plus report and
graph requests with the blocks expected; run in this extension's CI against the released packages, and end to end
before each release.

## 12. Phases (one release)

| # | Work | Repos |
| --- | --- | --- |
| 1 | Delete the MCP server; `about` on chart cards; Countdown bridge actions and state; cache revision; read-only open; `custom_chart` kind and saved graphs; an attribution member if missing; manifest generator | cd2030.core |
| 2 | Bridge protocol 2: cards, tabs, in view, `drawn`, tables, `selectTab`, `about`; project and spec validation; drawing a plot description | datasuite.ui |
| 3 | Front matter links; AI corpus and `llms.txt`; link check in CI | datasuite-docs |
| 4 | Remove Countdown from the workbench; `shinyApps[].cache`; the extension API (app tabs, bridge, R sessions, open app); context key fix | DataSuite |
| 5 | Tools, context, instructions, manifest reader, `cache-guide.json`, report-kind guide, docs snapshot, open-dataset | this extension |
| 6 | CI: the guide pull request from cd2030.core releases, the agreement check, the evaluation set | cd2030.core, this extension |

1-4 in parallel; 5 needs them; 6 alongside 5. Released together: cd2030.core, datasuite.ui, the apps, datasuite-docs,
DataSuite and this extension.

## 13. Contracts between the pieces

These are what the parallel work builds against; change them here first.

### Bridge protocol 2 (datasuite.ui in the page, read by DataSuite)

`window.datasuite = { protocol: 2, getState(), request(action, args?, options?) }` as in protocol 1
(`datasuite.ui/docs/AI-BRIDGE.md`), with this state:

```json
{
  "protocol": 2,
  "app": { "name": "RMNCAH", "version": "2.1.0" },
  "page": { "id": "national_coverage", "title": "National coverage", "section": "Analysis" },
  "viewport": { "scrollTop": 620, "height": 900, "pageHeight": 2400 },
  "cards": [ { "id": "national_coverage-body", "title": "National coverage", "inView": "partial", "visibleFraction": 0.4,
               "activeTab": "anc4", "tabs": [ { "key": "anc4", "label": "ANC4", "componentId": "...-anc4-plot" } ] } ],
  "components": [ { "id": "...-anc4-plot", "cardId": "national_coverage-body", "tabKey": "anc4", "type": "chart",
                    "title": "ANC4", "drawn": true, "about": { "kind": "coverage_national", "options": { "indicator": "anc4" } } } ],
  "filters": { "admin_level": "national", "years": [2019, 2023], "indicator": "anc4" },
  "dataset": { "path": "C:/data/kenya.rds", "country": "Kenya", "revision": 42 },
  "actions": [ { "name": "navigate", "kind": "change", "description": "...", "args": { "page": "..." } } ],
  "updatedAt": "2026-09-26T10:00:00Z"
}
```

- `viewport`, `cards[].inView`, `visibleFraction` and `activeTab` are measured in the browser when `getState()` runs.
- A card without tabs has `tabs: []` and its components have no `tabKey`.
- `about` is opaque to datasuite.ui and DataSuite.
- Built-in actions: `getState`, `listPages`, `listComponents`, `getComponentData { componentId, maxRows }`,
  `focusComponent { componentId }` -> `{ selector }` (read); `selectTab { cardId, key }`, `navigate { page }` (change).
- Countdown actions (cd2030.core): `setFilters { ... }`, `saveReport { project }` -> `{ reportId }`,
  `addGraph { spec }` -> `{ graphId }`, `generateReport { preset | reportId, format }` -> `{ file }` (all change).

### The `custom_chart` kind

A report kind like the others; a block is `{ type: "chart", kind: "custom_chart", spec: <spec> }` (or
`graph: "<saved graph id>"`), and a saved graph is the same spec stored in the dataset. The spec is not kept in
`options`, which holds the chart's style settings from the customize panel; `report_validate_project()` moves a spec
sent in `options` to `spec`.

```json
{
  "title": "ANC4 and Penta3 by region, 2023",
  "data": { "member": "calculate_coverage", "args": { "admin_level": "adminlevel_1" } },
  "transform": [ { "filter": { "year": [2023] } },
                 { "select": ["adminlevel_1", "cov_anc4_dhis2", "cov_penta3_dhis2"] },
                 { "pivot_longer": { "cols": ["cov_anc4_dhis2", "cov_penta3_dhis2"], "names_to": "indicator", "values_to": "value" } } ],
  "plot": { "geom": "col", "x": "adminlevel_1", "y": "value", "fill": "indicator", "position": "dodge",
            "labels": { "x": "Region", "y": "Coverage (%)" }, "percent": true, "flip": true }
}
```

- `data.member` must be a `CacheConnection` member marked chartable in the guide; transforms are a fixed small set
  (`filter`, `select`, `rename`, `mutate_ratio`, `aggregate { by, fun, cols }`, `pivot_longer`, `arrange`, `top_n`);
  `plot.geom` one of `line`, `col`, `point`, `area`, `tile`, with `x`, `y`, and optional `colour`, `fill`, `facet`,
  `position`, `labels`, `percent`, `flip`.
- cd2030.core resolves the data (member + transforms); datasuite.ui draws the plot description (generic).

### Cache revision

`CacheConnection$revision`: an integer in the cache, increased each time a change is saved; the bridge state's
`dataset.revision`. Opening a cache read-only (for the AI's session) never saves.

### DataSuite's API for extensions (commands)

| Command | Returns |
| --- | --- |
| `datasuite.shinyApps.listTabs` | `[{ tabId, appId, extensionId, file, title, active }]` |
| `datasuite.shinyApps.getState(tabId)` | the bridge state, or `null` |
| `datasuite.shinyApps.request(tabId, action, args)` | the reply; change actions go through the user's `aiAppControl` setting (asking when `ask`) |
| `datasuite.shinyApps.open(appId, file)` | `{ tabId }`, a new tab on that file |
| `datasuite.r.createSession(label)` / `execute(sessionId, code, timeoutMs)` / `stopSession(sessionId)` | an R session owned by the extension (runs in DataSuite's R, managed library) |

Plus `shinyApps[].cache` (`{ "file": "<stem>.rds" }`: where a data file's saved dataset lives) and the context keys
`shinyAppEditorAppLocalId` and `shinyAppEditorExtensionId`.

### The docs corpus

`https://datasuite.damurka.com/ai/corpus.json`:
`{ version, generatedAt, pages: [{ url, lang, title, slug, frontmatter: { topics, indicators, reportKinds, cacheMembers, appPages }, sections: [{ anchor, heading, text }] }] }`,
and `llms.txt` listing the pages.
