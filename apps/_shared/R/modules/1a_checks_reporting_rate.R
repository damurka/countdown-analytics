rr_indicators <- c("heat_map", "bar")

reporting_rate_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_page_ui(id, i18n,
    filters = cd_filter_bar(
      cd_indicator_ui(ns("indicator"), i18n,
        tooltip = "tt_rr_indicator",
        indicators = cd_cfg("reporting_rate_indicators")
      ),
      cd_chip_number(ns("threshold"), "title_rr_threshold", i18n, value = 90, min = 0, max = 100, unit = "%", picks = c(70, 80, 90, 95), default = 90),
      cd_admin_level_ui(ns("admin_level"), i18n),
    ),
    cd_chart_card(
      title = i18n$t("title_rr_subnational"),
      chart_toolbar = uiOutput(ns("subnational_toolbar")),
      i18n = i18n,
      width = 12,
      tabs = uiOutput(ns("subnational_tabs")),
      cd_tab_panes(ns("indicator_tabs"), list(
        heat_map = cd_coverage_plot_ui(ns("heat_map"), toolbar_inline = TRUE),
        bar = cd_coverage_plot_ui(ns("bar"), toolbar_inline = TRUE)
      ))
    ),
    cd_card_row(
      cd_chart_card(
        title = uiOutput(ns("district_rr_title")),
        chart_toolbar = cd_plot_toolbar_ui(ns("rr_national")),
        i18n = i18n,
        cd_plot_ui(ns("rr_national"), toolbar_inline = TRUE)
      ),
      cd_table_ui(ns("low_reporting"), i18n, "title_rr_low_reporting")
    )
  )
}

