cd_population_ui <- function(id) {
  ns <- NS(id)

  choices <- c(
    "opt_denom_live_births_dhis2" = "totlivebirths_dhis2",
    "opt_denom_total_births_dhis2" = "totbirths_dhis2",
    # "opt_denom_total_births_un" = "un_births",
    "opt_denom_total_pop_dhis2" = "totpop_dhis2",
    # "opt_denom_total_pop_un" = "un_population",
    "opt_denom_under1_dhis2" = "totunder1_dhis2"#,
    # "opt_denom_under1_un" = "un_under1"
  )
  cd_chip_select(
    ns("population"),
    label = "title_denom_pop_select",
    hint = "tt_denom_pop_select",
    choices = choices,
    # starts empty: the value comes from the cache, and an empty value is ignored below, so mounting never
    # overwrites the stored choice with the first option
    selected = ""
  )
}

cd_population_server <- function(id, cache) {
  stopifnot(is.reactive(cache))

  moduleServer(id = id, module = function(input, output, session) {
    mounted <- cd_mounted(input, "population")

    # cache -> chip, once the chip exists. Guarded the same way updateI18nSelectizeInput() used to internally
    # (a NULL value was silently a no-op there): cache()$derivation_population can still be NULL this early.
    observeEvent(list(cache(), mounted()), {
      req(cache(), mounted())
      value <- cache()$derivation_population
      if (!is.null(value)) cd_update_input("population", session, value = as.character(value))
    })

    # chip -> cache
    observeEvent(input$population, {
      req(cache(), input$population)
      cache()$set_derivation_population(input$population)
    })

    return(reactive(input$population))
  })
}
