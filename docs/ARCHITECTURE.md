# How the Countdown apps fit together

The one place that explains the whole system: where each piece of code lives, how a change reaches users, and what to
check when it doesn't. Written 2026-09-26, when the apps moved out of this extension into R packages.

## The pieces

```
DataSuite (VS Code fork, repo damurka/datasuite_ai)
 |  hosts Shiny apps that extensions contribute through `contributes.shinyApps`,
 |  installs and updates the R packages they run from, runs R (Jovian sessions)
 |
 +-- countdown-analytics (this extension)
 |     package.json    shinyApps entries (RMNCAH, Vaxx, Pooled), each naming its R package
 |     apps/<app>/     launch stubs only: app.R = cd2030.<app>::run_app(), plus the JSON the AI tools read
 |     src/, ai/       the Countdown AI: countdown_* chat tools, the CacheConnection and report-kind guides, the docs
 |                     corpus snapshot (see docs/AI-PLAN.md)
 |
 +-- R packages, published at https://damurka.r-universe.dev
       cd2030.rmncah   cd2030.vaxx   cd2030.pooled      the apps: their own pages, config, translations, intro
                    \       |       /
                     cd2030.core                          Countdown: analysis, CacheConnection, Countdown pages
                          |                               (data quality, denominators, coverage, equity, the Load
                          |                               Data wizard, filters, cd_app()), report content
                     datasuite.ui                         generic: Shiny/React kit, app frame, chart options,
                                                          report builder (Word, PowerPoint, PDF)
```

