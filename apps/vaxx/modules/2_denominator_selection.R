source("modules/2_denominator_selection/coverage_trends.R")
source("modules/2_denominator_selection/survey_comparison.R")

denominatorSelectionUI <- function(id, i18n) {
  ns <- NS(id)

  countdownDashboard(
    dashboardId = ns("denominator_selection"),
    dashboardTitle = i18n$t("title_denom_selection"),
    i18n = i18n,
    countdownOptions = countdownOptions(
      title = i18n$t("title_global_options"),
      column(3, denominatorInputUI(ns("denominator"), i18n)),
      column(6, adminLevelInputUI(ns("admin_level"), i18n, include_national = TRUE))
    ),
    include_report = TRUE,
    coverageTrendsUI(ns("coverage"), i18n),
    surveyComparisonUI(ns("survey"), i18n)
  )
}

denominatorSelectionServer <- function(id, cache, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      denominatorInputServer("denominator", cache, i18n, allowInput = TRUE)
      admin <- adminLevelInputServer("admin_level", cache, i18n)

      admin_level <- reactive({
        req(admin())
        admin()$admin_level
      })

      region <- reactive({
        req(admin())
        admin()$region
      })

      coverageTrendsServer("coverage", cache, admin_level, region, i18n)
      surveyComparisonServer("survey", cache, admin_level, region, i18n)

      countdownHeaderServer(
        "denominator_selection",
        cache = cache,
        path = "denominator-assessment",
        section = "sec-denominator-selection",
        i18n = i18n
      )
    }
  )
}
