denominatorInputUI <- function(id, i18n) {
  ns <- NS(id)
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
}

denominatorInputServer <- function(id, cache, i18n, label = 'title_denom_select_best', allowInput = FALSE) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns = session$ns

      denominator <- reactive({
        req(cache())
        cache()$denominator
      })
      
      observe({
        req(denominator())
        updateSelectizeInput(session, 'denominator', selected = denominator())
        
        if (!allowInput) {
          runjs(str_glue("$('#{ns('denominator')}')[0].selectize.lock();"))
        }
      })

      observeEvent(input$denominator, {
        req(cache(), input$denominator, allowInput)
        cache()$set_denominator(input$denominator)
      })
    }
  )
}
