#' Run the Vaxx app
#'
#' The Countdown Vaxx app: the Load Data wizard, the data quality, denominator and analysis pages, and the report
#' builder. DataSuite starts it with its settings in environment variables (`CDSUITE_SHINY_NAME`, `_VERSION`, `_LOCALE`,
#' `_SELECTED_FILE`); they can be given as arguments instead.
#'
#' @param selected_file A dataset to open (DataSuite's `CDSUITE_SHINY_SELECTED_FILE`), or `NA`.
#' @param language The starting language: `"en"`, `"fr"` or `"pt"`.
#' @param app_name,app_version The name and version shown in the header.
#' @param ... Passed to [shiny::shinyApp()]'s `options` (e.g. `port`, `launch.browser`).
#' @return A Shiny app object: printing it (or [shiny::runApp()]) runs it.
#' @export
run_app <- function(selected_file = Sys.getenv("CDSUITE_SHINY_SELECTED_FILE", unset = NA),
                    language = Sys.getenv("CDSUITE_SHINY_LOCALE", unset = "en"),
                    app_name = Sys.getenv("CDSUITE_SHINY_NAME", unset = "Vaxx"),
                    app_version = Sys.getenv("CDSUITE_SHINY_VERSION", unset = as.character(utils::packageVersion("cd2030.vaxx"))),
                    ...) {
  # uploads include saved datasets, not just the facility data
  options(shiny.maxRequestSize = 2 * 1024 * 1024^2, future.globals.maxSize = 3 * 1024 * 1024^2, shiny.fullstacktrace = TRUE)

  # cd2030.core keeps ONE indicator group for the whole R session (set_selected_group()); this app's own copy
  # (cd2030.app_group) is one loading a dataset cannot change
  options(cd2030.selected_group = "vaccine", cd2030.app_group = "vaccine")
  set_selected_group("vaccine")

  # What is particular to this app for the shared page modules (R/ui-core-config.R in cd2030.core lists the keys).
  options(cd2030.config = list(
    target_indicators = c("vaccine", "dropout"),
    # cd2030.core's equiplot_*() take the analysis indicators, but the standard survey data has no coverage for these:
    equity_indicators = c("penta3", "measles1", "dropout_penta13", "dropout_penta3mcv1"),
    equity_custom_exclude = c("ideliv", "ipv1", "ipv2", "dropout_measles12"),
    cov_trend_indicators = c("penta1", "penta3", "measles1"),
    sub_derived_indicators = c("penta1", "penta3", "measles1"),
    survey_comp_indicators = c("instlivebirths", "bcg", "penta3", "measles1"),
    adjustment_indicators = c("instlivebirths", "bcg", "penta1", "measles1"),
    k_factors = list(
      anc = list(id = "k_anc", label = "title_adjust_anc_factor"),
      idelv = list(id = "k_delivery", label = "title_adjust_delivery_factor"),
      vacc = list(id = "k_vaccines", label = "title_adjust_vaccines_factor")
    ),
    reporting_rate_indicators = c("opt_anc" = "anc_rr", "opt_idelv" = "idelv_rr", "opt_vacc" = "vacc_rr"),
    consistency_pairs = list(c("anc1", "penta1"), c("penta1", "penta3"), c("opv1", "opv3"), c("ipv1", "ipv2")),
    has_maternal = FALSE
  ))
  vaxx_wizard_options()

  # the Introduction page's help, in each language
  options(cd2030.help_dir = system.file("intro", package = "cd2030.vaxx"))

  i18n <- shiny.i18n::init_i18n(translation_json_path = cd_translations(system.file("translation", "translation.json", package = "cd2030.vaxx")))
  i18n$set_translation_language(language)
  cd_use_i18n(i18n)

  # every analysis page, in one list (R/pages.R)
  pages <- vaxx_pages()
  cd_use_pages(pages)

  # the sidebar/header nav tree: the standard sections (cd2030.core) plus this app's own groups
  nav <- list(
    cd_nav_start(),
    cd_nav_quality(),
    cd_nav_denominators(),
    cd_nav_section("lbl_nav_section_analysis", cd_nav_national(), cd_nav_subnational()),
    # Reports built from blocks of this app's charts and tables (datasuite.ui, R/kit-reports.R)
    cd_nav_section("lbl_nav_section_output",
      cd_nav_item("title_reports", tabName = "reports", icon = "file-lines", requires_adjustment = TRUE)
    )
  )

  app <- cd_app(
    app_name = app_name, app_version = app_version, theme = "vaccine",
    nav_sections = nav, registry = pages,
    i18n = i18n, language = language, selected_file = selected_file,
    upload_ui = upload_data_ui, upload_server = upload_data_server
  )
  if (length(list(...))) app$options <- utils::modifyList(app$options %||% list(), list(...))
  app
}
