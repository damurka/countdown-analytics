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
 |     src/            the cd2030Docs and readCd2030Cache chat tools
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
   DataSuite registry (Open VSX at open-dsx.damurka.com) and cut a GitHub release; the tag must equal package.json's
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
| Regenerate the AI tools' JSON | `data-reference.json`: `Rscript scripts/generate-cd2030-reference.R <app-dir> <output> [docs-repo] [package]` in the datasuite repo. `docs-index.json`: `node scripts/generate-docs-index.js <datasuite-docs checkout> <output>`. Both are copied into `apps/<app>/` here. |

## Troubleshooting

| Symptom | Look at |
| --- | --- |
| A pushed change isn't on r-universe | https://damurka.r-universe.dev/api/packages (each package's `RemoteSha` = the commit built). Older than GitHub `main` for more than an hour: the GitHub app isn't installed, or the build failed -- see `gh run list -R r-universe/damurka`. |
| An app won't open / install fails | DataSuite: Output panel, **Datasuite R (Diagnostics)** -- every check, install and R's reason for a failure. |
| "cd2030.core 1.2.0 is needed, but the newest available is 1.1.0" | The package that needs it was published before its dependency: wait for r-universe to build the dependency, then retry. |
| An update never arrives | Updates only run when the extension version changes (or `package` changes). Is a Shiny app still open? Updates wait for them to close. |
| Something works on your machine but not a user's | Your library has packages theirs doesn't -- a missing declaration. `R CMD check` catches undeclared `pkg::` calls; `requireNamespace()` ones must be in Suggests (installed best effort) or Imports. |
| Reset a user's app packages | Close DataSuite and delete `%APPDATA%\DataSuite\R\library\<R version>`; the next start or launch reinstalls. |

## Known loose ends

- DataSuite's workbench still names Countdown in a few places: the `.rds` cache naming (`resolveShinySourcePath.ts`), the
  chat context mentioning `cd2030Docs`, the Start page title, the Countdown themes.
- `scripts/generate-cd2030-reference.R` (datasuite repo) was written for the old app layout (`<app>/modules/`); it needs
  updating for the package layout (`R/page-*.R`) before `data-reference.json` can be regenerated.
- The launch stubs exist because DataSuite launches a folder. A `package` app could be launched with
  `pkg::run_app()` directly, and the JSON could ship inside the packages, which would remove `apps/` entirely.
</content>
</invoke>
<invoke name="Bash">
<parameter name="command">cd C:/Users/Murage/Documents/Dev/JS/datasuite-infrastructure && git -C datasuite remote get-url origin; grep -n "rawNamespace\|fontawesome" cd2030.core/DESCRIPTION | head -2; grep -n "Remotes" -A3 cd2030.rmncah/DESCRIPTION; grep -n "data-reference.json\|docs-index" datasuite/src/vs/workbench/contrib/datasuite/electron-browser/datasuite.contribution.ts | head -3; sed -n 40,60p countdown-analytics/src/extension.ts