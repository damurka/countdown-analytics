subnational_denominator_ui <- function(id, i18n) {
  ns <- NS(id)
  cd_tabbed_charts_ui(
    ns("panel"), 
    i18n, 
    'title_subnational_derived', 
    uiInput = cd_coverage_plot_ui, 
    indicators = cd_cfg("sub_derived_indicators"),
        showCustom = FALSE
  )
}

subnational_denominator_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {

      cd_tabbed_charts_server(
        "panel",
        serverInput = function(id, current_indicator) {
          # active(): see coverage_server() in modules/3_national_coverage/coverage.R for why.
          derived_data <- reactive({
            req(cache(), active())
            cache()$calculate_derived_coverage(current_indicator, 'adminlevel_1')
          })

          current_plot_year <- reactive({
            req(cache())
            cache()$survey_year
          })

          cd_coverage_plot_server(
            id = id, # or just ind if inside the same module id
            filename = reactive(paste0(current_indicator, "_adminlevel_1_derived_coverage")),
            data_fn = derived_data,
            sheet_name = reactive(i18n$t(paste0("opt_", current_indicator))),
            plot_fun = function(d) {
              plot(
                d,
                title = str_glue(i18n$t("plt_title_cross_section_subnat"), indicator = i18n$t(paste0('opt_', current_indicator)), year = current_plot_year()),
                x_label = str_glue(i18n$t("opt_coverage")),
                y_label = i18n$t("lbl_axis_y_region"),
                legend_labels = cd_only_denominators(list(
                  "un"            = i18n$t("opt_un"),
                  "dhis2"         = i18n$t("opt_dhis2"),
                  "anc1"          = i18n$t("opt_anc1"),
                  "penta1"        = i18n$t("opt_penta1"),
                  "penta1derived" = i18n$t("opt_penta1derived"),
                  "anc1derived"   = i18n$t("opt_anc1derived")
                ))
              )
            },
            i18n = i18n
          )
        },
        indicators = cd_cfg("sub_derived_indicators"),
        showCustom = FALSE
      )

    }
  )
}
