den_indicators <- c("population", "births", "under1")

denominator_assessment_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_page_ui(id, i18n,
    filters = cd_filter_bar(
      cd_population_ui(ns("derivation_population"))
    ),
    cd_tabbed_charts_ui(ns("panel"), i18n, "title_denom_pop_comparison", cd_coverage_plot_ui,
      indicators = den_indicators, showCustom = FALSE
    )
  )
}

denominator_assessment_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      cd_population_server("derivation_population", cache)

      cd_tabbed_charts_server(
        "panel",
        serverInput = function(id, current_indicator) {
          # active(): see coverage_server() in modules/3_national_coverage/coverage.R for why.
          denominators <- reactive({
            req(cache(), active())
            cache()$denominator_metrics
          })
          
          cd_coverage_plot_server(
            id = id, # or just ind if inside the same module id
            filename = reactive(paste0(current_indicator, "_plot")),
            data_fn = denominators,
            sheet_name = reactive(i18n$t(paste0("opt_", current_indicator))),
            plot_fun = function(d) {
              if (current_indicator == "population") {
                my_title <- i18n$t("plt_title_denom_pop")
                my_labels <- c(i18n$t("lbl_leg_denom_un_pop"), i18n$t("lbl_leg_denom_dhis2_pop"))
              } else if (current_indicator == "births") {
                my_title <- i18n$t("plt_title_denom_births")
                my_labels <- c(i18n$t("lbl_leg_denom_un_births"), i18n$t("lbl_leg_denom_dhis2_live_births"), i18n$t("lbl_leg_denom_dhis2_tot_births"))
              } else if (current_indicator == "under1") {
                my_title <- i18n$t("plt_title_denom_under1")
                my_labels <- c(i18n$t("lbl_leg_denom_un_under1"), i18n$t("lbl_leg_denom_dhis2_under1"))
              }

              plot(d,
                metric = current_indicator,
                title = my_title,
                x_label = i18n$t("title_global_year"),
                y_label = i18n$t("opt_population"),
                legend_labels = my_labels
              )
            },
            i18n = i18n
          )
        },
        indicators = den_indicators,
        showCustom = FALSE
      )

    }
  )
}
