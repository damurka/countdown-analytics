# The whole shell of a Countdown app -- page, sidebar and header, server -- so an app's own app.R only says what is particular
# to it: its libraries and modules, its config (cd_cfg()), its page registry (pages.R) and its nav sections.
#
#   cd_app(app_name, app_version, theme = "vaccine", nav_sections = cd_nav_sections, registry = cd_page_registry,
#          i18n = i18n, language = language, selected_file = selected_file)
#
# It expects the app to have defined introduction_ui()/_server() and upload_data_ui()/_server() (the Load Data wizard).
# `theme`: NULL/"rmncah" (maroon), "vaccine" (blue) or "pooled" (green) -- see the App themes block of cd-ui.css.
cd_app <- function(app_name, app_version, theme, nav_sections, registry, i18n, language, selected_file) {
  ui <- cd_app_ui(
    theme = theme,
    title = app_name,
    header = cd_app_bar(app_name, app_version),
    sidebar = cd_sidebar(),
    body = cd_app_body(
      usei18n(i18n),
      cd_head_assets(),
      cd_screens(
        cd_screen(tabName = "introduction", introduction_ui("introduction", i18n = i18n)),
        cd_screen(tabName = "upload_data", upload_data_ui("upload_data", i18n = i18n, is_electron = !is.na(selected_file))),
        cd_pages_ui(registry, i18n)
      )
    )
  )

  server <- function(input, output, session) {
    # React components render their own text, in all languages (see _shared/R/core (and components/)), so a language change is
    # one message to the browser rather than an update to each component.
    #
    # active_language tracks the language actually being displayed right now, independent of any particular
    # cache -- it's what a FRESH cache (a brand-new upload, as opposed to a resumed .rds) should adopt below,
    # instead of silently overriding whatever the user has selected.
    active_language <- reactiveVal(language)
    show_language <- function(lang) {
      update_lang(lang)
      cd_set_language(session, lang)
      active_language(lang)
    }

    introduction_server("introduction", selected_language = reactive(input$selected_language))
    # active: threaded into wizard_steps_server() (via upload_data_server()) so it can tell "the user just navigated
    # back to Load Data" apart from "the user is still sitting on Load Data" -- see its own comment there.
    upload_data_dt <- upload_data_server("upload_data", i18n, selected_file, active = reactive(identical(input$tabs, "upload_data")))
    cache <- upload_data_dt$cache
  # Charts keep what the user changed about their look in the dataset (cd_plot_server() reads this).
  session$userData$cd_cache <- cache
    uploadDataRequiresWalkthrough <- upload_data_dt$requires_walkthrough

    # The one shared "has a dataset actually finished loading" condition -- countdown_data, not quality_confirmed
    # (the wizard's own "Finish completed" flag): a plain .dta/.rds upload already has real countdown_data the
    # moment it loads (load_cache_data() sets it directly, no deferred merge involved) but never runs the
    # wizard's own Finish branch that sets quality_confirmed (wizard_panels.R only does that when
    # cd$wizard_parts was ever set to begin with) -- gating on quality_confirmed instead would have locked every
    # .dta/.rds upload out of the rest of the app forever, a regression for a path that was never broken;
    # confirmed live. Every consumer below (page_is(), Phase 9's sidebar lock via cd_shell_server(), the header's
    # Download Report button) reads this SAME reactive rather than each re-deriving its own version of it, so
    # they can never drift out of sync with each other.
    data_ready <- reactive(isTruthy(cache()) && isTruthy(cache()$countdown_data))

    # Stricter than data_ready() -- explicit user request, "if data is not adjusted it cannot generate analysis,
    # so continue to have grayed out signs and symbols on the sidemenu from denominator down till adjustment is
    # done". Gates the Denominators/Analysis sections specifically (nav_sections below, each marked
    # `requires_adjustment = TRUE`); Data Quality/Remove Years/Data Adjustment itself stay gated on plain
    # data_ready() alone (cd_shell_server()'s own default), since the user has to be able to reach the page that
    # performs the adjustment in the first place. adjusted_flag, not e.g. a non-NULL adjusted_data -- the
    # CacheConnection field 1c_data_adjustment.R's own "Data adjusted"/"Dataset not adjusted" status message
    # already reads, so this can never disagree with what that page itself is telling the user.
    analysis_ready <- reactive(isTRUE(data_ready()) && isTRUE(cache()$adjusted_flag))

    # cd_shell_server() (Phase 9: sidebar locking) needs `cache`/`data_ready`/`analysis_ready` to already exist --
    # called here, not at the very top of server() like before, now that they do.
    cd_shell_server(output, nav_sections, initial_tab = "upload_data", data_ready = data_ready, analysis_ready = analysis_ready, i18n = i18n)

    # Locked-item click in the sidebar (Sidebar.tsx's own handleNavClick(), via nav.ts's notifyLockedNavClick())
    # -- a real Shiny event instead of a silently swallowed client-side no-op, so the user gets the same kind of
    # explanation the wizard rail's own locked-step click already gives (err_wizard_step_locked's sibling here,
    # err_nav_locked). {priority: "event"} on the JS side means this fires every time, even repeat clicks on the
    # same locked item.
    observeEvent(input$cd_locked_nav_click, {
      showNotification(i18n$t("err_nav_locked"), type = "warning")
    })

    # Server-side snap-back for a locked page reached some OTHER way than a normal sidebar click -- stale client
    # state (a tab left active from before data was cleared), or direct manipulation -- the server never trusts
    # the client alone for something that gates real computation (same reasoning wizard_panels.R's own
    # attempt_move() applies to a locked step). ignoreInit = TRUE: the very first value input$tabs ever takes is
    # the initial tab set server-side (cd_dashboard.R's own cd_screens(selected = ...) equivalent), never a client
    # navigation action, so there's nothing to snap back from on session start.
    observeEvent(input$tabs, {
      req(input$tabs)
      if (!identical(input$tabs, "introduction") && !identical(input$tabs, "upload_data") && !isTRUE(data_ready())) {
        cd_navigate_to(session, "upload_data")
      }
    }, ignoreInit = TRUE)

    # Every page server is created at startup, so its observers run whether or not the page is open.
    # Work that only matters for one page should wait for it: pass `active = page_is("<tab name>")`
    # (the tab names are the `tabName`s in the sidebar) and start that work with req(active()).
    # data_ready() too, not just the tab match -- every other page module's own real computation is gated on
    # active = page_is('<tabName>') (see each module's own req(cache(), active())). Without it, every other page
    # happily computed against a cache with no real data yet and crashed several layers down inside
    # cd2030.core's own check_cd_data() ("The data object must be of class 'cd_data'") -- confirmed live. Phase
    # 9's sidebar lock (cd_shell_server(), above) now also stops the sidebar itself from being clicked into
    # mid-wizard in the first place, but this stays as the authoritative backstop regardless of how a locked tab
    # might still be reached (the snap-back observer above is the other half of that same backstop).
    # Latched: TRUE from the first time the page is opened with data loaded, and it STAYS TRUE when the user goes
    # elsewhere. It used to follow the open tab exactly, so leaving a page flipped it to FALSE, every output
    # gated on it went "not ready" and cleared, and coming back recomputed everything from scratch. Now a
    # visited page keeps what it computed (Shiny itself does not re-run an output that is hidden, and only
    # recomputes it when its inputs changed) -- so returning is instant. A new dataset (cache() replaced) starts
    # every page over.
    page_is <- function(tab) {
      force(tab)
      visited <- reactiveVal(FALSE)
      observe({
        if (identical(input$tabs, tab) && isTRUE(data_ready())) visited(TRUE)
      })
      observeEvent(cache(), visited(FALSE), ignoreInit = TRUE)
      reactive(visited() && isTRUE(data_ready()))
    }

    # Split into two observers -- they used to be one, watching c(cache(), cache()$language) together, which
    # conflated two different events: cache() itself being REASSIGNED (a fresh upload, or an .rds resume) vs.
    # the language FIELD on an already-set cache changing (the user picking a new one, below). Confirmed live:
    # every fresh Excel/Stata upload creates a brand-new CacheConnection whose own `language` field is just the
    # class's own default ("en"), never the language the user actually had selected going in -- with both
    # events sharing one observer, that default silently clobbered the display via show_language(cache()$language)
    # the instant a file finished uploading, discarding an active French/Portuguese selection with no way to
    # tell it had happened. A resumed .rds is the opposite case: its own persisted `language` IS the right thing
    # to show (matches "the wizard remembers what you had it on"), so only that branch keeps the old behavior.
    observeEvent(cache(), {
      req(cache())
      if (isTRUE(isolate(uploadDataRequiresWalkthrough()))) {
        if (!identical(cache()$language, isolate(active_language()))) cache()$set_language(isolate(active_language()))
      } else {
        show_language(cache()$language)
      }
    })

    observeEvent(cache()$language, {
      req(cache())
      show_language(cache()$language)
    }, ignoreInit = TRUE)

    observeEvent(input$selected_language, {
      if (!isTruthy(cache())) {
        show_language(input$selected_language)
      } else {
        cache()$set_language(input$selected_language)
      }
      session$sendCustomMessage("reinit-tooltips", TRUE)
    })

    # active = page_is('<tabName>') everywhere below: without it, every one of these module servers -- all
    # created here at startup, whether or not their page is ever opened -- computes its charts' data once on
    # the session's first flush, before Shiny has heard back from the browser about which tab is even selected.
    # bayesian_server had the most severe case (a full Stan fit per indicator, unconditionally, on every
    # session), but the same eager-on-load pattern was present anywhere a page reads cache() to build a chart.
    # data_adjustment and remove_years are left ungated on purpose: data_adjustment's own startup observer
    # re-applies a pending adjustment (cache()$adjust_data()) that other pages' cache()$adjusted_data reads
    # depend on, regardless of whether anyone opens that page, so it needs to run eagerly.
    cd_pages_server(registry, cache, i18n, page_is)
    observeEvent(input$open_reports, cd_request_report(session))

    # session$onSessionEnded(stopApp)

    # Debounced: cache()$country (an R6 field with its own reactive tracking, see cd2030.core) can be set more
    # than once while the cache is first built. Re-rendering on every one of those ticks sends the client
    # "recalculating" faster than it can finish the previous cycle, which Shiny treats as a protocol error and
    # can stop the client from processing any further message for the rest of the session (this is the same
    # race the download button's enabled state hit -- see _shared/R/charts/download-button.R).
    header_country <- shiny::debounce(reactive({ req(cache()); cache()$country }), millis = 300)

    output$header_pill <- renderUI({
      req(header_country())
      tags$span(
        class = "cd-dataset-pill",
        tags$span(class = "cd-dataset-pill__dot"),
        tags$span(class = "cd-dataset-pill__country", header_country()),
        if (!is.na(selected_file)) tags$span(class = "cd-dataset-pill__file", basename(selected_file))
      )
    })

    # The header's report button opens the Reports page (the report builder). req(data_ready()), not just
    # req(cache()): cache() goes truthy the moment a fresh upload starts, well before the wizard's Finish.
    output$download_buttons <- renderUI({
      req(data_ready(), cd_has_reports())
      # .cd-button__label is what the narrow-header CSS hides to go icon-only
      cd_button("open_reports", "btn_report_download", i18n, icon = "file-lines", variant = "bare", class = "cd-header-download")
    })
  }

  shiny::shinyApp(ui = ui, server = server)
}
