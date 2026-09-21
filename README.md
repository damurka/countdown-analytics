# Countdown Analytics

Countdown to 2030 (CD2030) analysis for women's, children's and adolescents' health, built into
DataSuite. It bundles three Shiny apps powered by the `cd2030.core` R package, plus AI-assistant
tools that let the chat agent analyse the same data the apps work on.

> **Requires DataSuite.** This extension uses DataSuite's Shiny app contribution point and its
> managed R session. It does not work in stock VS Code.

## Features

### Shiny apps

| App | What it is for | Accepts |
| --- | --- | --- |
| **RMNCAH** | End-to-end analysis of routine facility data for RMNCAH indicators. Shown on the Start page. | `.xls`, `.xlsx`, `.dta`, `.rds` |
| **Vaxx** | Immunization coverage and inequalities analysis. | `.xls`, `.xlsx`, `.dta`, `.rds` |
| **Pooled** | Pool and extract data from several saved caches at once. | a folder of `.rds` files |

**RMNCAH** and **Vaxx** walk through the analysis in stages:

- **Data upload** and **data quality checks**: reporting rate, outlier detection, completeness,
  internal consistency and an overall data quality score.
- **Data preparation**: removing years and adjusting data, with a view of what the adjustment changed.
- **Denominators**: assessment and selection.
- **Coverage, inequality and targets**, at national and subnational level, plus equity analysis.

**RMNCAH** adds pages for Bayesian analysis, continuum of care, family planning, mortality
(including completeness and mapping), service utilization, the MCH curative index, health system
comparison and the private sector.

**Pooled** loads the caches in a folder, lets you choose the domain (RMNCAH or Immunization),
processes the selected dataset, and downloads the result as CSV (current dataset) or Excel (all).

In-app help is available in English, French and Portuguese.

### AI assistant tools

These tools are available to the DataSuite chat agent while one of the apps is active.

| Tool | What it does |
| --- | --- |
| **Look Up cd2030.core Data Reference** (`cd2030Docs`) | Lists an app's pages, which `CacheConnection` methods and fields each page reads, their technical documentation and, where available, the analysis rationale for why the numbers matter. Can also look up a single method such as `calculate_coverage`. |
| **Read Countdown Cache** (`readCd2030Cache`) | Opens an app's `.rds` cache in the managed R session as `.datasuite_cache`. It always reloads from disk, so results never come from stale data. |

Chat instructions apply automatically when RMNCAH, Vaxx or Pooled is the active app. They tell the
agent to look up the data reference before writing R code, load the cache with `readCd2030Cache`,
prefer `cd2030.core`'s own methods over re-deriving indicators, and record durable analysis
decisions so they are not silently re-decided later.

## Requirements

- DataSuite 1.131 or later.
- R with the `cd2030.core` package available to DataSuite's managed R session.

## Development

```
npm ci
npm run compile      # build to out/
npx vsce package     # produce the .vsix
```

Releases are automated: `npm version <patch|minor|major>` then `git push --follow-tags`. A `v*` tag
publishes the extension to the DataSuite extension registry and creates a GitHub release. Update
`CHANGELOG.md` before tagging.

## License

MIT. See the `LICENSE` file.
