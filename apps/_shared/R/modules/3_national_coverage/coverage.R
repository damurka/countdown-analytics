coverage_ui <- function(id, i18n, key_label) {
  ns <- NS(id)
  cd_tabbed_charts_ui(ns("panel"), i18n, key_label, cd_coverage_plot_ui, indicators = cd_cfg("nat_cov_indicators"))
}

coverage_server <- function(id, cache, i18n, admin_level, region = reactive(NULL), active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {

      cd_tabbed_charts_server(
        "panel",
        serverInput = function(id, current_indicator) {
          # active(): every page's module server is created at startup (see app.R), so without this Shiny
          # would compute every indicator's coverage data once on the session's first flush, for a page no
          # one has opened -- the same fix bayesian_server() needed for its (far more expensive) model fits.
          denom_rx <- reactive({
            req(cache(), active())
            cache()$get_denominator(current_indicator)
          })
          data_rx <- reactive({
            req(cache(), active(), cache()$check_coverage_params)
            cache()$get_filtered_coverage(indicator = current_indicator, admin_level = admin_level(), region = region())
          })
          fpet_data <- reactive({
            req(cache(), active())
            cache()$fpet_data %>%
              filter(year >= 2010)
          })
          
          cd_coverage_plot_server(
            id = id, # or just ind if inside the same module id
            filename = reactive(paste0(current_indicator, "_", region(), "_survey_", denom_rx())),
            data_fn = if (current_indicator == 'fpet') fpet_data else data_rx,
            sheet_name = reactive(i18n$t(paste0("opt_", current_indicator))),
            plot_fun = function(d) {

              if (current_indicator != 'fpet') {
                indicator <- i18n$t(paste0("opt_", current_indicator))
                denominator <- i18n$t(paste0("opt_", denom_rx()))
                region <- region()
                title <- if (admin_level() == "national") "plt_title_coverage_nat_est" else "plt_title_coverage_subnat_est"
                plot(d,
                    title = str_glue(i18n$t(title)),
                    x_axis = i18n$t("title_global_year"),
                    y_axis = str_glue(i18n$t("lbl_axis_y_coverage")),
                    caption = str_glue(i18n$t("plt_caption_coverage_denom")),
                    labels = list(
                      dhis2  = i18n$t("lbl_coverage_dhis2_est"),
                      wuenic = i18n$t("lbl_coverage_wuenic_est"),
                      survey = i18n$t("lbl_coverage_survey_est"),
                      ci     = i18n$t("lbl_coverage_95ci")
                    ))
                } else {
                  # Extract country to append to the translated base title
                  country_name <- attr(d, "country") %||% ""
                  base_title <- i18n$t("title_graph_fpet")
                  
                  plot(
                    d, 
                    title = paste0(base_title, ", ", country_name),
                    x_axis = i18n$t("title_global_year"),
                    y_axis = i18n$t("ylab_fpet"),
                    caption = i18n$t("caption_fpet"),
                    
                    # Translate the legend (adjust the keys based on what they are named in your CSV/tibble)
                    indicator_labels = list(
                      prevalence = i18n$t("lbl_fpet_mcpr"),
                      demand = i18n$t("lbl_fpet_demand")
                    )
                  )
                }
              },
            i18n = i18n
          )
        },
        indicators = cd_cfg("nat_cov_indicators")
      )
    }
  )
}