reporting_rate_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      state <- reactiveValues(loaded = FALSE)
      indicator_val <- cd_indicator_server("indicator")
      admin <- cd_admin_level_server("admin_level", cache, i18n, allow_select_all = TRUE, show_district = FALSE)

      admin_parts <- cd_admin_parts(admin)
      admin_level <- admin_parts$admin_level
      region <- admin_parts$region

      threshold <- reactive({
        req(cache())
        cache()$performance_threshold
      })

      # active(): see coverage_server() in modules/3_national_coverage/coverage.R for why.
      reporting_rate <- reactive({
        req(cache(), active(), admin_level())

        rate <- if (admin_level() == "adminlevel_1" && is.null(region())) {
          cache()$reporting_rate_admin1
        } else if (admin_level() == "district" && is.null(region())) {
          cache()$reporting_rate_district
        } else if (admin_level() == "adminlevel_1" && !is.null(region())) {
          cache()$calculate_reporting_rate(admin_level(), region())
        } else {
          NULL
        }
        return(rate)
      })

      subnational_rr <- reactive({
        req(reporting_rate(), indicator_val())

        reporting_rate() %>%
          select(any_of(c("adminlevel_1", "district", "year", indicator_val())))
      })

      district_rr <- reactive({
        req(cache(), active())
        if (is.null(region())) {
          return(cache()$district_reporting_rate)
        }
        cache()$calculate_district_reporting_rate(region())
      })

      # Now we define the data. It safely uses `selected_year()` because 
      # the reactive won't fire until the user actually makes a selection!
      district_low_rr <- reactive({
        req(subnational_rr(), indicator_val())

        subnational_rr() %>%
          filter(!!sym(indicator_val()) < threshold())
      })

      # show the stored threshold once the data is there and the chip exists
      threshold_mounted <- cd_mounted(input, "threshold")
      threshold_shown <- FALSE
      observeEvent(list(data(), threshold_mounted()), {
        req(data(), threshold_mounted())
        if (threshold_shown) return()
        threshold_shown <<- TRUE
        cd_update_input("threshold", session, value = threshold())
      })

      observeEvent(input$threshold, {
        req(cache())
        cache()$set_performance_threshold(as.integer(input$threshold))
      })

      output$district_rr_title <- renderUI({
        if (is.null(region())) {
          i18n$t("title_rr_national")
        } else {
          region_name <- region()
          str_glue(i18n$t("title_rr_region"))
        }
      })
      
      # Page-owned tab strip (cd_tab_strip(), content_dashboard.R) + cd_tab_panes() (_shared/R/core (and components/)) to
      # actually switch the content -- replaces cd_tabbed_charts_ui()/cd_tabbed_charts_server()'s own tabBox() for this page
      # only (see reporting_rate_ui()'s own comment above for why). current_tab is purely this strip's own
      # "which one is underlined" state; cd_update_tab_panes() is what actually shows/hides each pane (and,
      # via Shiny's normal suspend-when-hidden behaviour, what actually stops the OTHER tab's plot from
      # rendering while it's hidden).
      current_tab <- reactiveVal("heat_map")

      output$subnational_tabs <- renderUI({
        cd_tab_strip(ns, tabs = c(heat_map = i18n$t("opt_heat_map"), bar = i18n$t("opt_bar")), active = current_tab())
      })

      # The tabbed card's own toolbar switches with the tab -- only the currently-visible chart's own tool row
      # (edit labels/view/download) makes sense to show; cd_coverage_plot_toolbar_ui() (ui/download/
      # download_coverage.R) resolves to the exact same ids cd_coverage_plot_ui(..., toolbar_inline = TRUE)
      # already mounted for that tab, wherever this renders it. Raw content only, NOT wrapped in
      # cd_chart_toolbar() here too -- reporting_rate_ui()'s own cd_chart_card() call already does that once,
      # around this whole uiOutput(); wrapping it a second time here would double up the Ask AI button/divider/
      # expand toggle.
      output$subnational_toolbar <- renderUI({
        cd_coverage_plot_toolbar_ui(ns(current_tab()))
      })

      rr_tab_click <- function(key) {
        observeEvent(input[[paste0("tab_", key)]], {
          current_tab(key)
          cd_update_tab_panes(session, "indicator_tabs", selected = key)
        })
      }
      rr_tab_click("heat_map")
      rr_tab_click("bar")

      # Same content each tab always had via cd_tabbed_charts_server()'s own serverInput callback (cd_coverage_plot_ui()'s
      # server half, unchanged) -- just called directly per tab now instead of through that shared helper's loop.
      rr_subnational_chart <- function(current_indicator) {
        cd_coverage_plot_server(
          id = current_indicator,
          filename = reactive(paste0("rr_", current_indicator, "_plot")),
          data_fn = subnational_rr,
          sheet_name = reactive(i18n$t("title_rr_average")),
          plot_fun = function(d) {
            req(indicator_val(), threshold(), admin_level())

            region_name <- region()
            # Deliberately named `admin_level`, shadowing the outer reactive of the same name for the rest of
            # this closure -- str_glue() below resolves its "{admin_level}" placeholder (plt_title_rr_heatmap's
            # own translation template) by looking up that exact name in this calling environment, not by
            # position; a differently-named local here (admin_level_lbl, tried once) leaves that placeholder
            # resolving to the outer reactive FUNCTION instead, which glue can't interpolate into a string at
            # all ("glue cannot interpolate functions into strings") -- confirmed live.
            admin_level <- i18n$t(if (is.null(region_name)) paste0("opt_", admin_level()) else "opt_district")
            indicator <- i18n$t(paste0("opt_", str_remove(indicator_val(), "_rr")))
            plot(d,
                 plot_type = current_indicator,
                 indicator = indicator_val(),
                 threshold = threshold(),
                 title = str_glue(i18n$t(if (is.null(region_name)) "plt_title_rr_heatmap" else "plt_title_rr_heatmap_region")),
                 x_axis = if (current_indicator == "bar") i18n$t("title_global_year") else admin_level,
                 y_axis = if (current_indicator == "bar") i18n$t("title_rr_main") else i18n$t("title_global_year"),
                 legend = str_glue(i18n$t("lbl_leg_rr_heatmap"))
            )
          },
          i18n = i18n
        )
      }
      walk(rr_indicators, rr_subnational_chart)

      cd_plot_server(
        id = "rr_national",
        i18n = i18n,
        plot_data = district_rr,
        plot_filename = reactive("rr_national_plot"),
        plot_fun = function(d) {
          reporting_rate <- threshold()
          plot(
            district_rr(),
            title = str_glue(i18n$t("plt_title_rr_national")),
            caption = str_glue(i18n$t("plt_caption_rr_national")),
            indicator_labels = c(
              anc = i18n$t("opt_anc"),
              idelv = i18n$t("opt_idelv"),
              vacc = i18n$t("opt_vacc")
            ),
            # 2x2, not the default 3-then-1 -- explicit user request, "convert the national reporting rate to
            # 2x2" (plot.cd_district_reporting_rate()'s own new `facet_ncol` param, cd2030.core -- default 3,
            # unchanged for every OTHER caller of that shared plot method).
            facet_ncol = cd_cfg("reporting_rate_facet_ncol", 3)
          )
        },
        excel_write_fun = function(wb, d) {
          cd_add_sheet(wb, str_glue(i18n$t("lbl_sheet_rr_district")), d, title = str_glue(i18n$t("tab_rr_district")))
        }
      )
      
      cd_table_server(
        "low_reporting",
        cache,
        i18n,
        control_type = "year",
        data = district_low_rr,
        columns = c(
          set_names(
            list(
              colDef(
                name = i18n$t(
                  paste0("opt_", str_remove(indicator_val(), "_rr"))
                ),
                align = "right",
                cell = cd_rate_status_cell
              )
            ),
            indicator_val()
          )
        ),
        filename = reactive("district_low_reporting_rate"),
        excel_write_fun = function(wb, data) {
          cd_add_sheet(wb, i18n$t("title_rr_district_low"), data, title = str_glue(i18n$t("tab_rr_district_year")))
        }
      )

    }
  )
}
