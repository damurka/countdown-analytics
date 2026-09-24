# Naming conventions

See also `README.md` (architecture), `docs/COMPONENTS.md` (function reference) and `docs/HOWTO.md` (recipes).

Status: **applied** to `_shared`, rmncah and vaxx. Where the table below differs, the code wins: `countdownDashboard` became `cd_page_body` and `countdownBody` became `cd_page_content` (not folded into `cd_page_ui`).

Originally written as a proposal, from an inventory of every function in `_shared/R` (128) and the
app modules (~110). Today the same job is named four different ways:

| Style today | Count | Examples |
| --- | --- | --- |
| `cd_snake` | 44 | `cd_card`, `cd_show_dialog`, `cd_page_ui` |
| `cdCamel` | 35 | `cdButton`, `cdChipSelect`, `cdSpinner` |
| camelCase, no prefix | 42 | `tabPanelsUI`, `downloadButtonServer`, `countdownDashboard` |
| snake_case, no prefix | 7 | `chart_layout`, `apply_chart_options` |

## The rules

1. **One casing: `snake_case`.** It is base R and tidyverse style, and it already covers the largest group. camelCase
   only survives where Shiny itself defines the name (`renderUI`, `moduleServer`, `NS`).
2. **One prefix: everything in `_shared` starts with `cd_`.** There is no package namespace yet, so the prefix *is*
   the namespace. App code (`modules/`, `pages.R`, `app.R`) has no prefix.
3. **Name = what it *is* (a noun), not what it does.** `cd_card`, `cd_button`, `cd_chip_select`. Verbs are only for
   things that act: `cd_show_dialog`, `cd_update_input`, `cd_use_i18n`, `cd_navigate_to`.
4. **A Shiny module is a pair with the same stem: `<stem>_ui()` and `<stem>_server()`.** Never `xUI` + `xServer`,
   never `xSelect` + `xSelectServer`. Both halves live in one file.
5. **A React component has a matching pair of names:** `CdChipSelect` (TypeScript) is `cd_chip_select()` (R).
   `Cd<Name>` <-> `cd_<name>`; the R function only builds props and calls `cd_react_element()`.
6. **Private helpers start with a dot** (`.cd_state`) and are never used by an app.
7. **Constants are values, not functions, and say so:** `cd_admin_level_choices`, not `admin_level_choices()`.
8. **CSS classes:** `cd-<block>__<element>--<modifier>`. Already followed; keep.
9. **Translation keys:** unchanged (`btn_`, `title_`, `sub_`, `msg_`, `lbl_`, ...).

## Overlaps to resolve (same job, several names)

| Problem | Today | Proposal |
| --- | --- | --- |
| "dashboard" means three things | `countdownDashboard` (a page body), `dashboardPage` (the whole HTML page), `dashboardBody` (the content area) | `cd_page_ui` already builds a page body -> **fold `countdownDashboard` into it**; `dashboardPage` -> `cd_app_ui`; `dashboardBody` -> inline into `cd_app_ui` |
| "page" means three things | `cd_page` (a container shown/hidden by the nav), `cd_page_ui` (its content), `cd_page_def` (its registry entry) | keep `page` for the registry + content; rename the container to **`cd_screen` / `cd_screens`** |
| Three "headers" | `cd_header` (app top bar), `countdownHeader` (page title block), `cdCardHeader` (card title) | `cd_app_bar`, `cd_page_header` (+ `_server`), `cd_card_header` |
| Filter bar built two ways | `countdownOptions()` wraps `cdFilterBar()`, plus `cd_unwrap_layout()` for Bootstrap column wrappers nobody passes now | one function **`cd_filter_bar()`**; delete `cd_unwrap_layout` and `countdownBody` |
| Tabs at three levels | `tabPanelsUI/Server` (a whole tabbed chart card), `cd_tab_panels` (the panes), `cd_card_tabs` (the strip) | `cd_tabbed_charts_ui/_server`, `cd_tab_panes`, `cd_tab_strip` |
| "Downloads" names four different things | `plotDownloadsRowUI` (a plot with its tools), `tableDownloadsUI` (a table card body), `downloadCoverageUI` (a coverage plot), `downloadButtonUI` (one button) | `cd_plot_ui/_server`, `cd_table_ui/_server`, `cd_coverage_plot_ui/_server`, `cd_download_button_ui/_server` |
| Filter inputs named three ways | `adminLevelInputUI`, `indicatorSelect`, `populationSelect`, `denominatorInputUI`, `yearsSelectSync` | `cd_admin_level_ui/_server`, `cd_indicator_ui/_server`, `cd_population_ui/_server`, `cd_denominator_ui/_server`, `cd_years_sync` |
| `updateCdChip` updates *any* React input, not just chips | used for checkboxes, textareas, chips | **`cd_update_input`** |
| Two message boxes | `cdMessageBox` (component) and `messageBoxUI/Server` (module around it) | `cd_message_box` (component) and `cd_message_ui/_server` (module) |
| Text helpers | `cdText`, `i18n_plain`, `cdOptions`, `cdPlainOptions`, `cd_label`, `cd_key` | `cd_text`, `cd_plain_text`, `cd_options`, `cd_plain_options`, `cd_label`, `cd_key` |

