# Shared Countdown UI (`apps/_shared`)

> **Moving (2026-09):** the interface kit (components, page frame, charts, chart options, the report builder, the
> React source in `js/` and the assets in `www/`) is now the **datasuite.ui** package (github.com/damurka/datasuite.ui),
> which `load.R` attaches. What is left here is Countdown's (pages, wizard, filters, `cd_app()`) and moves into
> cd2030.core next; the sections below still describe the old layout and move with the kit's docs.


The UI that every Countdown Shiny app is built from: **rmncah**, **vaxx** and **pooled** today, and any app on a custom
indicator group tomorrow. An app loads it, says what is particular to it, and writes only its own analysis pages.

| Read this | For |
| --- | --- |
| this file | how it fits together: folders, an app's anatomy, start-up order, config, themes, translations |
| [`docs/COMPONENTS.md`](docs/COMPONENTS.md) | reference: every component, its arguments, an example, related pieces and a screenshot (images in `docs/img/`) |
| [`docs/gallery`](docs/gallery/app.R) | a live page showing every component: `shiny::runApp("apps/_shared/docs/gallery")` (`GALLERY_THEME=vaccine\|pooled` for the other themes) |
| [`docs/HOWTO.md`](docs/HOWTO.md) | recipes (add a page, a chart, an app, a component, a translation key) and the gotchas we hit |
| [`CONVENTIONS.md`](CONVENTIONS.md) | naming rules (snake_case, `cd_` prefix, `<stem>_ui/_server` pairs) |

## The idea in one paragraph

An app is a Shiny app whose `app.R` (1) loads `cd2030.core` and the shared UI, (2) pins its indicator group and sets its
config, (3) sources its own modules and `pages.R` (the *page registry*), (4) builds a translator and a nav tree and (5)
calls `cd_app()`. Everything visible -- header, sidebar, cards, buttons, filters, charts with their download tools, the
Load Data wizard -- comes from here, as R functions that render React components (`js/src`) or plain `cd-` styled HTML.
There is no Bootstrap, AdminLTE or shinydashboard anywhere.

## Folder map

```
apps/
  _shared/                 <- this folder, laid out like an R package (R/ + www/) so it can be promoted to one later
    load.R                 cd_ui_load(): sources every R/**/*.R, registers the "cd-ui" resource path
    R/
      core/                app.R (cd_app), assets, config (cd_cfg), i18n, small Shiny helpers
      components/          R wrappers for the React components: buttons, inputs, files, dialogs, feedback, message box
      layout/              page + card builders, page registry, scoped pages, sidebar/header shell, nav sections, tabs, loader
      charts/              plot and table cards with their download tools, download button, chart options, Excel helpers
      filters/             admin level, indicator, denominator, palette, population, years
      actions/             Get help, Add notes, Generate report, Download report
      wizard/              the Load Data wizard (step rail, upload, data quality, national rates, survey/shapefile, mapping)
      modules/             page modules that are identical for every indicator group (see "Shared modules")
    translation/shared.json  the translation keys the apps have in common
    www/                   cd-ui.css, fonts, the built React bundle (cd-react/), logo, i18n-fix.js
    docs/                  COMPONENTS.md, HOWTO.md
  rmncah/  vaxx/  pooled/  the apps: app.R, pages.R (not pooled), modules/, translation/translation.json, help/
js/                        React/TypeScript source of the components; `npm run build` writes www/cd-react
```

## An app's anatomy (`app.R`)

The order matters; this is what `apps/vaxx/app.R` does, in order:

