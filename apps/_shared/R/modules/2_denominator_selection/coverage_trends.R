coverage_trends_ui <- function(id, i18n) {
  ns <- NS(id)
  cd_tabbed_charts_ui(
    ns("panel"), 
    i18n, 
    "title_denom_pop_trend",
    uiInput = cd_coverage_plot_ui,
    indicators = cd_cfg("cov_trend_indicators"),
        showCustom = FALSE
  )
}

coverage_trends_server <- function(id, cache, admin_level, region, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(admin_level))
  stopifnot(is.reactive(region))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      cd_tabbed_charts_server(
        "panel",
        serverInput = function(id, current_indicator) {
          # active(): see coverage_server() in modules/3_national_coverage/coverage.R for why.
          coverage <- reactive({
            req(cache(), active(), cache()$check_inequality_params, admin_level())
            cache()$calculate_derived_coverage(current_indicator, admin_level(), region())
          })

          cd_coverage_plot_server(
            id = id, # or just ind if inside the same module id
            filename = reactive(paste0("sheet_", current_indicator, "_derived_coverage")),
            data_fn = coverage,
            sheet_name = reactive(i18n$t(paste0(current_indicator, "_derived_coverage"))),
            plot_fun = function(d) {
              req(admin_level())
              if (admin_level() != "national") req(region())
              region_name <- region()
              title <- if (is.null(region())) "plt_title_denom_nat_trend" else "plt_title_denom_subnat_trend"
              indicator <- i18n$t(paste0("opt_", current_indicator))
              plot(d, 
                   type = 'trend',
                   region = region(),
                   title = str_glue(i18n$t(title)),
                   x_label = i18n$t("title_global_year"),
                   y_label = str_glue(i18n$t("lbl_axis_y_coverage")),
                   legend_labels = cd_only_denominators(c(
                     "un"            = i18n$t("opt_un"),
                     "dhis2"         = i18n$t("opt_dhis2"),
                     "anc1"          = i18n$t("opt_anc1"),
                     "penta1"        = i18n$t("opt_penta1"),
                     "penta1derived" = i18n$t("opt_penta1derived"),
                     "anc1derived" = i18n$t("opt_anc1derived")
                   )))
            },
            i18n = i18n
          )
        },
        indicators = cd_cfg("cov_trend_indicators"),
        showCustom = FALSE
      )

    }
  )
}