## Rename map (shared)

`cdCamel` and unprefixed names become `cd_snake`; `cd_snake` names are unchanged unless listed above.

| Old | New |
| --- | --- |
| `cdButton` `cdExpandButton` `cd_ask_ai_button` | `cd_button` `cd_expand_button` `cd_ask_ai_button` |
| `cdChipSelect` `cdChipMulti` `cdChipNumber` `cdFieldSelect` `cdFieldNumber` | `cd_chip_select` `cd_chip_multi` `cd_chip_number` `cd_field_select` `cd_field_number` |
| `cdCheckbox` `cdTextArea` `cdFilterBar` (+ `countdownOptions`) | `cd_checkbox` `cd_text_area` `cd_filter_bar` |
| `cdChartCustomize` | `cd_chart_customize` |
| `cdMessageBox` `cdStatusBanner` `cdTooltip` `cdLoadingSkeleton` `cdSpinner` `cdEmptyState` | `cd_message_box` `cd_status_banner` `cd_tooltip` `cd_loading_skeleton` `cd_spinner` `cd_empty_state` |
| `cdFileUpload` `cdResetFileUpload` `cdSetFileUpload` `cdDirectoryUpload` `cdMappingModal` `cdWizardSteps` | `cd_file_upload` `cd_reset_file_upload` `cd_set_file_upload` `cd_directory_upload` `cd_mapping_modal` `cd_wizard_steps` |
| `cdText` `cdOptions` `cdPlainOptions` `cdChipTexts` `i18n_plain` | `cd_text` `cd_options` `cd_plain_options` `cd_chip_texts` `cd_plain_text` |
| `updateCdChip` `cdMounted` `cdRemounted` `cdSetLanguage` | `cd_update_input` `cd_mounted` `cd_remounted` `cd_set_language` |
| `renderCustomPlot` `plotCustomOutput` `cd_plot_client_height` | `cd_render_plot` `cd_plot_output` `cd_plot_client_height` |
| `chart_axes` `chart_layout` `chart_label_defaults` `apply_chart_options` | `cd_chart_axes` `cd_chart_layout` `cd_chart_label_defaults` `cd_apply_chart_options` |
| `helpButtonUI/Server` `reportButtonUI/Server` `documentationButtonUI/Server` `downloadReportUI/Server` | `cd_help_button_ui/_server` `cd_report_button_ui/_server` `cd_notes_button_ui/_server` `cd_download_report_ui/_server` |
| `admin_level_choices` `denominator_choices` `default_indicators` | `cd_admin_level_choices` `cd_denominator_choices` `cd_default_indicators` |
| `cd_header` `cd_sidebar` | `cd_app_bar` `cd_sidebar` |

## App modules

Each page module is `<page>_ui()` / `<page>_server()` (`reportingRateUI` -> `reporting_rate_ui`,
`healthSystemNationalServer` -> `health_system_national_server`). Fix the one typo on the way: `dataAjustmentUI` ->
`data_adjustment_ui`. Sub-modules follow the same rule (`coverageUI` -> `coverage_ui`), and the helper functions in
`step_status.R` / `wizard_*` are already snake_case.

## How the rename would be done

Mechanical and scripted: a name -> name table, whole-word replacement over `_shared/R`, `modules/`, `pages.R`, `app.R`,
plus the R names quoted in comments. Then `parse()` every file, load the shared UI, build every page's UI in R and
click through the app. It should be done **before** vaxx moves onto `_shared`, so vaxx is written against the new
names once instead of being renamed afterwards. React component names (`CdButton`, ...) and CSS classes do not change.
