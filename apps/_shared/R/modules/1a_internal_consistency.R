internal_consistency_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_page_ui(id, i18n,
    calculate_ratios_ui(ns("ratios"), i18n = i18n),
    consistency_check_ui(ns("consistency"), i18n = i18n)
  )
}

internal_consistency_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      calculate_ratios_server("ratios", cache, i18n, active = active)
      consistency_check_server("consistency", cache, i18n, active = active)

    }
  )
}
