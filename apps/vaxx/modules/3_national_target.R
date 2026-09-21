source("modules/3_national_target/target.R")

nationalTargetUI <- function(id, i18n) {
  ns <- NS(id)

  countdownDashboard(
    dashboardId = ns("low_reporting"),
    dashboardTitle = i18n$t("title_nav_global_coverage"),
    i18n = i18n,
    countdownOptions(
      title = i18n$t("title_global_options"),
      column(3, denominatorInputUI(ns("denominator"), i18n))
    ),
    targetUI(ns("target"), i18n)
  )
}

nationalTargetServer <- function(id, cache, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      denominatorInputServer("denominator", cache, i18n)
      
      targetServer("target", cache, i18n, reactive("national"))

      countdownHeaderServer(
        "low_reporting",
        cache = cache,
        path = "national-global-coverage",
        i18n = i18n
      )
    }
  )
}
