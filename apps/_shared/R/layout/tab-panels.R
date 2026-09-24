# The rmncah set. An app can set options(cd2030.default_indicators = ) to either a vector of indicators or a function
# returning one (vaxx sets cd2030.core's get_analysis_indicators, so its tabs follow the indicator group).
cd_default_indicators <- c('anc4', "instlivebirths", "low_bweight", 'penta3', "measles1")

cd_default_indicator_set <- function() {
  d <- getOption("cd2030.default_indicators", cd_default_indicators)
  if (is.function(d)) d() else d
}

# showCustom (default TRUE): the extra "Custom" tab -- pick any analysis indicator and get the same chart for it.
# A page that turns it off passes showCustom = FALSE to BOTH the _ui and the _server call.
cd_tabbed_charts_ui <- function(id, i18n, title_key, uiInput,
                        indicators = NULL,
                        customIndicators = get_analysis_indicators(),
                        showCustom = TRUE, width = 12) {
  ns <- NS(id)

  indicators <- indicators %||% cd_default_indicator_set()

  # toolbar_inline = TRUE: this card's header (cd_chart_card(), below) carries the tool row instead -- the
  # opt-in mechanism cd_plot_toolbar_ui()'s own comment (_shared/R/charts/plot-downloads.R) documents; every
  # OTHER caller of cd_coverage_plot_ui() outside a cd_tabbed_charts_ui() keeps the old overlay-on-chart default.
  panels <- set_names(map(indicators, ~ uiInput(ns(.x), toolbar_inline = TRUE)), indicators)

  if (isTRUE(showCustom)) {
    panels[["custom"]] <- div(
      class = "cd-stack",
      cd_indicator_ui(ns("indicator"), i18n, indicators = customIndicators),
      uiInput(ns("custom"), toolbar_inline = TRUE)
    )
  }

  cd_chart_card(
    title = i18n$t(title_key),
    chart_toolbar = uiOutput(ns("panel_toolbar")),
    i18n = i18n,
    width = width,
    tabs = uiOutput(ns("panel_tabs")),
    cd_tab_panes(ns("indicator_tabs"), panels)
  )
}

cd_tabbed_charts_server <- function(id,
                            serverInput,
                            indicators = NULL,
                            customIndicators = get_analysis_indicators(),
                            showCustom = TRUE,
                            selected_tab = reactive(NULL),
                            i18n = cd_i18n()) {
  stopifnot(is.function(serverInput))
  stopifnot(is.reactive(selected_tab))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns
      indicators <- indicators %||% cd_default_indicator_set()
      tab_keys <- c(indicators, if (isTRUE(showCustom)) "custom" else NULL)

      walk(indicators, ~ {
        local({
          id <- .x
          serverInput(id, .x)
        })
      })

      selected <- cd_indicator_server("indicator")

      observeEvent(selected(),
        {
          req(selected())
          serverInput("custom", selected())
        })

      # Page-owned tab strip (cd_tab_strip(), content_dashboard.R) + cd_tab_panes() (cd_tabbed_charts_ui(), above,
      # _shared/R/core (and components/)) that actually switches the content -- current_tab is purely this strip's own
      # "which one is underlined" state; cd_update_tab_panes() is what shows/hides each pane (and, via Shiny's
      # normal suspend-when-hidden behaviour, what actually stops every OTHER tab's chart from rendering while
      # it's hidden). Mirrors 1a_checks_reporting_rate.R's own reporting_rate_server() exactly, generalized from 2
      # hardcoded tabs to however many tab_keys this particular caller has.
      current_tab <- reactiveVal(tab_keys[[1]])

      tab_label <- function(key) {
        if (identical(key, "custom")) i18n$t("opt_consist_custom") else i18n$t(paste0("opt_", key))
      }

      output$panel_tabs <- renderUI({
        cd_tab_strip(ns, tabs = set_names(map_chr(tab_keys, tab_label), tab_keys), active = current_tab())
      })

      # cd_coverage_plot_toolbar_ui() resolves to the exact same ids cd_coverage_plot_ui(..., toolbar_inline =
      # TRUE) already mounted for that tab (cd_tabbed_charts_ui(), above), wherever this renders it. Raw content only,
      # NOT wrapped in cd_chart_toolbar() here too -- cd_tabbed_charts_ui()'s own cd_chart_card() call already does
      # that once, around this whole uiOutput(); wrapping it a second time would double the Ask AI button/
      # divider/expand toggle.
      output$panel_toolbar <- renderUI({
        cd_coverage_plot_toolbar_ui(ns(current_tab()))
      })

      lapply(tab_keys, function(key) {
        observeEvent(input[[paste0("tab_", key)]], {
          current_tab(key)
          cd_update_tab_panes(session, "indicator_tabs", selected = key)
        }, ignoreInit = TRUE)
      })

      observeEvent(selected_tab(),
        {
          req(selected_tab())
          current_tab(selected_tab())
          cd_update_tab_panes(session, "indicator_tabs", selected = selected_tab()) # value we set above
        },
        ignoreInit = TRUE
      )

      return(reactive(current_tab()))
    }
  )
}

cd_tab_panes <- function(id, panels, active = names(panels)[[1]]) {
  keys <- names(panels)
  div(
    id = id, class = "cd-tabpanels",
    lapply(seq_along(panels), function(i) {
      div(
        class = paste("cd-tabpane", if (identical(keys[[i]], active)) "cd-tabpane--active" else NULL),
        `data-tab-key` = keys[[i]],
        panels[[i]]
      )
    })
  )
}

cd_update_tab_panes <- function(session, id, selected) {
  session$sendCustomMessage("cd-tab-switch", list(containerId = session$ns(id), activeKey = selected))
}
