# Changelog

All notable changes to this extension are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/).

## [2.0.0] - Unreleased

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
