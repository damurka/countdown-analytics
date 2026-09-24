cd_indicator_ui <- function(id, i18n, label = NULL, tooltip = NULL, indicators = NULL, select_all = FALSE) {
  ns <- NS(id)
  label <- if (is.null(label)) "title_global_indicator" else label
  choices <- indicators %||% get_all_indicators()
  if (is.null(choices) || is.null(names(choices))) {
    names(choices) <- paste0("opt_", choices)
  }
  if (select_all) {
    choices <- c("opt_global_select_all" = "", choices)
  }

  cd_chip_select(ns("indicator"),
    label = label,
    i18n = i18n,
    choices = choices,
    hint = tooltip
  )
}

cd_indicator_server <- function(id) {
  moduleServer(id = id, module = function(input, output, session) {
    return(reactive(input$indicator))
  })
}
