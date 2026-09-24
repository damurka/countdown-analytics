denominator_selection_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_page_ui(id, i18n,
    filters = cd_filter_bar(
      if (cd_has_maternal()) cd_denominator_ui(ns("maternal_denominator"), i18n, allow_input = TRUE, is_maternal = TRUE),
      cd_denominator_ui(ns("vaxx_denominator"), i18n, allow_input = TRUE),
      cd_admin_level_ui(ns("admin_level"), i18n, include_national = TRUE)
    ),
    survey_comparison_ui(ns("survey"), i18n),
    subnational_denominator_ui(ns('subnational'), i18n),
    coverage_trends_ui(ns("coverage"), i18n)
  )
}

denominator_selection_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      if (cd_has_maternal()) cd_denominator_server("maternal_denominator", cache, i18n, allowInput = TRUE, is_maternal = TRUE)
      cd_denominator_server("vaxx_denominator", cache, i18n, allowInput = TRUE)
      admin <- cd_admin_level_server("admin_level", cache, i18n)

      admin_parts <- cd_admin_parts(admin)
      admin_level <- admin_parts$admin_level
      region <- admin_parts$region

      coverage_trends_server("coverage", cache, admin_level, region, i18n, active = active)
      survey_comparison_server("survey", cache, admin_level, region, i18n, active = active)
      subnational_denominator_server('subnational', cache, i18n, active = active)

    }
  )
}
