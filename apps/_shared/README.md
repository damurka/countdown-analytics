# Shared Countdown UI

The UI both Countdown apps (`rmncah`, `vaxx`) are built from. An app loads it with

```r
source("../_shared/load.R")
cd_ui_load()
```

and then writes only its own pages, translations and analysis. Nothing in an app's `modules/` should build page
chrome, cards, buttons, dialogs or download toolbars itself; it calls what is here.

## Where things are

| Folder | What is in it |
| --- | --- |
| `R/core` | translator state (`cd_i18n`, `cd_text`), asset helpers (`cd_head_assets`, `cd_react_element`), small Shiny helpers (`cd_update_input`, `cd_navigate_to`) |
| `R/components` | R wrappers for the React components: `cd_button`, `cd_chip_select`, `cd_field_select`, `cd_checkbox`, `cd_file_upload`, `cd_show_dialog`, `cd_spinner`, `cd_message_ui`, ... |
| `R/layout` | `cd_page_body` (a whole page), `cd_card` / `cd_chart_card` / `cd_table_card`, the page header, the sidebar and header shell, `cd_tabbed_charts_ui`, `cd_scoped_page_ui/_server` (national vs. sub-national pages that differ only in their admin-level filters, see `layout/scoped-page.R`) |
| `R/charts` | `cd_plot_ui/Server`, `cd_table_ui/Server`, `cd_coverage_plot_ui/Server`, download buttons, chart options |
| `R/filters` | admin level, indicator, population, years and denominator inputs |
| `R/actions` | Get help, add notes, generate report |
| `R/wizard` | The Load Data wizard (both apps): step rail, upload, data quality, national rates, survey/shapefile steps. An app sets `options(cd2030.wizard = ...)` for what differs per indicator group (see `wizard-config.R`) |
| `www` | `cd-ui.css`, self-hosted fonts, and the built React bundle `cd-react/cd-react.js` |

## Changing the React components

The source is `../../js/src`. `npm run build` in `js/` writes the bundle to `www/cd-react`.

## Conventions

- Text is never written into a component: it is a translation key, resolved with `cd_text()` (React) or
  `i18n$t()` (plain HTML).
- A page is `cd_page_body(dashboardId, dashboardTitle, eyebrow, subtitle, ...)`; its cards are
  `cd_chart_card()` / `cd_table_card()` inside `cd_card_row()` when two share a row.
- CSS classes all start with `cd-`. There is no Bootstrap, AdminLTE or shinydashboard anywhere.

## Translations and shared page modules

- **Translations are layered.** `translation/shared.json` holds every key the apps have in common; an app's own
  `translation/translation.json` holds only its extras (and may override a shared key). Apps build one translator with
  `init_i18n(translation_json_path = cd_translations("translation/translation.json"))`. A custom indicator group adds its
  own keys to its app's file, or passes more layers through `cd_translations(extra = )`.
- **Shared page modules** (`R/modules/`) are the modules that were identical in rmncah and vaxx. They hold nothing specific
  to one indicator group, so an app on any group uses them unchanged; parts that differ (a module's indicator list) stay in
  the app and are sourced by its `app.R`.

## Helpers that replaced repeated code

- `cd_add_sheet()` / `cd_sheet_writer()` (`R/charts/excel.R`): a worksheet for a chart or table export. `cd_plot_server()` and
  `cd_table_server()` take `excel_sheet =` (and `excel_title =`) for the data-on-one-sheet case; anything else is an
  `excel_write_fun` that calls `cd_add_sheet()` once per sheet.
- `cd_admin_parts(admin)` (`R/filters/admin-level.R`): the `admin_level` and `region` reactives from `cd_admin_level_server()`.
- `cd_scoped_page_ui/_server()` (`R/layout/scoped-page.R`) and `cd_cfg()` (`R/core/config.R`): see above.
