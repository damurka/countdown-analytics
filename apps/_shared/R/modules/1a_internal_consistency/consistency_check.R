# Consistency Checks card: one tab per indicator pair the app configures (cd_cfg("consistency_pairs"), e.g. ANC1 vs Penta1),
# plus a Custom tab where any two indicators can be compared. cd2030.core's plot_comparison() draws them all.

# The tabs: "<x>_<y>" per pair, then "custom".
consistency_pair_keys <- function() {
  pairs <- cd_cfg("consistency_pairs", list(c("anc1", "penta1"), c("penta1", "penta3")))
  vapply(pairs, function(p) paste(p, collapse = "_"), character(1))
}

# A pair's tab label: its translation ("opt_consist_<x>_<y>") when it has one, else "X and Y".
consistency_pair_label <- function(i18n, pair) {
  key <- paste0("opt_consist_", paste(pair, collapse = "_"))
  if (key %in% rownames(i18n$get_translations())) i18n$t(key) else paste(toupper(pair), collapse = " and ")
}

consistency_check_ui <- function(id, i18n) {
  ns <- NS(id)
  pairs <- cd_cfg("consistency_pairs", list(c("anc1", "penta1"), c("penta1", "penta3")))
  keys <- consistency_pair_keys()

  panes <- c(
    stats::setNames(lapply(keys, function(k) cd_plot_ui(ns(k), toolbar_inline = TRUE)), keys),
    list(custom = div(
      class = "cd-stack",
      div(
        class = "cd-row",
        cd_indicator_ui(ns("x_label"), i18n, label = "lbl_axis_x_consist"),
        cd_indicator_ui(ns("y_label"), i18n, label = "lbl_axis_y_consist")
      ),
      cd_plot_ui(ns("custom_graph"), toolbar_inline = TRUE)
    ))
  )

  cd_chart_card(
    title = i18n$t("title_consist_checks"),
    chart_toolbar = uiOutput(ns("consist_toolbar")),
    i18n = i18n,
    width = 12,
    tabs = uiOutput(ns("consist_tabs")),
    cd_tab_panes(ns("indicator_tabs"), panes, active = keys[[1]])
  )
}

consistency_check_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns
      calculate_ratios_server(id, cache, i18n, active = active)

      pairs <- cd_cfg("consistency_pairs", list(c("anc1", "penta1"), c("penta1", "penta3")))
      keys <- consistency_pair_keys()

      # Page-owned tab strip + cd_tab_panes() -- same pattern as outlier_detection_server() and reporting_rate_server();
      # hand-rolled here (not cd_tabbed_charts_*()) because the "custom" tab has TWO cd_indicator_ui()s.
      consist_current_tab <- reactiveVal(keys[[1]])

      output$consist_tabs <- renderUI({
        labels <- c(
          vapply(pairs, function(p) consistency_pair_label(i18n, p), character(1)),
          i18n$t("opt_consist_custom")
        )
        cd_tab_strip(ns, tabs = stats::setNames(labels, c(keys, "custom")), active = consist_current_tab())
      })

      output$consist_toolbar <- renderUI({
        tab <- consist_current_tab()
        cd_plot_toolbar_ui(ns(if (identical(tab, "custom")) "custom_graph" else tab))
      })

      lapply(c(keys, "custom"), function(key) {
        observeEvent(input[[paste0("tab_", key)]], {
          consist_current_tab(key)
          cd_update_tab_panes(session, "indicator_tabs", selected = key)
        }, ignoreInit = TRUE)
      })

      x_label <- cd_indicator_server("x_label")
      y_label <- cd_indicator_server("y_label")
      legend <- reactive({
        c(
          district = i18n$t("lbl_leg_consist_district"),
          linear_fit = i18n$t("lbl_leg_consist_linear_fit"),
          diagonale = i18n$t("lbl_leg_consist_diagonal")
        )
      })

      # active(): see coverage_server() in modules/3_national_coverage/coverage.R for why.
      data <- reactive({
        req(cache(), active())
        cache()$countdown_data
      })

      lapply(seq_along(pairs), function(i) {
        local({
          x <- pairs[[i]][[1]]
          y <- pairs[[i]][[2]]
          cd_plot_server(
            id = keys[[i]],
            i18n = i18n,
            plot_data = data,
            plot_filename = reactive(paste0(keys[[i]], "_plot")),
            plot_fun = function(d) {
              # the title template names {vacc1} and {vacc2}
              vacc1 <- i18n$t(paste0("opt_", x))
              vacc2 <- i18n$t(paste0("opt_", y))
              plot_comparison(
                d, x, y,
                title = str_glue(i18n$t("plt_title_consist_checks")),
                x_label = vacc1,
                y_label = vacc2,
                legend = legend()
              )
            },
            excel_sheet = "ratio_plot"
          )
        })
      })

      cd_plot_server(
        id = "custom_graph",
        i18n = i18n,
        plot_data = data,
        plot_filename = reactive(paste0(x_label(), "_", y_label(), "_plot")),
        plot_fun = function(d) {
          req(x_label(), y_label())
          vacc1 <- i18n$t(paste0("opt_", x_label()))
          vacc2 <- i18n$t(paste0("opt_", y_label()))
          plot_comparison(
            d,
            x_label(),
            y_label(),
            title = str_glue(i18n$t("plt_title_consist_checks")),
            x_label = vacc1,
            y_label = vacc2,
            legend = legend()
          )
        },
        excel_sheet = "ratio_plot"
      )
    }
  )
}
