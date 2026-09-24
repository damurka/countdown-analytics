cd_help_button_ui <- function(id, name, i18n = cd_i18n()) {
  ns <- NS(id)
  cd_button(ns('help'), name, i18n, icon = 'circle-question', size = 'sm')
}

cd_help_button_server <- function(id, path, section = NULL, cache) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {

      observeEvent(input$help, {
        req(cache(), input$help)

        lang_code <- switch(
          cache()$language,
          en = '',
          fr = 'fr',
          pt = 'pt'
        )

        # Construct the URL concisely
        url <- paste0('https://datasuite.vercel.app/', lang_code, '/docs/framework/')
        if (!is.null(section)) {
          url <- paste0(url, '#', section)
        }
        browseURL(url)
      })
    }
  )
}
