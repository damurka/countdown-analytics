adjustment_changes_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_page_ui(id, i18n,
    cd_tabbed_charts_ui(ns("panel"), i18n, "title_adjust_visualize", cd_coverage_plot_ui,
      indicators = cd_cfg("adjustment_indicators"),
      customIndicators = get_all_indicators(),
    )
  )
}

adjustment_changes_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      indicator <- cd_indicator_server("indicator")

      data <- reactive({
        req(cache())
        cache()$data_with_excluded_years
      })

      k_factors <- reactive({
        req(cache())

        if (cache()$adjusted_flag) {
          cache()$k_factors
        } else {
          vapply(cd_cfg("k_factors"), function(f) 0, numeric(1))
        }
      })

      # active(): see coverage_server() in modules/3_national_coverage/coverage.R for why. data()/k_factors()
      # themselves stay eager (cheap field reads); this page's own generate_adjustment_values() call is the
      # one worth deferring.
      adjustments <- reactive({
        req(data(), active())
        data() %>%
          generate_adjustment_values(adjustment = "custom", k_factors = k_factors())
      })

      cd_tabbed_charts_server(
        "panel",
        serverInput = function(id, current_indicator) {
          custom_adjustments <- reactive({
            req(adjustments())
            adjustments() %>%
              filter_adjustment_value(current_indicator)
          })

          cd_coverage_plot_server(
            id = id, # or just ind if inside the same module id
            filename = reactive(paste0(current_indicator, "_adjustement_changes")),
            data_fn = custom_adjustments,
            sheet_name = reactive(i18n$t(paste0("opt_", current_indicator))),
            plot_fun = function(d) {
              indicator <- i18n$t(paste0("opt_", current_indicator))
              plot(d,
                title = str_glue(i18n$t("plt_title_adjust_comparison")),
                legend_labels = c(
                  raw = str_glue(i18n$t("lbl_adjust_n_before")),
                  adjusted = str_glue(i18n$t("lbl_adjust_n_after"))
                )
              )
            },
            i18n = i18n
          )
        },
        indicators = cd_cfg("adjustment_indicators")
      )

    }
  )
}
