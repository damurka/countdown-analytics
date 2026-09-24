national_inequality_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_page_ui(id, i18n,
    inequality_ui(ns("inequality"), i18n),
    # Years and palette are for the maps only, so they sit above the map charts rather than in the page-wide bar.
    cd_map_options(
      cd_chip_multi(ns("years"), "title_global_select_years", i18n = i18n),
      cd_palette_chip(ns("palette"), i18n)
    ),
    subnational_mapping_ui(ns("map"), i18n)
  )
}

national_inequality_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {

      selected_tab <- inequality_server("inequality", cache, i18n, reactive('adminlevel_1'), active = active)
      subnational_mapping_server("map", cache, i18n, reactive(input$palette), selected_tab, active = active)

      cd_years_sync(input, session, "years",
        years = reactive({ req(cache()); cache()$data_years }),
        selected = reactive({ req(cache()); cache()$mapping_years })
      )

      observeEvent(input$years, {
        req(cache())
        cache()$set_mapping_years(cd_years_input(input$years, cache()$data_years))
      })

    }
  )
}