```r
options(shiny.maxRequestSize = ..., future.globals.maxSize = ...)
options(cd2030.selected_group = "vaccine")
library(cd2030.core); pacman::p_load(shiny, shiny.react, ...)

source("../_shared/load.R"); cd_ui_load()          # 1. the shared UI

options(cd2030.app_group = "vaccine")              # 2. pin the group (see "The indicator group" below)
set_selected_group("vaccine")
options(cd2030.config = list(...))                 #    per-app settings for the shared modules (see "Config")

source("modules/0_upload_data.R")                  # 3. the app's OWN modules, then the registry
source("pages.R")

app_name <- Sys.getenv("CDSUITE_SHINY_NAME", "Vaxx") ...   # 4. environment from DataSuite
i18n <- init_i18n(translation_json_path = cd_translations("translation/translation.json"))
i18n$set_translation_language(language); cd_use_i18n(i18n)

cd_nav_sections <- list(cd_nav_start(), cd_nav_quality(), cd_nav_denominators(),
                        cd_nav_section("lbl_nav_section_analysis", cd_nav_national(), cd_nav_subnational()))

cd_app(app_name = app_name, app_version = app_version, theme = "vaccine",      # 5. build and return the app
       nav_sections = cd_nav_sections, registry = cd_page_registry,
       i18n = i18n, language = language, selected_file = selected_file)
```

`cd_app()` returns the `shinyApp`, so it must be the last expression of `app.R`. If you source `app.R` in a test script,
wrap the call in `invisible()` -- at top level R auto-prints the app object, which *runs* it.

The environment variables come from DataSuite: `CDSUITE_SHINY_NAME`, `_VERSION`, `_LOCALE`, and
`CDSUITE_SHINY_SELECTED_FILE` (a dataset path for rmncah/vaxx, a folder of `.rds` files for pooled).

### The page registry (`pages.R`)

One `cd_page_def()` per analysis page; `cd_page_registry` is a list of them and `cd_use_pages(cd_page_registry)` makes it
available to `cd_page_ui()`. From it `cd_app()` builds the page containers (`cd_pages_ui`) and starts every page server
(`cd_pages_server`), including each page's header (title, help, report button). A page module never repeats its title,
section or help chapter.

```r
cd_page_def(
  id = "national_target",                 # the tab name; also the module id
  ui = national_target_ui, server = national_target_server,
  title = "title_nav_global_coverage",    # translation keys
  section = "title_nav_national_analysis",
  subtitle = "sub_target_national",
  help = c("national-global-coverage"),   # c(help chapter, optional section) for the Get help button
  denominator = TRUE,                     # show the "Denominator" row under the header
  report = NULL,                          # key the report/notes buttons use, if the page has one
  active = TRUE                           # FALSE: the server is not given `active` (see below)
)
```

### A page module

```r
my_page_ui <- function(id, i18n) {
  ns <- NS(id)
  cd_page_ui(id, i18n,                                  # title/section/subtitle come from the registry
    filters = cd_filter_bar(cd_chip_select(ns("x"), "title_x", choices = c(opt_a = "a"), i18n = i18n)),
    cd_chart_card(...), cd_table_card(...)
  )
}

my_page_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache)); stopifnot(is.reactive(active))
  moduleServer(id, function(input, output, session) {
    data <- reactive({ req(cache(), active()); cache()$some_data })   # never compute before the page is opened
    ...
  })
}
```

* `cache` is a reactive holding the `cd2030.core` `CacheConnection` for the loaded dataset (`NULL` until one is loaded).
* `active` is TRUE once the page has been opened *with data loaded* and **stays TRUE** afterwards (`page_is()` in
  `cd_app()`); a new dataset resets it. Gate any real computation on `req(active())`, or every page computes on start-up.

## Config: what differs per app (`cd_cfg`)

The shared modules hold nothing specific to a group. Each app sets one list and the modules read it with
`cd_cfg("key", default)` (`R/core/config.R` documents the keys):

