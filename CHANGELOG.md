# Changelog

All notable changes to this extension are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/).

## [2.0.9] - 2026-10-01

### Changed

- The apps need their releases of today: cd2030.rmncah 2.0.7 (the Bayesian analysis's background processes start
  when a Bayesian page is first opened; the shared Load Data screen and table cards), cd2030.vaxx 2.0.6 (the shared
  Load Data screen; failed reference uploads say why) and cd2030.pooled 2.0.5 (the other apps' chart tools), on
  cd2030.core 1.3.7 and datasuite.ui 0.4.2 (requests to DataSuite on Jovian's host channel). DataSuite updates an
  installed app to these versions.
- **countdown_graph**'s preview is the plot the R session draws and DataSuite returns with the run (as
  **countdown_run_r**'s plots are), instead of a PNG the extension wrote to a temporary file and passed back as text.

## [2.0.8] - 2026-10-01

### Changed

- **Open Notebook** puts the notebook in the dataset's workspace, where DataSuite (1.1.2 or later) gives it the
  folder's datasets by name -- read-only, and read again once the app has saved -- through cd2030.core's
  `notebook_data()`, which the apps declare as their `notebookData`. The starter cells no longer load the data
  themselves.
- RMNCAH needs cd2030.rmncah 2.0.6: the Bayesian analysis installs its model's packages when it is first opened
  (DataSuite installs them and offers to restart the app), so the apps' first install is much smaller.

## [2.0.7] - 2026-09-30

### Added

- **Countdown: Open Notebook** (on a Countdown app's tab: its toolbar and right-click menu, and the command palette):
  a notebook beside the app, on the app's data, for analysis the app doesn't do or for checking its numbers. It goes
  in the tab's analysis folder (`<workspace>/notebooks`) and runs on DataSuite's kernels (DataSuite with notebooks).
  - R: reads the app's dataset itself, read-only (`init_CacheConnection(read_only = TRUE)`), so nothing in the notebook
    changes the app or its file; rerun the first cell to follow the app. Starter cells: the data as loaded, kept and
    adjusted, the adjustment's rules, and the Data Adjustment Changes check.
  - Python and Stata: the data exported as Stata files (as loaded, kept, adjusted; names made Stata's), read with
    pandas or `use`.
- The AI's guide knows the adjustment settings (`adjustment_settings`, `set_adjustment_settings`) and the Bayesian
  model members of cd2030.core 1.3.5.
- The AI writes a report's narrative section by section, or only the section asked.
- `scripts/dev-test.ps1 -DebugPort`: Chromium remote debugging, to inspect the app pages.

### Changed

- Installs cd2030.rmncah 2.0.5, cd2030.vaxx 2.0.5 and cd2030.pooled 2.0.4: the Quire report builder (datasuite.ui
  0.4.0, quire 0.2.17), Data Adjustment with Remove Years in it and rules by indicator, region or district, the
  reported-and-adjusted Changes page, the Bayesian analysis in the background, tables' loaders, Reports on the
  header's button only.

## [2.0.6] - 2026-09-28

### Added

- `countdown_documents` `search` finds passages by meaning as well as by words: plain words or a question are ranked
  by keywords (BM25) and by meaning (DataSuite's embeddings, google/gemini-embedding-2), fused, best first, each
  saying how it matched -- so a question in English, French or Portuguese finds passages in any of them. A "quoted
  phrase" or a regex still finds exact matches. Documents are embedded once per file version, in ~1,500-character
  chunks, on the first search (or when a document is first read); documents over 3,000 chunks stay keyword-only. The
  documents' text and scanned page images are sent to DataSuite's AI service for this; signed out, with an older
  DataSuite or with `datasuite.embeddings.enabled` off, search is by keywords alone and says why. `list` shows which
  documents are indexed.
- Scanned PDF pages (no text layer) are rendered to images: meaning search finds them, and `read` attaches the page
  image so the AI reads it (no OCR).
- The AI reads and changes saved reports instead of replacing them: `countdown_report` `listReports`, `readReport`
  (the blocks in order -- text, and each chart's and table's kind, settings, options and a short table of the data it
  shows -- and the report's language) and `updateBlocks` (targeted changes by block id: write or rewrite text; a
  chart's kind -- only to one of the same data --, settings, chart options and layout; insert, remove, move blocks;
  everything else untouched). "Fill in the narrative of my report" writes an introduction, a paragraph after each chart
  and table and a conclusion, in the report's language, from its own numbers. The user's permission setting may ask
  first, with a summary ("Write 5 paragraphs in the report ..."). A report open in the Reports page shows the change
  at once.
- The Reports page's **Write the narrative**, **Write with AI** and **Change with AI** buttons open the chat with a
  prompt about the report or the block (datasuite.ui 0.3.4).
- Needs cd2030.core 1.3.4 and datasuite.ui 0.3.4 (a report the AI saves now keeps its id, so the user's edits to it
  are saved); with older packages the new actions say the app's R packages need updating.

## [2.0.5] - 2026-09-28

### Added

- `countdown_context` returns the dataset's current **selections** -- country, the denominator and maternal
  denominator with their labels, the survey (year, source, coverage), the population the growth options use, the
  national rates, the years, the admin levels and the adjustment -- so "what is the denominator?" is answered in one
  call instead of ten.
- Comparing the denominators takes one call: `countdown_cache` `denominator_comparison` (cd2030.core 1.3.3) gives
  every option's coverage next to the survey, the difference and the chosen one, per indicator and year; the
  instructions use it instead of reshaping `calculate_derived_coverage` in R. The AI's guide is regenerated from
  cd2030.core 1.3.3; with an older core, the member says the app's R packages need updating.
- The Countdown instructions stay attached while any Countdown app tab is open, not only while it is the active
  editor (with DataSuite builds that have the `shinyAppOpenExtensionIds` context key), so follow-up questions keep
  them and the prompt cache.

### Changed

- Portuguese as written in Mozambique and Angola across the apps and their docs: the apps need cd2030.rmncah /
  cd2030.vaxx 2.0.4 and cd2030.pooled 2.0.3 (cd2030.core 1.3.2, datasuite.ui 0.3.3); the AI's docs corpus is
  refreshed.
- Each AI tool has one name: its reference name (in `#` references, tool lists and custom agents) is now the name the
  AI calls it by, e.g. `countdown_run_r` (was `countdownRunR`). A custom agent or prompt file that lists a tool by its
  old camelCase name needs the new one. DataSuite's own tools did the same, so the `runR` and `shinyApp` the
  instructions name are now exactly the tools the AI sees.
- Leaner AI instructions (about 2,000 characters shorter, sent with every request in a Countdown tab): they keep what
  is specific to Countdown -- the `countdown_*` tools, the dataset, the methodology and the app -- and point to
  DataSuite's general rules for numbers and sources, R habits and recording decisions instead of repeating them.

## [2.0.4] - 2026-09-27

### Changed

- The apps pick up datasuite.ui 0.3.2: the Reports page has a **Reference documents** card to add, list and remove the
  files the AI reads as context for a dataset (kept in its analysis folder, `documents/`). Updating the extension
  brings datasuite.ui up to date for RMNCAH, Vaxx and Pooled; the apps themselves are unchanged (cd2030.rmncah /
  cd2030.vaxx 2.0.3, cd2030.pooled 2.0.2).

## [2.0.3] - 2026-09-27

### Added

- A **Datasets** panel (Countdown in the activity bar): the published Countdown datasets your DataSuite account may
  see, by cycle and country. Download a dataset's files, or open its .rds in RMNCAH or Vaxx (kept in
  `Documents/Countdown datasets/<cycle>/<country> v<version>/`, setting `countdown.datasets.folder`). It signs in
  with its own read-only DataSuite session (scope `data_read`), so the AI's sign-in is unchanged -- but already
  signed in to the DataSuite AI, there is nothing to sign in to: that sign-in is exchanged for the panel's when your
  account may see Countdown data. When it may not, the panel says so and offers **Request Access** (DataSuite's
  request-access page) and **Try Again**.
  Published datasets come from the cycle's Publication activities; each shows its activity.
- Every data result the AI gets carries what its columns mean (`columnMeanings`, from cd2030.core's data dictionary),
  and `countdown_catalog` returns the dictionary; the AI guide carries each CacheConnection member's definition (grain,
  unit, defaults, where it is set and shown, its methodology section). The AI no longer reads meaning from ids: the
  ids ending in `derived` are the population-growth denominators.

### Changed

- `countdown_run_r` returns the full error message and backtrace (tidyverse errors included), keeps the start and end
  of long output, takes `title` and `timeoutSeconds`, and says when the app's R session was restarted. Code that
  deletes files, runs system commands or installs packages asks first (DataSuite's `datasuite.r.aiCodeConfirmation`).
- Saved analysis scripts can be rerun: each opens the dataset read-only (`init_CacheConnection(..., read_only = TRUE)`)
  and notes its revision; only runs without errors are kept, and each run is also appended to
  `scripts/session-<date>.R`.
- The AI instructions gain a "Writing R" section (inspect first, compact tables, plots, when to use
  `countdown_cache` instead of R, never `readRDS` the dataset).
- The apps need cd2030.rmncah / cd2030.vaxx 2.0.3 and cd2030.pooled 2.0.2 (cd2030.core 1.3.1).

## [2.0.2] - 2026-09-27

### Changed

- The Countdown AI, rebuilt (docs/AI-PLAN.md): every Countdown AI feature now lives in this extension, grounded in the
  dataset's `CacheConnection`, the methodology docs and what is on screen. New tools: `countdown_context`,
  `countdown_catalog`, `countdown_cache`, `countdown_docs`, `countdown_report`, `countdown_graph`, `countdown_run_r`,
  `countdown_open_dataset`. Data questions run in the tab's own read-only R session, reloaded when the app saves.
- The chat instructions apply to any Countdown tab (they never matched before: the app id key held the full id).
- Each app declares its saved dataset as the apps write it (`<stem>_rmncah.rds`, `<stem>_vaccine.rds`), so reopening
  a data file finds its saved copy and RMNCAH and Vaxx on the same file keep separate analysis folders.
- Figures the AI draws are saved in the dataset's analysis folder (`figures/`) and shown in the answer, where they can
  be opened or saved; the R it runs goes in `scripts/`; generated reports in `reports/`, with a link in the answer.
- Reports can include a figure the AI drew (an image block, stored in the dataset). Changes to the app are confirmed in
  the chat, and only when they replace something saved.
- The apps ask for the balanced model tier (`aiModelRole`); they need cd2030.rmncah, cd2030.vaxx and cd2030.pooled 2.0.1 (the apps are pinned at 2.0.1).

### Removed

- `cd2030Docs`, `readCd2030Cache` and the `data-reference.json` / `docs-index.json` files they read.

### Added

- `ai/`: the `CacheConnection` guide and report-kind guide (generated from cd2030.core by `scripts/generate-ai-guide.R`),
  the docs corpus snapshot, and the evaluation (`ai/eval/questions.yaml`, `scripts/run-eval.R`); CI checks the guides
  against the released cd2030.core.

## [2.0.1] - 2026-09-26

### Changed

- The apps are now R packages -- cd2030.rmncah, cd2030.vaxx and cd2030.pooled, in their own repos and published at
  https://damurka.r-universe.dev -- instead of app folders bundled in this extension. Each `shinyApps` entry names its
  package (`package: { name, version, repos }`); DataSuite installs it with the extension, updates it when the
  extension is updated and checks it before every launch. `apps/<app>/` keeps only a launch stub
  (`cd2030.<app>::run_app()`) and the JSON the AI tools read. Requires R 4.1 or newer and an internet connection for the
  first install. See `docs/ARCHITECTURE.md`.
- The Bayesian coverage packages install from https://alkemalab.r-universe.dev.
- Needs a DataSuite that installs app packages (the `shinyApps` `package` field) and finds a system R: DataSuite no
  longer bundles R. On an older DataSuite the apps do not open.

## [2.0.0] - 2026-09-21

### Added

- Single extension bundling the **RMNCAH**, **Vaxx** and **Pooled** Shiny apps, replacing the
  separate `datasuite-rmncah`, `datasuite-vaxx` and `datasuite-pooled` extensions.
- `cd2030Docs` tool: look up which `cd2030.core` `CacheConnection` methods and fields each app page
  uses, with technical documentation and analysis rationale.
- `readCd2030Cache` tool: load an app's `.rds` cache into the managed R session as `.datasuite_cache`,
  always reopened fresh.
- Chat instructions for analysing data in the Countdown apps.
- MIT license, README and this changelog.

- **RMNCAH** filters are now compact React chips in a one-line filter bar on every page, in place of
  the four-column Options cards: denominators, admin level and region, indicator, palette, population,
  several-year selections (with a `+N` summary), the reporting-rate threshold (a number chip with
  quick picks and a reset), and the year of each table. The components are TypeScript (`js/`, built
  with webpack and Babel, rendered through `shiny.react`); the built bundle is committed, so running
  the app needs no Node. Chip text follows the language, and long region lists (42 districts) are
  grouped under their parent, searchable and scrollable.
- **RMNCAH** every chart has two small tools beside the download buttons, for that chart only:
  *Labels* edits the title, caption, axis and legend text (the chart's own text shows as the
  placeholder, an empty field keeps it), and *View* swaps the axes, changes the text size and moves
  the legend. Both also apply to the image download.
- **RMNCAH** charts with many regions no longer get cramped: a chart with more than 12 categories on
  its horizontal axis is turned so the names run down the side, and it grows taller to give each one a
  row (42 districts: 1,262 px instead of 400). *Keep* in the View tool restores the original.
- **Vaxx** brought up to the same filter bar, per-chart Labels/View tools and many-region chart layout
  as RMNCAH, sharing the same `js/` build (one bundle, published into both apps).
- **RMNCAH** the header bar and sidebar navigation are now React too (`HeaderBar.tsx`, `Sidebar.tsx`),
  replacing shinydashboard's `dashboardHeader()`/`dashboardSidebar()`: shinydashboard fixes the markup
  those produce (every header item must be `<li class="dropdown">`) and drives tab switching with its
  own bundled JS, which left no room for the redesigned shell. `tabItems()` and every page's own
  `tabItem()` are unchanged; switching tabs is now one explicit call (`js/src/nav.ts`) instead.
  Sidebar sections (Start, Data Quality, Denominators, Analysis) match the design; the header adds a
  breadcrumb (computed client-side, no server round-trip), the dataset pill, a language switcher and
  an "Ask AI" placeholder. Download report kept its existing logic, only restyled.

### Fixed

- **Vaxx** app updated to the current `cd2030.core` API. It called `get_filtered_indicator_coverage`
  (removed; now `calculate_derived_coverage`), passed `admin_level` to `get_filtered_threshold`
  (now `target_unit`), read survey estimates from their old location on the upload page, and did not
  pass `i18n` to `generate_report`.
- **Vaxx** adjustment page no longer shows the equity page's indicator list; the two pages shared a
  global variable.

- **RMNCAH** no longer recomputes the mortality summary in the background. It waited on every data
  adjustment, about a second each, even when the Mortality Mapping page was closed. It now runs when
  the page is opened.
- **RMNCAH** denominator dropdowns: read-only copies no longer run observers or send scripts to a
  dropdown that does not exist (a denominator change re-ran 14 things across 7 modules, now 2), and
  the Denominator Selection page labels its maternal dropdown "maternal" instead of repeating
  "vaccination". Removed an unused denominator server and a leftover debug `print`.
- **RMNCAH** added the missing `title_global_maternal` translation.
- **RMNCAH** National Inequality no longer fails when a year is chosen in the inequality panel: it
  read an undefined `years()`, which turned into a date function.
- **Vaxx** National Inequality had the same undefined-`years()` bug as RMNCAH; fixed the same way.
  Also removed the same dead year-dropdown observers (Reporting Rate, Outlier Detection) and a dangling
  denominator server with no matching input, all pre-existing and found while porting RMNCAH's fixes.
- A chart's download button could stop the whole page responding: its enable/disable state re-rendered
  once for every field the cache settles during startup, and rendering it faster than the browser could
  process sent "recalculating" while the previous cycle was still running, which the browser treats as
  a protocol error and can stop processing further updates for the rest of the session (seen reliably
  on Vaxx's Reporting Rate page; RMNCAH hit a milder form of the same race on the region dropdown, which
  recovered on its own). The button's enabled state now settles before it re-renders.

### Changed

- **Vaxx** brought in line with the RMNCAH app: nested Inequality menu (routine and survey data),
  updated icons and branding, read-only denominators outside the denominator page, Word-only report
  download, framework documentation links, no UN population denominators, and no separate OPV1/OPV3
  consistency tab. The unused save-cache module was removed.
- The extension now lives in its own repository and builds standalone (own `tsconfig`, pinned
  dependencies and lockfile) instead of inside the DataSuite monorepo.
- Releases are built and published by CI: pushing a `v*` tag packages the `.vsix`, publishes it to
  the DataSuite extension registry and creates a GitHub release.
- Package renamed from `datasuite-countdown` to `countdown-analytics`, so the extension ID is now
  `datasuite.countdown-analytics`.
- Refreshed the extension description and keywords.
