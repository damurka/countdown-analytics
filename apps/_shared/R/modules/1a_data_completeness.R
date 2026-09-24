data_completeness_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_page_ui(id, i18n,
    filters = cd_filter_bar(
      cd_indicator_ui(ns("indicator"), i18n, tooltip = "tt_complete_indicator_missing", select_all = TRUE),
      cd_admin_level_ui(ns("admin_level"), i18n)
    ),
    cd_chart_card(
      title = i18n$t("title_complete_missing_indicators"),
      icon = "chart-line",
      chart_toolbar = uiOutput(ns("complete_toolbar")),
      i18n = i18n,
      width = 12,
      tabs = uiOutput(ns("complete_tabs")),
      cd_tab_panes(ns("indicator_tabs"), list(
        heat_map = cd_plot_ui(ns("completeness_heatmap"), toolbar_inline = TRUE),
        district = cd_plot_ui(ns("completeness_district"), toolbar_inline = TRUE),
        linegraph = cd_plot_ui(ns("completeness_linegraph"), toolbar_inline = TRUE)
      ))
    ),
    cd_table_ui(ns("incomplete_district"), i18n, "title_complete_district_missing")
  )
}

data_completeness_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns
      indicator <- cd_indicator_server("indicator")
      admin <- cd_admin_level_server("admin_level", cache, i18n, allow_select_all = TRUE, show_district = FALSE)

      # Page-owned tab strip + cd_tab_panes() -- same pattern as outlier_detection_server() (modules/
      # 1a_checks_outlier_detection.R). Tab KEYS (heat_map/district/linegraph) intentionally differ from the
      # underlying cd_plot_server() ids (completeness_heatmap/completeness_district/
      # completeness_linegraph, unchanged) -- mapped explicitly below, same as that page.
      complete_current_tab <- reactiveVal("heat_map")

      output$complete_tabs <- renderUI({
        cd_tab_strip(ns, tabs = c(
          heat_map = i18n$t("opt_heat_map"),
          district = i18n$t("title_complete_indicators"),
          linegraph = i18n$t("title_complete_missing_region")
        ), active = complete_current_tab())
      })

      output$complete_toolbar <- renderUI({
        switch(complete_current_tab(),
          heat_map = cd_plot_toolbar_ui(ns("completeness_heatmap")),
          district = cd_plot_toolbar_ui(ns("completeness_district")),
          linegraph = cd_plot_toolbar_ui(ns("completeness_linegraph"))
        )
      })

      complete_tab_click <- function(key) {
        observeEvent(input[[paste0("tab_", key)]], {
          complete_current_tab(key)
          cd_update_tab_panes(session, "indicator_tabs", selected = key)
        }, ignoreInit = TRUE)
      }
      complete_tab_click("heat_map")
      complete_tab_click("district")
      complete_tab_click("linegraph")

      admin_parts <- cd_admin_parts(admin)
      admin_level <- admin_parts$admin_level
      region <- admin_parts$region

      # active(): see coverage_server() in modules/3_national_coverage/coverage.R for why.
      completeness_districts <- reactive({
        req(cache(), active())
        if (!is.null(region())) {
          cache()$district_completeness
        } else {
          cache()$calculate_district_completeness_summary(region())
        }
      })

      completeness_summary <- reactive({
        req(cache(), active(), admin_level())
        if (admin_level() == "adminlevel_1" && is.null(region())) {
          cache()$completeness_admin1
        } else if (admin_level() == "district" && is.null(region())) {
          cache()$completeness_district
        } else {
          cache()$calculate_completeness_summary(admin_level(), region())
        }
      })

      # "Select All" is the empty indicator (""), which req() treats as missing -- and list_missing_units() only takes
      # one real indicator -- so for All the table is every indicator's missing units, with an indicator column.
      incomplete_district <- reactive({
        req(cache(), active(), !is.null(indicator()))

        if (nzchar(indicator())) {
          cache()$list_missing_units(indicator(), region())
        } else {
          codes <- unname(get_all_indicators())
          per_indicator <- lapply(codes, function(code) {
            units <- cache()$list_missing_units(code, region())
            if (nrow(units) == 0) return(NULL)
            dplyr::mutate(units, indicator = cd_plain_text(i18n, paste0("opt_", code)), .before = 1)
          })
          dplyr::bind_rows(per_indicator)
        }
      })
      
      cd_table_server(
        "incomplete_district",
        cache,
        i18n,
        control_type = "year",
        data = incomplete_district,
        columns = list(indicator = colDef(name = i18n$t("title_global_indicator"))),
        filename = reactive(paste0("checks_incomplete_districts_", indicator())),
        excel_write_fun = function(wb, d) {
          cd_add_sheet(wb, i18n$t("title_complete_district_missing_1"), data, title = str_glue(i18n$t("title_complete_district_missing_ind")))
        }
      )

      cd_plot_server(
        id = "completeness_heatmap",
        i18n = i18n,
        plot_data = completeness_summary,
        plot_filename = reactive("completeness_heatmap"),
        plot_fun = function(d) {
          indicator <- if (!is.null(indicator()) && nzchar(indicator())) i18n$t(paste0("opt_", indicator())) else NULL
          region <- region()
          admin_level <- i18n$t(if (is.null(region)) paste0("opt_", admin_level()) else "opt_district")

          title <- if (nzchar(indicator())) {
            if (is.null(region())) {
              "plt_title_complete_heatmap_one"
            } else {
              "plt_title_complete_heatmap_one_reg"
            }
          } else {
            if (is.null(region())) {
              "plt_title_complete_heatmap_all"
            } else {
              "plt_title_complete_heatmap_all_reg"
            }
          }
          plot(
            d,
            indicator = indicator(),
            plot_type = "heat_map",
            title = str_glue(i18n$t(title)),
            x_axis = admin_level,
            y_axis = i18n$t(if (!is.null(indicator)) "title_global_year" else "title_global_indicator"),
            legend = i18n$t("lbl_leg_complete_heatmap")
          )
        },
        excel_write_fun = function(wb, d) {
          req(cache())
          completeness_rate <- cache()$completeness_national
          district_completeness_rate <- cache()$district_completeness

          cd_add_sheet(wb, i18n$t("title_complete_missing"), completeness_rate, title = i18n$t("tab_complete_monthly"))

          cd_add_sheet(wb, i18n$t("lbl_sheet_complete_district"), district_completeness_rate, title = i18n$t("tab_complete_district"))
        }
      )

      cd_plot_server(
        id = "completeness_district",
        i18n = i18n,
        plot_data = completeness_districts,
        plot_filename = reactive("completeness_district"),
        plot_fun = function(d) {
          req(indicator())
          indicator <- if (!is.null(indicator()) || nzchar(indicator())) i18n$t(paste0("opt_", indicator())) else NULL
          plot(
            d,
            indicator = indicator(),
            title = str_glue(i18n$t("plt_title_complete_district_plot")),
            y_axis = i18n$t("lbl_axis_y_complete_trend"),
            x_axis = i18n$t("title_global_year")
          )
        }
      )

      cd_plot_server(
        id = "completeness_linegraph",
        i18n = i18n,
        plot_data = completeness_summary,
        plot_filename = reactive("completeness_linegraph"),
        plot_fun = function(d) {
          req(indicator())
          indicator <- if (!is.null(indicator()) || nzchar(indicator())) i18n$t(paste0("opt_", indicator())) else NULL
          admin_level <- i18n$t(if (is.null(region())) paste0("opt_", admin_level()) else "opt_district")
          plot(
            d,
            indicator = indicator(),
            plot_type = "trend",
            title = str_glue(i18n$t("plt_title_complete_trend")),
            y_axis = i18n$t("lbl_axis_y_complete_trend"),
            x_axis = i18n$t("title_global_year")
          )
        }
      )

    }
  )
}
