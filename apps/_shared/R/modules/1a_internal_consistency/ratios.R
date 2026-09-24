calculate_ratios_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_chart_card(
    title = i18n$t("title_consist_ratio_plots"),
    chart_toolbar = cd_plot_toolbar_ui(ns("ratios")),
    i18n = i18n,
    status = "success",
    width = 12,
    cd_plot_ui(ns("ratios"), toolbar_inline = TRUE)
  )
}

calculate_ratios_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ratio_summary <- reactive({
        req(cache(), active())
        cache()$ratios_summary
      })

      cd_plot_server(
        id = "ratios",
        i18n = i18n,
        plot_data = ratio_summary,
        plot_filename = reactive("ratio_plot"),
        plot_fun = function(d) {
          plot(
            d,
            title = i18n$t("plt_title_consist_ratios"),
            # x_axis = NULL,
            # y_axis = NULL,
            x_labels = c(
              "anc1_penta1"   = i18n$t("lbl_consist_ratio_anc1_penta1"),
              "opv1_opv3"     = i18n$t("lbl_consist_ratio_opv1_opv3"),
              "penta1_penta3" = i18n$t("lbl_consist_ratio_penta1_penta3")
            )
          )
        },
        excel_sheet = "ratio_plot"
      )
    }
  )
}
