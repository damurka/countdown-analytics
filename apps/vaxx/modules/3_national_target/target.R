target_indicators <- c("vaccine", "dropout")

targetUI <- function(id, i18n) {
  ns <- NS(id)
  tagList(
    tabPanelsUI(ns("panel"), i18n, "title_nav_global_coverage", downloadCoverageUI, 
                indicators = target_indicators, showCustom = FALSE),
    tableDownloadsUI(ns("district_low_reporting"), i18n, "title_target_admin2_rate", control_type = "indicator")
  )
}

targetServer <- function(id, cache, i18n, admin_level, region = reactive(NULL)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(admin_level))
  stopifnot(is.reactive(region))
  
  moduleServer(
    id = id,
    module = function(input, output, session) {
      
      selected_indicator <- tableDownloadsServer(
        "district_low_reporting",
        cache,
        i18n,
        control_type = "indicator",
        data = reactive(district_coverage_rate()),
        filename = reactive("district_high_coverage_rate"),
        excel_write_fun = function(wb, d) {
          sheet_name_1 <- i18n$t("title_target_district_rate")
          addWorksheet(wb, sheet_name_1)
          writeData(wb, sheet = sheet_name_1, x = i18n$t("title_target_district_rate"), startCol = 1, startRow = 1)
          writeData(wb, sheet = sheet_name_1, x = data, startCol = 1, startRow = 3)
        }
      )

      district_coverage_rate <- reactive({
        req(cache(), cache()$check_inequality_params, selected_indicator())
        
        cache()$get_high_performers(
          indicator = selected_indicator(),
          admin_level = admin_level(),
          region = region()
        )
      })
      
      tabPanelsServer(
        "panel",
        serverInput = function(id, current_indicator) {
          denominator <- reactive({
            req(cache())
            cache()$get_denominator(current_indicator)
          })
          
          data_rx <- reactive({
            req(cache(), cache()$check_inequality_params)
            
            cache()$get_filtered_threshold(
              indicator = current_indicator, 
              admin_level = admin_level(), 
              region = region()
            )
          })
          
          downloadCoverageServer(
            id = id, # or just ind if inside the same module id
            filename = reactive(paste0(current_indicator, "_global_target_", denominator())),
            data_fn = data_rx,
            sheet_name = reactive(i18n$t(paste0("opt_", current_indicator))),
            plot_fun = function(d) {
              
              title_key <- if (is.null(region())) "plt_title_target_national" else "plt_title_target_region"
              translated_x_labels <- list(
                bcg = i18n$t("opt_bcg"),
                penta3 = i18n$t("opt_penta3"),
                measles1 = i18n$t("opt_measles1"),
                dropout_penta13 = i18n$t("opt_dropout_penta13"),
                dropout_penta3mcv1 = i18n$t("opt_dropout_penta3mcv1")
              )
              
              admin_level <- i18n$t(paste0("opt_", admin_level()))
              rate <- i18n$t(if (current_indicator == 'opt_dropout') 'opt_rate' else 'opt_coverage')
              sign <- if (current_indicator == 'opt_dropout') '<' else '≥'
              group <- i18n$t(paste0("opt_", current_indicator))
              coverage <- attr(d, "threshold")
              region <- region()
              plot(d,
                   title = str_glue(i18n$t(title_key)),
                   y_axis = i18n$t("lbl_axis_y_pct_subnat"),
                   legend_title = i18n$t("title_global_year"),
                   x_labels = translated_x_labels
              )
            },
            i18n = i18n
          )
        },
        indicators = target_indicators
      )
    }
  )
}
