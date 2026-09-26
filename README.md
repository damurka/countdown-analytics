# Countdown Analytics

Countdown to 2030 (CD2030) analysis for women's, children's and adolescents' health, in DataSuite. This extension
adds three Shiny apps -- RMNCAH, Vaxx and Pooled -- to DataSuite's File menu and Start page, and chat tools that let the
AI agent analyse the same data the apps work on.

The apps themselves are R packages ([cd2030.rmncah](https://github.com/damurka/cd2030.rmncah),
[cd2030.vaxx](https://github.com/damurka/cd2030.vaxx), [cd2030.pooled](https://github.com/damurka/cd2030.pooled)),
built on [cd2030.core](https://github.com/damurka/cd2030.core) and [datasuite.ui](https://github.com/damurka/datasuite.ui)
and published at https://damurka.r-universe.dev. This extension only names them: DataSuite installs each app's package
when the extension is installed, updates it when the extension is updated, and runs it.

**How it all fits together, how to release a change, and what to check when something breaks:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).**

> **Requires DataSuite.** The apps use DataSuite's `shinyApps` contribution point, its R sessions and its package
> installer. They do not work in stock VS Code.

## The apps

| App | What it is for | Opens | R package |
| --- | --- | --- | --- |
| **RMNCAH** | End-to-end analysis of routine facility data for RMNCAH indicators. Shown on the Start page. | `.xls`, `.xlsx`, `.dta`, `.rds` | cd2030.rmncah |
| **Vaxx** | Immunization coverage and inequalities. | `.xls`, `.xlsx`, `.dta`, `.rds` | cd2030.vaxx |
| **Pooled** | One file from several countries' saved datasets: explore it, compare countries, export tables. | a folder of `.rds` files | cd2030.pooled |

**RMNCAH** and **Vaxx** walk through the analysis in stages:

- **Load Data** (a step-by-step wizard) and **data quality**: reporting rate, completeness, internal consistency,
  outliers and an overall score.
- **Data preparation**: removing years and adjusting the data, with a view of what the adjustment changed.
- **Denominators**: assessment and selection.
- **Coverage, inequality and targets**, national and subnational, and equity.
- **Reports**: Word, PowerPoint and PDF reports built from the pages' charts, standard or custom.

**RMNCAH** adds continuum of care, mortality (institutional, mapping, completeness), service utilization (data quality,
national, subnational, MCH curative index), health system (national, subnational, comparison, private sector) and the
Bayesian coverage model.

**Pooled** has two pages: *Build pooled file* (load saved datasets, review, create one pooled `.rds`) and *Explore
pooled data* (a page per kind of dataset, compare countries, extract a piece; exports as CSV, Excel or `.rds`).

Every app is in English, French and Portuguese.

## AI assistant tools

Available to the DataSuite chat agent while one of the apps is active.

| Tool | What it does |
| --- | --- |
| **Look Up cd2030.core Data Reference** (`cd2030Docs`) | Lists an app's pages, which `CacheConnection` methods and fields each page reads, their documentation and, where written, why the numbers matter. Can also look up one method, e.g. `calculate_coverage`. Reads `apps/<app>/data-reference.json`. |
| **Read Countdown Cache** (`readCd2030Cache`) | Opens an app's `.rds` cache in DataSuite's R session as `.datasuite_cache` with `cd2030.core::init_CacheConnection()`. Always reloads from disk, so results never come from stale data. |

The chat instructions (`instructions/countdown-analysis.instructions.md`) apply when RMNCAH, Vaxx or Pooled is the
active app: look up the data reference before writing R code, load the cache with `readCd2030Cache`, use cd2030.core's
own methods rather than re-deriving indicators, and record analysis decisions.

## Requirements

- DataSuite 1.131 or later.
- R 4.1 or newer (DataSuite finds a system R, or uses `datasuite.rHome`).
- An internet connection the first time, to install the apps' R packages (and for updates). Once installed, the apps
  work offline.

## What is in this repo

| Path | What |
| --- | --- |
| `package.json` | the `shinyApps` entries (name, icon, accepted files, the R package and its minimum version and repos), the chat tools and instructions |
| `apps/<app>/app.R` | the launch stub DataSuite runs: `cd2030.<app>::run_app()` |
| `apps/<app>/data-reference.json`, `docs-index.json` | what the AI tools read (generated, see ARCHITECTURE.md) |
| `src/extension.ts` | the `cd2030Docs` and `readCd2030Cache` tools |
| `instructions/` | the chat instructions |

## Development

```
npm ci
npm run compile      # build to out/
npx vsce package     # produce the .vsix
```

To try it in DataSuite from source, see "Working on it locally" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Releases: update `CHANGELOG.md`, then `npm version <patch|minor|major>` and `git push --follow-tags`. The `v*` tag
publishes the extension to the DataSuite extension registry and creates a GitHub release. Changing an app's code is a
release of its R package, not of this extension -- unless users must get the new version, in which case raise its
`package.version` here and release (ARCHITECTURE.md, "Releasing a change").

## License

MIT. See the `LICENSE` file.
