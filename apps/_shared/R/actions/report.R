cd_report_button_ui <- function(id, label, i18n = cd_i18n()) {
  ns <- NS(id)
  cd_button(ns('generate_report'), label, i18n, icon = 'file-lines', size = 'sm')
}

cd_report_button_server <- function(id, cache, report_name, i18n, adminlevel_1) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(report_name))
  stopifnot(is.reactive(adminlevel_1))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns
      rv <- reactiveValues(generating = FALSE, future = NULL, file_path = NULL)

      country <- reactive({
        req(cache())
        cache()$country
      })

      report_file_name <- reactive({
        req(country(), report_name())
        paste0(country(), '_', report_name(), '_countdown_report')
      })

      extension <- reactive({
        'docx'
        # req(input$format)

        # switch(input$format,
        #        'word_document' = 'docx',
        #        'pdf_document' = 'pdf',
        #        'html_document' = 'html')
      })

      # observeEvent(input$generate_report, {
      #   req(cache())


      observeEvent(input$generate_report, {
        # req(input$format)
        req(cache())

        # params <- list(
        #   format = input$format
        # )

        cd_show_dialog(
          title = i18n$t("msg_report_generating_title"),
          div(
            class = 'cd-dialog__centered',
            div(class = 'cd-dialog__icon', icon('file-lines')),
            p(i18n$t("msg_report_generating"), class = 'cd-dialog__lead'),
            div(class = 'cd-ring', role = 'status', `aria-label` = 'loading')
          ),
          footer = NULL,
          easy_close = FALSE
        )

        rv$generating <- TRUE
        rv$future <- future({
          temp_file <- tempfile(fileext = paste0('.', extension()))
          generate_report(
            cache = cache(),
            output_file = temp_file,
            report_name = report_name(),
            adminlevel_1 = adminlevel_1(),
            i18n = i18n,
            output_format = 'word_document'
          )
          temp_file
        }, globals = list(cache = cache, generate_report = generate_report,
                          extension = extension, adminlevel_1 = adminlevel_1, report_name = report_name, i18n = i18n))

        rv$future %...>% {
          rv$generating <- FALSE
          rv$file_path <- .

          # Update the dialog to show the download button
          cd_show_dialog(
            title = i18n$t("msg_report_download_ready"),
            div(
              class = 'cd-dialog__centered',
              div(class = 'cd-dialog__icon cd-dialog__icon--ok', icon('circle-check')),
              tags$h4(tagList(i18n$t("msg_global_success"), '!')),
              p(i18n$t("msg_report_generated")),
              p(i18n$t("msg_report_dialog"))
            ),
            footer = tagList(
              div(
                class = "cd-row",
                cd_download_button_ui(ns('download_data')),
                cd_dialog_close_button(i18n$t("btn_report_dismiss"))
              )
            ),
            easy_close = FALSE # Prevent accidental dismissal by clicking outside the dialog
          )
        } %...!% {
          print(.)
          # Handle errors
          rv$generating <- FALSE
          cd_show_dialog(
            title = i18n$t("err_global_general"),
            i18n$t("err_report_generation"),
            easy_close = TRUE,
            footer = cd_dialog_close_button(i18n$t("btn_global_ok"), primary = TRUE)
          )
        }
      })

      cd_download_button_server(
        id = 'download_data',
        filename = report_file_name,
        extension = extension,
        i18n = i18n,
        content = function(file, path) {
          req(path)
          file.copy(path, file)
        },
        data = reactive(rv$file_path),
        label = "btn_report_download",
        message = "msg_report_generating_title"
      )
    }
  )
}
