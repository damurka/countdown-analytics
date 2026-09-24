equity_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_page_ui(id, i18n,
    filters = cd_filter_bar(
      cd_chip_select(ns("type"),
        label = i18n$t("title_equity_type"),
        i18n = i18n,
        choices = c(
          "opt_equity_area" = "area",
          "opt_equity_meduc" = "meduc",
          "opt_equity_wiq" = "wiq"
        )
      )
    ),
    cd_tabbed_charts_ui(ns("panel"), i18n, "title_equity_analysis", cd_coverage_plot_ui,
      indicators = cd_cfg("equity_indicators"),
      customIndicators = setdiff(get_analysis_indicators(), cd_cfg("equity_custom_exclude", character()))
    )
  )
}

equity_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      indicator <- cd_indicator_server("indicator")

      # active(): see coverage_server() in modules/3_national_coverage/coverage.R for why.
      data <- reactive({
        req(cache(), active())
        switch(input$type,
          "area" = cache()$area_survey,
          "meduc" = cache()$education_survey,
          "wiq" = cache()$wiq_survey
        )
      })

      cd_tabbed_charts_server(
        "panel",
        serverInput = function(id, current_indicator) {
          cd_coverage_plot_server(
            id = id, # or just ind if inside the same module id
            filename = reactive(paste0(current_indicator, "_", input$type, "_equity")),
            data_fn = data,
            sheet_name = reactive(i18n$t(paste0(current_indicator, "_derived_coverage"))),
            plot_fun = function(d) {
              req(input$type)
              indicator <- i18n$t(paste0("opt_", current_indicator))
              switch(input$type,
                area = equiplot_area(d, 
                                     current_indicator,
                                     title = str_glue(i18n$t("plt_title_equity_area")),
                                     x_title = str_glue(i18n$t("lbl_axis_y_coverage")),
                                     legend_title = i18n$t("lbl_leg_equity_area"),
                                     legend_labels = list(
                                       "Rural" = i18n$t("lbl_equity_area_rural"),
                                       "Urban" = i18n$t("lbl_equity_area_urban")
                                     )
                                    ),
                meduc = equiplot_education(d, 
                                           current_indicator,
                                           title = str_glue(i18n$t("plt_title_equity_education")),
                                           x_title = str_glue(i18n$t("lbl_axis_y_coverage")),
                                           legend_title = i18n$t("lbl_leg_equity_education"),
                                           legend_labels = list(
                                             "none" ~ i18n$t("lbl_equity_edu_none"),
                                             "primary" ~ i18n$t("lbl_equity_edu_primary"),
                                             "secondary+" ~ i18n$t("lbl_equity_edu_secondary")
                                           )
                                          ),
                wiq = equiplot_wealth(d, 
                                      current_indicator,
                                      title = str_glue(i18n$t("plt_title_equity_wealth")),
                                      x_title = str_glue(i18n$t("lbl_axis_y_coverage")),
                                      legend_title = i18n$t("lbl_leg_equity_wealth")
                                    )
              )
            },
            i18n = i18n
          )
        },
        indicators = cd_cfg("equity_indicators")
      )

    }
  )
}
