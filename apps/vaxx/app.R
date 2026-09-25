# increase the uploading file size limit to 2000M, now our upload is not just about hfd file, it also include the saved data.
options(shiny.maxRequestSize = 2 * 1024 * 1024^2)
options(future.globals.maxSize = 3 * 1024 * 1024^2) # 2 GB
options(shiny.fullstacktrace = TRUE)
# options(shiny.error = browser)

# options(shiny.trace = TRUE)
# options(shiny.trace = FALSE)

options(cd2030.selected_group = "vaccine")

library(cd2030.core)

# cd2030.core keeps ONE indicator group for the whole R session (set_selected_group()), and that value wins over
# options(cd2030.selected_group): an app started after another one in the same R session, or a saved dataset built
# for another group, would otherwise run on the wrong group (e.g. vaxx showing OPD). So say it explicitly, and keep
# our own copy (cd2030.app_group) that loading a dataset cannot change.
options(cd2030.app_group = "vaccine")
set_selected_group("vaccine")

# What is particular to this app for the shared page modules (../_shared/R/core/config.R lists the keys).
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

pacman::p_load(
  shiny,
  dplyr,
  future,
  htmltools,
  openxlsx,
  plotly,
  purrr,
  promises,
  flextable,
  jsonlite,
  # forcats,
  lubridate,
  reactable,
  rlang,
  # sf,
  shiny.i18n,
  shiny.react,
  stringr,
  update = FALSE
)

# The shared Countdown UI (../_shared): every cd_*/cd* builder, the React components' R side, the assets.
source("../_shared/load.R")
cd_ui_load()
options(cd2030.denominator_choices = c("opt_dhis2" = "dhis2", "opt_anc1" = "anc1", "opt_penta1" = "penta1", "opt_penta1derived" = "penta1derived"))
# The tabs the national/sub-national analysis pages open with; their "Custom" tab lets the user pick any indicator
# from cd2030.core's get_analysis_indicators() (the tabbed-charts helper's customIndicators default).
vaxx_analysis_tabs <- c("penta3", "measles1", "dropout_penta13", "dropout_penta3mcv1")
options(cd2030.default_indicators = vaxx_analysis_tabs)

source("modules/0_upload_data.R")

# Every analysis page, in one list (see pages.R).
source("pages.R")

app_name <- Sys.getenv("CDSUITE_SHINY_NAME", unset = "Vaxx")
app_version <- Sys.getenv("CDSUITE_SHINY_VERSION", unset = "2.0.0")
selected_file <- Sys.getenv("CDSUITE_SHINY_SELECTED_FILE", unset = NA)
language <- Sys.getenv("CDSUITE_SHINY_LOCALE", unset = "en")

print(selected_file)

i18n <- init_i18n(translation_json_path = cd_translations("translation/translation.json"))
i18n$set_translation_language(language)
cd_use_i18n(i18n)

# The sidebar/header nav tree: the standard sections (_shared/R/layout/nav-sections.R); vaxx adds no groups of its own.
cd_nav_sections <- list(
  cd_nav_start(),
  cd_nav_quality(),
  cd_nav_denominators(),
  cd_nav_section("lbl_nav_section_analysis", cd_nav_national(), cd_nav_subnational()),
  # Reports built from blocks of this app's charts and tables (_shared/R/modules/reports.R)
  cd_nav_section("lbl_nav_section_output",
    cd_nav_item("title_reports", tabName = "reports", icon = "file-lines", requires_adjustment = TRUE)
  )
)

cd_app(
  app_name = app_name, app_version = app_version, theme = "vaccine",
  nav_sections = cd_nav_sections, registry = cd_page_registry,
  i18n = i18n, language = language, selected_file = selected_file
)
