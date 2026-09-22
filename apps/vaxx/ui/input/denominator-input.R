denominatorInputUI <- function(id, i18n, allow_input = FALSE) {
  ns <- NS(id)

  if (allow_input) {
    choices <- c(
      "opt_dhis2" = "dhis2",
      "opt_anc1" = "anc1",
      "opt_penta1" = "penta1",
      "opt_penta1derived" = "penta1derived"
    )
    i18nSelectizeInput(
      ns("denominator"),
      label = "title_denom_select_best",
      tooltip = "tt_denom_select_best",
      choices = choices
    )
  } else {
    uiOutput(ns("selected_denominator"))
  }
}

denominatorInputServer <- function(id, cache, i18n, label = 'title_denom_select_best', allowInput = FALSE) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      denominator <- reactive({
        req(cache())
        cache()$denominator
      })

      observe({
        req(denominator(), allowInput)

        if (is.null(input$denominator) || input$denominator != denominator()) {
          updateI18nSelectizeInput(session, 'denominator', selected = denominator())
        }
      })

      observeEvent(input$denominator, {
        req(cache(), input$denominator, allowInput)
        if (input$denominator == "") return()

        isolate(cache()$set_denominator(input$denominator))
      })

      output$selected_denominator <- renderUI({
        req(denominator())

        translate_or <- function(key, fallback) {
          val <- i18n$t(key)
          if (is.null(val) || identical(val, key)) fallback else val
        }

        code <- denominator()
        code_text <- translate_or(paste0('opt_', code), toupper(code))

        tags$div(
          class = 'form-group',
          tags$label(class = 'control-label', translate_or(label, 'Denominator')),
          tags$div(class = 'denominator-readonly-control', code_text)
        )
      })
    }
  )
}
