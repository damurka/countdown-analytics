survey_comparison_ui <- function(id, i18n) {
  ns <- NS(id)
  # uiInput is a uiOutput() slot, not cd_coverage_plot_ui() directly -- explicit user request
  # (project/DenominatorSelection.dc.html's own mockup, "National coverage" card, "No coverage to show yet"):
  # the server decides per indicator, each time coverage() changes, whether to fill this slot with the real
  # chart (cd_coverage_plot_ui()) or cd_empty_state() instead -- see survey_comparison_server()'s own comment.
  cd_tabbed_charts_ui(ns("panel"),
              i18n,
              "title_coverage_national",
              uiInput = function(pid, toolbar_inline = FALSE) uiOutput(NS(pid)("slot")),
              indicators = cd_cfg("survey_comp_indicators"),
              showCustom = FALSE
  )
}

survey_comparison_server <- function(id, cache, admin_level, region, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(admin_level))
  stopifnot(is.reactive(region))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      cd_tabbed_charts_server(
        "panel",
        serverInput = function(id, current_indicator) {
          # cd_tabbed_charts_server() calls this from INSIDE its own moduleServer(id = "panel", ...) -- but serverInput
          # itself is DEFINED here, in survey_comparison.R, so a plain `session`/`output`/`input` reference in
          # its body would resolve by ordinary R lexical scoping to THIS file's own outer moduleServer (missing
          # the "panel-" namespace segment entirely), not the "panel"-scoped one cd_tabbed_charts_ui()'s own ns()
          # actually used to build the uiOutput() id below. getDefaultReactiveDomain(), by contrast, resolves
          # dynamically to whichever moduleServer is actually executing right now -- correctly "panel" here,
          # since this call happens synchronously inside its module function body (cd_tabbed_charts_server()'s own
          # walk(indicators, ...) loop). Captured once and reused, rather than re-resolved at every use, so
          # every reference below is guaranteed to agree with each other even if that ever changed.
          panel_session <- shiny::getDefaultReactiveDomain()

          # active(): see coverage_server() in modules/3_national_coverage/coverage.R for why.
          coverage <- reactive({
            req(cache(), active(), cache()$check_inequality_params, admin_level())
            cache()$calculate_derived_coverage(current_indicator, admin_level(), region())
          })

          # Genuinely missing survey coverage for THIS indicator -- checked on the computed data's own
          # survey column (r_<indicator>, cache()$calculate_derived_coverage()'s own naming, cd2030.core), not
          # e.g. cache()$is_default("national_survey"): this is correct regardless of WHY it's missing (no
          # survey ever uploaded, a resumed dataset that predates this wizard, a country the built-in
          # reference has no survey for), and matches this card's own empty-state message exactly ("Survey
          # coverage estimates are missing..."). tryCatch(), not a bare coverage() call -- confirmed live a
          # real bug: coverage()'s own req() (cache()/active()/admin_level() not all ready yet, e.g. on
          # first render before the filter chips above have resolved) is a "silent" condition that
          # propagates straight through this reactive into the renderUI() below, leaving the slot's own
          # uiOutput() genuinely empty -- no skeleton, no message, nothing -- instead of the normal
          # loading/spinner state cd_coverage_plot_ui() already provides on its own. Treated as "not
          # (confirmed) missing" here so the slot falls back to the real chart markup, which handles its own
          # not-ready-yet state; only a coverage() call that ACTUALLY RETURNS ends up checked for emptiness.
          survey_missing <- reactive({
            d <- tryCatch(coverage(), error = function(e) NULL)
            if (is.null(d)) return(FALSE)
            col <- paste0("r_", current_indicator)
            !(col %in% names(d)) || nrow(d) == 0 || all(is.na(d[[col]]))
          })

          # The tab's own content slot (survey_comparison_ui()'s own uiOutput()) -- swaps between the real chart
          # and cd_empty_state() as survey_missing() changes, e.g. once a survey file is uploaded without
          # leaving this page. cd_coverage_plot_server() below still runs unconditionally either way (its own
          # output$plot etc. simply has nowhere to render into while the empty state is showing instead,
          # same as any other Shiny output whose target isn't currently in the DOM).
          panel_session$output[[paste0(current_indicator, "-slot")]] <- renderUI({
            if (isTRUE(survey_missing())) {
              cd_empty_state(
                id = panel_session$ns(paste0(current_indicator, "_goto_load_data")),
                title = "title_denom_coverage_empty",
                message = "msg_denom_coverage_empty",
                i18n = i18n,
                action_label = "btn_denom_goto_load_data"
              )
            } else {
              cd_coverage_plot_ui(panel_session$ns(current_indicator), toolbar_inline = TRUE)
            }
          })

          # cd_empty_state()'s own action button (EmptyState.tsx) fires "<id>_action" as a one-shot event --
          # matching every other ${id}_action/${id}_cleared convention in this app (FieldNumber.tsx,
          # FileUploadZone.tsx). "upload_data": cd_dashboard.R's own tabName for Load Data (app.R's cd_screens()).
          observeEvent(panel_session$input[[paste0(current_indicator, "_goto_load_data_action")]], {
            cd_navigate_to(panel_session, "upload_data")
          })

          cd_coverage_plot_server(
            id = current_indicator,
            filename = reactive(paste0(current_indicator, "_plot")),
            data_fn = coverage,
            sheet_name = reactive(i18n$t(paste0("opt_", current_indicator))),
            plot_fun = function(d) {
              indicator <- i18n$t(paste0("opt_", current_indicator))
              year <- cache()$survey_year
              plot(d,
                   title = str_glue(i18n$t("plt_title_denom_survey_comp")),
                   y_label = str_glue(i18n$t("lbl_axis_y_coverage")),
                   category_labels = cd_only_denominators(list(
                     un            = i18n$t("lbl_denom_un_proj"),
                     dhis2         = i18n$t("lbl_denom_dhis2_proj"),
                     anc1          = i18n$t("lbl_denom_anc1_derived"),
                     penta1        = i18n$t("lbl_denom_penta1_derived"),
                     penta1derived = i18n$t("opt_penta1derived"),
                     anc1derived = i18n$t("opt_anc1derived")
                   )),
                   legend_labels = list(
                     facility = i18n$t("lbl_denom_facility_based"),
                     survey = i18n$t("lbl_denom_survey_national")
                   ))
            },
            i18n = i18n
          )
        },
        indicators = cd_cfg("survey_comp_indicators"),
        showCustom = FALSE
      )
    }
  )
}
