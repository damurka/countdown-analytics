overall_score_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_page_ui(id, i18n,
    filters = cd_filter_bar(
      cd_admin_level_ui(ns("region"), i18n, show_admin_level = FALSE)
    ),
    cd_chart_card(
      title = i18n$t("title_score_main"),
      chart_toolbar = tagList(cd_download_button_ui(ns("download_plot")), cd_download_button_ui(ns("download_data"))),
      i18n = i18n,
      status = "success",
      width = 12,
      cd_spinner(uiOutput(ns("overall_score")))
    )
  )
}

overall_score_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      admin <- cd_admin_level_server("region", cache, i18n, allow_select_all = TRUE, show_district = FALSE, show_admin_level = FALSE)
      region <- reactive({
        req(admin())
        admin()$region
      })

      # active(): see coverage_server() in modules/3_national_coverage/coverage.R for why.
      overall_score <- reactive({
        req(cache(), active())

        translated_labels <- list(
          header = list(
            h1 = i18n$t("title_score_monthly_complete"),
            h2 = i18n$t("title_score_extreme_outliers"),
            h3 = i18n$t("title_score_consist_annual")
          ),
          section = list(
            r1a   = i18n$t("lbl_score_1a"),
            # Combine text + threshold number
            r1b   = paste0(i18n$t("lbl_score_1b_prefix"), cache()$performance_threshold),
            r1c   = if (get_selected_group() == "vaccine") i18n$t("lbl_score_1c_vaccine") else i18n$t("lbl_score_1c_rmncah"),
            r2a   = i18n$t("lbl_score_2a"),
            r2b   = i18n$t("lbl_score_2b"),
            score = i18n$t("lbl_score_annual_score")
          ),
          metric = list(
            r_anc1_penta1    = i18n$t("lbl_consist_ratio_anc1_penta1"),
            r_opv1_opv3      = i18n$t("lbl_consist_ratio_opv1_opv3"),
            r_penta1_penta3  = i18n$t("lbl_consist_ratio_penta1_penta3"),
            ok_anc1_penta1   = i18n$t("lbl_score_range_anc1_penta1"),
            ok_penta1_penta3 = i18n$t("lbl_score_range_penta1_penta3"),
            ok_opv1_opv3     = i18n$t("lbl_score_range_opv1_opv3")
          )
        )
        if (is.null(region())) {
          cache()$calculate_overall_score("national", labels = translated_labels)
        } else {
          cache()$calculate_overall_score("adminlevel_1", region(), labels = translated_labels)
        }
      })

      output$overall_score <- renderUI({
        req(overall_score())
        out <- overall_score() %>%
          plot(years = cache()$data_years, title = i18n$t("lbl_score_metric_header")) %>%
          htmltools_value()
        HTML(as.character(out))
      })

      cd_download_button_server(
        id = "download_data",
        filename = reactive("overall_score"),
        extension = reactive("xlsx"),
        data = overall_score,
        i18n = i18n,
        label = "btn_global_download_data",
        icon = "table",
        button_class = "cd-tool-btn",
        content = function(file, d) {
          wb <- createWorkbook()
          cd_add_sheet(wb, i18n$t("lbl_score_metric_header"), d)
          saveWorkbook(wb, file, overwrite = TRUE)
        }
      )

      cd_download_button_server(
        id = "download_plot",
        filename = reactive("overall_score"),
        extension = reactive("png"),
        i18n = i18n,
        icon = "camera",
        content = function(file, plot_data) {
          out <- plot_data %>%
            plot(years = cache()$data_years, title = i18n$t("lbl_score_metric_header")) %>%
            save_as_image(path = file, zoom = 3)
        },
        data = overall_score,
        label = "btn_global_download_plot",
        button_class = "cd-tool-btn"
      )

    }
  )
}
