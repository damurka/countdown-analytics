cd_download_report_ui <- function(id, i18n) {
  ns <- NS(id)

  # .cd-button__label is what the narrow-header CSS hides to go icon-only (styles.css), the same way it does for the
  # .cd-hdr-btn React buttons.
  cd_button(ns("download"), "btn_report_download", i18n, icon = "download", variant = "bare", class = "cd-header-download")
}

cd_download_report_server <- function(id, cache, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns
      rv <- reactiveValues(generating = FALSE, future = NULL, file_path = NULL)

      adminlevel_1 <- reactive({
        req(cache())
        cache()$subnational_regions %>%
          distinct(adminlevel_1) %>%
          arrange(adminlevel_1) %>%
          pull(adminlevel_1)
      })

      observeEvent(input$download, {
        req(cache())

        if (!cache()$check_coverage_params) {
          # Show an error dialog if data is not available
          cd_show_dialog(
            title = i18n$t("err_global_general"),
            i18n$t("err_report_no_data"),
            easy_close = TRUE,
            footer = cd_dialog_close_button(i18n$t("btn_global_ok"), primary = TRUE)
          )
        } else {
          ns <- NS(id)
          cd_show_dialog(
            title = i18n$t("title_download_options"),
            div(
              class = "cd-stack",
              cd_field_select(
                ns("type"), "title_report_type", i18n = i18n, value = "synthesis_report",
                options = cd_options(
                  set_names(c("synthesis_report", "admin_level_1_one_pager"), c("opt_report_synthesis", "opt_report_admin_one_pager")),
                  i18n
                )
              ),
              # Shown only for the one-pager -- a plain browser-side check on the type field's value (a
              # React input sets its Shiny value through the same setInputValue() a native one does).
              tags$div(
                `data-cd-show-when` = ns("type"), `data-cd-show-value` = "admin_level_1_one_pager",
                cd_field_select(
                  ns("adminlevel_1"), "opt_adminlevel_1", i18n = i18n,
                  value = if (length(adminlevel_1())) adminlevel_1()[1] else NULL,
                  options = cd_plain_options(adminlevel_1())
                )
              )
            ),
            footer = tagList(
              cd_dialog_close_button(i18n$t("btn_global_cancel")),
              cd_report_button_ui(ns("report"), label = i18n$t("btn_report_generate"), i18n = i18n)
            )
          )
        }
      })

      report_name <- reactive({
        req(input$type)
        input$type
      })

      admin_level <- reactive({
        req(input$type)
        if (input$type == "synthesis_report") {
          NULL
        } else {
          input$adminlevel_1
        }
      })

      cd_report_button_server("report", cache, report_name, i18n, admin_level)
    }
  )
}
