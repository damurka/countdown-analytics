source("modules/3_national_coverage/coverage.R")

nationalCoverageUI <- function(id, i18n, label) {
  ns <- NS(id)

  countdownDashboard(
    dashboardId = ns("national_coverage"),
    dashboardTitle = i18n$t("title_coverage_national"),
    i18n = i18n,
    countdownOptions(
      title = i18n$t("title_global_options"),
      column(3, denominatorInputUI(ns("denominator"), i18n))
    ),
    coverageUI(ns("coverage"), i18n, "title_coverage_national")
  )
}

nationalCoverageServer <- function(id, cache, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      denominatorInputServer("denominator", cache, i18n)
      
      coverageServer("coverage", cache, i18n, reactive("national"))
      
      countdownHeaderServer(
        "national_coverage",
        cache = cache,
        path = "national-coverage",
        i18n = i18n
      )
    }
  )
}