| Repo | Owns | Never |
| --- | --- | --- |
| [datasuite.ui](https://github.com/damurka/datasuite.ui) | the interface kit (`R/kit-*.R`, React source in `js/`, built bundle in `inst/www/cd-react`), `app_frame()`, chart options (`cd_chart_options()`), the report engine (`report_register()`, `report_context()`, export), the kit's translations (`inst/translation/ui.json`) | calls cd2030.core. Anything Countdown-specific comes in through `report_register()`, `report_context()`, `app_frame()` arguments and hooks. |
| [cd2030.core](https://github.com/damurka/cd2030.core) | loading and checking data, the analysis, `CacheConnection` (the `.rds` a dataset is saved in), Countdown pages (`R/ui-*.R`), `cd_app()`, Countdown report kinds/presets/themes, Countdown translations (`inst/translation/cd2030.json`) | holds one app's own pages or settings. |
| [cd2030.rmncah](https://github.com/damurka/cd2030.rmncah), [cd2030.vaxx](https://github.com/damurka/cd2030.vaxx), [cd2030.pooled](https://github.com/damurka/cd2030.pooled) | `run_app()`, the app's page list and nav, its config (`options(cd2030.config = ...)`), its own pages, `inst/translation`, `inst/intro` | copies of shared code. A page two apps need goes to cd2030.core. |
| countdown-analytics (this repo) | the manifest DataSuite reads, the launch stubs, the AI tools and chat instructions | app code. It only names packages. |
| [damurka.r-universe.dev](https://github.com/damurka/damurka.r-universe.dev) | `packages.json`: which repos r-universe builds | anything else. |
| [datasuite_ai](https://github.com/damurka/datasuite_ai) (local folder `datasuite`) | the `shinyApps` contribution point, launching apps, installing their packages | Countdown code (a few Countdown names still leak into it: see "Known loose ends"). |

The rule that keeps this workable: **datasuite.ui is generic, cd2030.core is Countdown, an app is only what is
particular to it.** A new non-Countdown app would depend on datasuite.ui alone.

Dependencies are declared in each DESCRIPTION: an app says `cd2030.core (>= 1.1.0), datasuite.ui (>= 0.1.0)` in
Imports and `Remotes: damurka/cd2030.core, damurka/datasuite.ui` (so `pak`/`remotes` installs from GitHub work too).
Bayesian coverage packages (`bayescoveragemodel`, `bayescoveragedeploy`, suggested by cd2030.core) are not on CRAN;
they come from https://alkemalab.r-universe.dev (cd2030.core's `Additional_repositories`).

## What happens on a user's machine

The extension's `package.json`:

```json
"shinyApps": [{
  "id": "rmncah", "name": "RMNCAH", "location": "apps/rmncah",
  "package": { "name": "cd2030.rmncah", "version": "2.0.0",
               "repos": ["https://damurka.r-universe.dev", "https://alkemalab.r-universe.dev"] },
  "accepts": ["xls", "xlsx", "dta", "rds"], "capabilities": { "requiresFile": true }, "showOnStartPage": true
}]
```

- `location` is still what DataSuite launches: it runs `shiny::runApp("<extension>/apps/rmncah")` in a fresh R session,
  whose `app.R` is one line, `cd2030.rmncah::run_app()`. `run_app()` returns a Shiny app object, which `runApp()` runs.
- `package.version` is the **oldest** version of the package this release of the extension works with.
- `package.repos` are looked in before CRAN.

DataSuite (`src/vs/workbench/contrib/shinyApps/electron-browser/shinyAppPackages.contribution.ts`):

| When | What |
| --- | --- |
| **The extension is installed or updated** | At start-up DataSuite compares each app's stamp (`<extension version>\|<package>@<version>\|<repos>`) with the one stored after the last successful set-up (storage key `datasuite.shinyApps.packageStamps`). A different stamp means install or update: the package, its hard dependencies (Depends/Imports/LinkingTo), newer versions of everything from the app's own repos, and -- best effort -- the Suggests of the app's own packages (PDF export, editable PowerPoint charts, pictures, the Bayesian model...). A first install shows a progress notification, an update only a status-bar spinner and "RMNCAH was updated to version X". |
| **Before every open, restart and restored tab** | Checks the package is installed at `package.version` or newer; installs only if it isn't. No network when it is, so a set-up app works offline. |
| **A Shiny app is open** | Updates wait until every app tab with a running R session is closed: Windows won't replace a loaded package's files. |
| **Offline** | An update check that can't reach the repos keeps the installed version (if it is new enough) and tries again when the computer comes back online. A package that isn't installed yet: "RMNCAH will finish installing when this computer is online" / "can't open yet: ... connect to the internet". Nothing is recorded as done until it succeeds, so it is also retried at every start. |
| **A running app loads a package nothing installed** | R's "there is no package called 'X'" in the app's output makes DataSuite offer to install X (from the app's repos, then CRAN) and restart the app. |
| **R is missing or older than 4.1** | "R was not found. Install R 4.1.0 or newer from https://cloud.r-project.org, or set `datasuite.rHome`." |

The installing itself happens in the shared process (`src/vs/platform/datasuite/node/datasuiteSessionService.ts`,
`ensureRPackage()`), which runs an R script in its own Rscript process (`rPackageInstaller.ts`) -- never inside an app's
R session. Installs run one at a time.

**Where packages go.** DataSuite keeps its own library per R version, `<user data>/R/library/<major.minor>`:
`%APPDATA%\DataSuite\R\library\4.6` on Windows for the installed product (`%APPDATA%\datasuite-dev\...` for a build run
from source). It is put first in `R_LIBS` for every R session DataSuite starts, so packages install there and the user's
own library stays untouched but visible. The `datasuite.rLibs` setting overrides all of this.

## Releasing a change

**A library or app change** (datasuite.ui, cd2030.core, or an app package):

1. Make the change. Bump `Version:` in DESCRIPTION and add a NEWS.md entry.
2. `devtools::check()` must be clean (0 errors, 0 warnings, 0 notes). The packages are ASCII-only in `R/`
   (`\uXXXX` escapes in strings); roxygen docs are regenerated by `check(document = TRUE)`.
3. Commit, tag `vX.Y.Z`, push `main` and the tag.
4. r-universe builds it (see below) and publishes Windows/macOS/Linux binaries at https://damurka.r-universe.dev.
5. Users get it at the next extension install/update of an app that depends on it (updates of packages from the app's
   repos are part of every update run), or immediately if the new version is required (next step).

**When an app needs the new version** (a new function in cd2030.core, a fix users must have):

1. Raise the minimum in the dependent DESCRIPTION (`cd2030.core (>= 1.2.0)`) and release that package as above.
2. In this repo, raise `package.version` for the apps that need it, add a CHANGELOG.md entry, then
   `npm version <patch|minor|major>` and `git push --follow-tags`. The `v*` tag makes CI publish the extension to the
   DataSuite registry (Open VSX at https://datasuite.damurka.com/registry) and cut a GitHub release; the tag must equal package.json's
   version.
3. DataSuite updates the extension, sees the new stamp, and installs the new package versions.

An extension release is also the only way to force an update check: without one, installed users keep what they have
(which is what you want for a training cohort -- pin by leaving `package.version` alone).

**Building the React bundle** (datasuite.ui): `cd js && npm run build` writes `inst/www/cd-react/cd-react.js`, which is
committed, so installing the package needs no Node.

## r-universe

- The registry is the repo `damurka/damurka.r-universe.dev`; its `packages.json` lists each package and its GitHub
  repo. r-universe builds each from the repo's default branch.
- Builds run in the repo `r-universe/damurka` (GitHub Actions, "Build package"). A build starts when r-universe's sync
  sees a new commit: immediately if the **r-universe GitHub app** is installed on the account
  (https://github.com/apps/r-universe), otherwise on its periodic scan. A commit to the registry repo makes it re-sync
  every package.
- Dashboard: https://damurka.r-universe.dev/builds (signed in with GitHub: a Rebuild button per package).
- A failed `R CMD check` on one platform doesn't stop the package being published, but fix it: it is the first thing a
  user of that platform would hit.

## Working on it locally

| Task | How |
| --- | --- |
| Run an app from its repo | `shiny::runApp()` in the app repo: its `app.R` loads the package source with `pkgload::load_all()`. |
| Use local changes to a library in an app | `devtools::install()` the library. Install cd2030.core with `devtools::install(quick = TRUE, upgrade = FALSE, dependencies = FALSE)`, or its `Remotes:` reinstalls datasuite.ui from GitHub over your local one. Stop running apps first (Windows locks loaded packages). |
| Try DataSuite's install/update flow | In the datasuite repo: `npm run transpile-client` (~5 s), then `scripts\code.bat --user-data-dir=<empty folder> --extensions-dir=<empty folder> --extensionDevelopmentPath=<this repo>` with `VSCODE_SKIP_PRELAUNCH=1`. A fresh user-data dir is a fresh install; bump `version` in this package.json to simulate an update. Read the log `<user-data-dir>/logs/<time>/datasuiteSessionService.log`. |
| Regenerate the AI guides | `Rscript scripts/generate-ai-guide.R` (from the installed cd2030.core and the docs corpus; `--check` to only compare). Refresh the docs snapshot: copy datasuite-docs `out/ai/corpus.json` (after its build) to `ai/corpus.json`. Check the evaluation: `Rscript scripts/run-eval.R`. |

## Troubleshooting

| Symptom | Look at |
| --- | --- |
| A pushed change isn't on r-universe | https://damurka.r-universe.dev/api/packages (each package's `RemoteSha` = the commit built). Older than GitHub `main` for more than an hour: the GitHub app isn't installed, or the build failed -- see `gh run list -R r-universe/damurka`. |
| An app won't open / install fails | DataSuite: Output panel, **Datasuite R (Diagnostics)** -- every check, install and R's reason for a failure. |
| "cd2030.core 1.2.0 is needed, but the newest available is 1.1.0" | The package that needs it was published before its dependency: wait for r-universe to build the dependency, then retry. |
| An update never arrives | Updates only run when the extension version changes (or `package` changes). Is a Shiny app still open? Updates wait for them to close. |
| Something works on your machine but not a user's | Your library has packages theirs doesn't -- a missing declaration. `R CMD check` catches undeclared `pkg::` calls; `requireNamespace()` ones must be in Suggests (installed best effort) or Imports. |
| Reset a user's app packages | Close DataSuite and delete `%APPDATA%\DataSuite\R\library\<R version>`; the next start or launch reinstalls. |

## The Countdown AI

The design, the decisions and the contracts are in [AI-PLAN.md](AI-PLAN.md). In short:

- **Screen**: a running app tells DataSuite where the user is through the AI bridge (datasuite.ui, protocol 2:
  `docs/AI-BRIDGE.md` there): page, cards and tabs in view, each chart's report kind, filters, dataset and revision.
  DataSuite's generic `shinyApp` tool reads a chart's data, takes screenshots and changes the view (under the setting
  `datasuite.shinyApps.aiAppControl`).
- **Data**: `countdown_cache` calls one `CacheConnection` member -- the single source of truth -- in the tab's own
  read-only R session (DataSuite's `datasuite.r.*` API), reloaded when the app saves; `countdown_catalog` finds the
  member (from `ai/cache-guide.json`); `countdown_run_r` for what no member covers.
- **Knowledge**: `countdown_docs` searches the methodology docs corpus (`ai/corpus.json`, refreshed from
  https://datasuite.damurka.com/ai/corpus.json).
- **Adding**: `countdown_report` (standard and custom reports) and `countdown_graph` (`custom_chart` graphs that redraw),
  saved through the app.
- **Other datasets**: `countdown_open_dataset` opens them in their own tab.
- **Kept current**: CI regenerates the guides from each cd2030.core release (`scripts/generate-ai-guide.R`, the
  `ai-guide` workflow here and `ai-guide-sync` in cd2030.core) and runs the evaluation (`ai/eval/questions.yaml`).

## Known loose ends

- DataSuite's Start page still has the "Countdown to 2030" title and the Countdown themes (wired into its Start page
  code rather than contributed).
- The guides' drafted fields (group, question, related report kinds -- drawn from docs pages that name both) need a
  person's review; reviewed entries keep their text on regeneration.
- The launch stubs exist because DataSuite launches a folder. A `package` app could be launched with
  `pkg::run_app()` directly, which would remove `apps/` entirely.