| Key | Meaning |
| --- | --- |
| `nat_cov_indicators` | tabs of national/sub-national coverage (may include `"fpet"`, which adds the family-planning chart) |
| `target_indicators` | tabs of the coverage-target pages |
| `equity_indicators`, `equity_custom_exclude` | tabs of Equity Assessment; indicators its Custom picker leaves out |
| `cov_trend_indicators`, `sub_derived_indicators`, `survey_comp_indicators` | tabs of the three Denominator Selection cards |
| `adjustment_indicators` | tabs of Data Adjustment Changes |
| `k_factors` | the adjustment factors: `list(name = list(id = "k_anc", label = "<translation key>"))` |
| `reporting_rate_indicators`, `reporting_rate_facet_ncol` | Reporting Rate's service chips and national plot layout |
| `consistency_pairs` | `list(c("anc1","penta1"), ...)`: one Consistency Checks tab per pair |
| `has_maternal` | does the group have a maternal denominator |

Other app-level options read by the shared code: `cd2030.default_indicators` (tabs of pages that pass no list; a vector
or a function such as `get_analysis_indicators`), `cd2030.denominator_choices` (denominator chip options),
`cd2030.wizard` (the Load Data wizard, see `R/wizard/wizard-config.R`).

## The indicator group -- read this before touching loading code

`cd2030.core` keeps **one indicator group for the whole R session** (`set_selected_group()`), and that value wins over
`options(cd2030.selected_group)`. It is changed by loading any dataset (each remembers the group it was built for). So an
app started after another in the same R session, or a saved dataset built for another group, would silently run on the
wrong group (e.g. vaxx showing OPD). Therefore:

* `app.R` calls `set_selected_group()` explicitly and stores `options(cd2030.app_group)`, which loading cannot change.
* The wizard reads `cd_wizard_indicator_group()` (the app's group), re-asserts it before every load, and refuses a
  dataset built for a different group (`cd_wizard_check_group()`).
* Saved copies are `<file>_<group>.rds` (`cd_saved_copy_name()`), so rmncah and vaxx can open the same source file.

## Shared modules (`R/modules/`)

Page modules that were identical in rmncah and vaxx, or differed only by an indicator list: outlier detection, reporting
rate, completeness, consistency checks, overall score, remove years, adjustment, denominator assessment/selection,
coverage, target, inequality (+ map), equity, and the national/sub-national wrappers. They are sourced by `cd_ui_load()`
like everything else; an app's `pages.R` just names them. Anything genuinely group-specific (rmncah's mortality,
utilization, health-system and Bayesian pages, each app's upload-data module) stays in that app's `modules/`.

## Themes

`cd_app(theme = ...)` puts `cd-theme-<name>` on `<body>`; `www/cd-ui.css` (last block, "App themes") re-declares the
five primary-colour tokens (`--cd-primary`, `-hover`, `-rgb`, `-ink`, `-tint`). Default (no class) is rmncah maroon;
`"vaccine"` is blue, `"pooled"` is green. Components only read the tokens, so a new theme is one CSS block.

## Translations

Text is never written into a component: it is a translation key. Translations are layered:
`translation/shared.json` (keys the apps have in common) is merged with the app's own `translation/translation.json`
(its extras; it may override a shared key) by `cd_translations()`, which returns a temporary merged file for
`shiny.i18n::init_i18n()`. Add a key used by more than one app to `shared.json`, an app-only key to that app's file.
React components get every language at once (`cd_text()` -> `{en, fr, pt}`) and re-render themselves on a language
change (one `cd-lang` message, `cd_set_language()`); plain HTML text uses `i18n$t()` and the `usei18n()` DOM rescan.

## Building the React components

Source is `../../js/src`; `npm run build` in `js/` (type-check + webpack) writes `www/cd-react/cd-react.js`, which is
committed so running an app needs no Node. See `docs/HOWTO.md` -> "Add a React component".

## Checking a change

There is no test suite for the UI; this is what we do (see `docs/HOWTO.md` -> "Verifying a change"): source each `app.R`
(with `invisible()`), build every registry page's UI and start its server with `testServer()`, run
`codetools::checkUsage()` for undefined functions, start the app and fetch `/`, and click through the affected pages
in a browser with a real dataset.
