introduction_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_card(title = i18n$t('title_global_intro_main'),
      status = 'success',
      solidHeader = TRUE,
      width = 12,
      div(class = "cd-stack", uiOutput(ns("localized_markdown")))
  )
}

introduction_server <- function(id, selected_language) {
  stopifnot(is.reactive(selected_language))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      output$localized_markdown <- renderUI({
        lang <- selected_language()
        file_path <- str_glue("help/0_intro_{lang}.md")
        fallback <- "help/0_intro_en.md"

        includeMarkdown(if (file.exists(file_path)) file_path else fallback)
      })
    }
  )
}

