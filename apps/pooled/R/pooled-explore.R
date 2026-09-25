# The Explore pooled data pages. Each kind of dataset (Parameters, Coverage, ...) is one page made by the same module;
# Extract a piece is its own. All read the pooled file the app has open (`pooled`, a reactive returning it or NULL).
#
# `shared`: list(tab = reactive of the visible page, countries = reactiveVal, years = reactiveVal). The Countries and
# Years chips of every page read and write the same two values, so they behave as one filter across the pages.

# Every year that appears in any of the tables.
pooled_all_years <- function(datasets) {
  sort(unique(unlist(lapply(datasets, function(d) if ("year" %in% names(d)) as.integer(d$year) else NULL))))
}

# ---- a dataset page --------------------------------------------------------------------------------------------------

pooled_kind_ui <- function(id, kind_key, i18n) {
  ns <- NS(id)
  kind <- POOLED_KINDS[[kind_key]]
  tagList(
    conditionalPanel(
      "output.loaded", ns = ns,
      cd_filter_bar(
        shiny.react::reactOutput(ns("countries_ui")), shiny.react::reactOutput(ns("years_ui")),
        if (isTRUE(kind$measures)) shiny.react::reactOutput(ns("measure_ui")),
        i18n = i18n
      )
    ),
    pooled_page_header(kind$title, kind$sub, eyebrow = "Explore pooled data"),
    cd_page_content(uiOutput(ns("body")))
  )
}

# A menu with no script: <details>, opening on click. `items` are tags.
pooled_menu <- function(label, ..., icon = "download") {
  tags$details(
    class = "pooled-menu",
    tags$summary(class = "cd-button cd-button--primary", tags$i(class = paste0("fa fa-", icon)), tags$span(label), tags$i(class = "fa fa-chevron-down pooled-menu__chev")),
    div(class = "pooled-menu__panel", ...)
  )
}
pooled_menu_link <- function(id, icon, text, hint = NULL) {
  tags$a(id = id, class = "shiny-download-link pooled-menu__item", href = "", target = "_blank", download = NA,
         tags$i(class = paste0("fa fa-", icon)), tags$span(class = "pooled-menu__text", text), if (!is.null(hint)) tags$span(class = "pooled-menu__hint", hint))
}

pooled_kind_server <- function(id, kind_key, pooled, file_name, just_built, shared, i18n) {
  moduleServer(id, function(input, output, session) {
    ns <- session$ns
    kind <- POOLED_KINDS[[kind_key]]
    is_active <- reactive(identical(shared$tab(), kind$tab))

    loaded <- reactive(!is.null(pooled()))
    output$loaded <- reactive(loaded())
    outputOptions(output, "loaded", suspendWhenHidden = FALSE)

    # which of this kind's tables the file has, and which one is showing
    avail <- reactive(pooled_kind_datasets(kind, pooled()$datasets))
    variant <- reactiveVal(NULL)
    observeEvent(avail(), variant(names(avail())[1]), ignoreNULL = FALSE)
    for (key in names(POOLED_VARIANT_LABELS)) local({
      k <- key
      observeEvent(input[[paste0("tab_", k)]], if (k %in% names(avail())) variant(k))
    })
    dname <- reactive(avail()[[req(variant())]])
    df <- reactive(pooled()$datasets[[dname()]])
    dff <- reactive(pooled_filter(df(), shared$countries(), shared$years()))
    palette <- reactive(pooled_palette(pooled()$countries$country))

    # ---- filter chips: shared across pages, re-drawn from the shared value when this page is shown --------------
    output$countries_ui <- shiny.react::renderReact({
      is_active()
      cd_chip_multi(ns("countries"), "Countries", options = cd_plain_options(pooled()$countries$country),
                    selected = isolate(shared$countries()), i18n = i18n, all_label = "All countries")
    })
    output$years_ui <- shiny.react::renderReact({
      is_active()
      yrs <- sort(unique(unlist(lapply(pooled()$datasets, function(d) if ("year" %in% names(d)) as.integer(d$year) else NULL))))
      cd_chip_multi(ns("years"), "Years", options = cd_plain_options(yrs), selected = isolate(shared$years()), i18n = i18n, all_label = "All years")
    })
    observeEvent(input$countries, if (is_active()) shared$countries(setdiff(as.character(input$countries), "")), ignoreInit = TRUE)
    observeEvent(input$years, if (is_active()) shared$years(setdiff(as.character(input$years), "")), ignoreInit = TRUE)

    measures <- reactive(pooled_measures(df()))
    output$measure_ui <- shiny.react::renderReact({
      m <- measures()
      cd_chip_select(ns("measure"), "Measure", options = cd_plain_options(m), i18n = i18n, key = dname(),
                     selected = pooled_default_measure(df(), kind$prefer) %||% "")
    })
    measure <- reactive({
      m <- measures()
      x <- input$measure
      if (!is.null(x) && x %in% m) x else pooled_default_measure(df(), kind$prefer)
    })

    # ---- the page ------------------------------------------------------------------------------------------------------------
    output$body <- renderUI({
      if (!loaded()) {
        return(div(
          class = "pooled-empty",
          tags$i(class = "fa fa-folder-open pooled-empty__icon"),
          tags$div(class = "pooled-empty__title", "No pooled file is open"),
          tags$div(class = "pooled-muted", "Open a pooled file to see its ", tolower(kind$title), "."),
          pooled_btn(ns("goto_open"), "Open a file", icon = "folder-open", primary = TRUE)
        ))
      }
      if (!length(avail())) {
        return(div(class = "pooled-empty", tags$i(class = "fa fa-circle-info pooled-empty__icon"),
                   tags$div(class = "pooled-empty__title", paste("This file has no", tolower(kind$title), "data")),
                   tags$div(class = "pooled-muted", "It may have been built for another data domain.")))
      }
      d <- df()
      m <- measure()
      strip <- pooled_strip(dff())
      tagList(
        div(
          class = "pooled-filebar",
          pooled_file_chip(file_name(), nrow(pooled()$countries), length(pooled()$datasets), just_built()),
          pooled_btn(ns("goto_open2"), "Change file", icon = "folder-open"),
          div(style = "flex-grow: 1;"),
          pooled_menu(
            "Download",
            pooled_menu_link(ns("dl_csv"), "file-csv", "CSV file", dname()),
            pooled_menu_link(ns("dl_xlsx"), "file-excel", "Excel file", dname()),
            tags$button(id = ns("goto_extract"), type = "button", class = "action-button pooled-menu__item",
                        tags$i(class = "fa fa-sliders"), tags$span(class = "pooled-menu__text", "Extract a piece..."))
          )
        ),
        if (length(avail()) > 1) cd_tab_strip(ns, as.list(stats::setNames(POOLED_VARIANT_LABELS[names(avail())], names(avail()))), variant()),
        div(class = "pooled-strip", lapply(names(strip), function(k) div(class = "pooled-strip__item", div(class = "pooled-strip__label", k), div(class = "pooled-strip__value", strip[[k]])))),
        pooled_graph_grid(ns, kind, d, m, pooled()$datasets),
        div(
          class = "pooled-card",
          div(class = "pooled-card__head", tags$h3("Data"), tags$span(class = "pooled-muted", paste0(dname(), " · ", format(nrow(dff()), big.mark = ","), " rows"))),
          cd_spinner(reactableOutput(ns("table")), i18n = i18n)
        )
      )
    })

    observeEvent(input$goto_open, cd_navigate_to(session, "explore_open"))
    observeEvent(input$goto_open2, cd_navigate_to(session, "explore_open"))
    observeEvent(input$goto_extract, cd_navigate_to(session, "explore_extract"))

    output$table <- renderReactable({
      reactable(dff(), searchable = TRUE, striped = TRUE, highlight = TRUE, compact = TRUE, defaultPageSize = 10, resizable = TRUE,
                defaultColDef = colDef(format = colFormat(digits = 2)))
    })

    # ---- graphs (only the ones this kind's page draws are ever asked for) ------------------------------------------------
    output$g_trend <- renderPlot(pooled_plot_trend(dff(), req(measure()), palette()), res = 96)
    output$g_rank <- renderPlot(pooled_plot_rank(dff(), req(measure()), palette()), res = 96)
    output$g_spread <- renderPlot({
      src <- if ("district" %in% names(kind$datasets) && kind$datasets[["district"]] %in% names(pooled()$datasets)) kind$datasets[["district"]] else dname()
      pooled_plot_spread(pooled_filter(pooled()$datasets[[src]], shared$countries(), shared$years()), req(measure()), palette())
    }, res = 96)
    output$g_dots <- renderPlot(pooled_plot_dots(dff(), palette()), res = 96)
    output$g_col_a <- renderPlot(pooled_plot_col(dff(), "nmr", palette(), "Neonatal mortality"), res = 96)
    output$g_col_b <- renderPlot(pooled_plot_col(dff(), "survey_year", palette(), "Survey year"), res = 96)
    output$g_score_rank <- renderPlot(pooled_plot_score_rank(dff(), palette()), res = 96)
    output$g_score_heat <- renderPlot(pooled_plot_heat(dff()), res = 96)
    output$t_change <- renderReactable({
      d <- pooled_change_table(dff(), req(measure()))
      validate(need(!is.null(d), "There is nothing to compare for this selection."))
      reactable(d, compact = TRUE, striped = TRUE, defaultColDef = colDef(format = colFormat(digits = 1)),
                columns = list(First_year = colDef(name = "From", format = colFormat(digits = 0)), Latest_year = colDef(name = "To", format = colFormat(digits = 0)),
                               First = colDef(name = "First value"), Latest = colDef(name = "Latest value"), Change = colDef(name = "Change", style = list(fontWeight = 600))))
    })

    # ---- quick downloads of what is on screen --------------------------------------------------------------------------------
    output$dl_csv <- downloadHandler(
      filename = function() pooled_export_plan("csv", "view", dname(), pooled()$domain)$filename,
      content = function(file) pooled_write_csv(dff(), file)
    )
    output$dl_xlsx <- downloadHandler(
      filename = function() pooled_export_plan("xlsx", "view", dname(), pooled()$domain)$filename,
      content = function(file) pooled_write_xlsx(stats::setNames(list(dff()), dname()), file)
    )
  })
}

# One graph card. `span`: both columns of the grid.
pooled_graph_card <- function(title, sub, body, span = 1) {
  div(class = paste("pooled-card", if (span == 2) "pooled-card--wide"),
      div(class = "pooled-card__head", div(tags$h3(title), tags$div(class = "pooled-muted", sub))), div(class = "pooled-card__body", body))
}

pooled_graph_grid <- function(ns, kind, d, measure, datasets) {
  m <- if (is.null(measure)) "" else pooled_measure_label(measure)
  card <- list(
    trend = pooled_graph_card(paste(m, "over time"), "Each line is one country.", plotOutput(ns("g_trend"), height = "320px"), 2),
    rank = pooled_graph_card("Ranking", "Latest year, highest first.", plotOutput(ns("g_rank"), height = "300px")),
    spread = pooled_graph_card("Spread across areas", "Lowest, median and highest.", plotOutput(ns("g_spread"), height = "300px")),
    change = pooled_graph_card("Change since the first year", "Largest change first.", reactableOutput(ns("t_change"))),
    dots = pooled_graph_card("Survey coverage by country", "Each dot is one country. Compare how far apart they are.", plotOutput(ns("g_dots"), height = "340px"), 2),
    col_a = pooled_graph_card("Neonatal mortality", "From the national estimates.", plotOutput(ns("g_col_a"), height = "280px")),
    col_b = pooled_graph_card("Survey year", "The year each country's survey values come from.", plotOutput(ns("g_col_b"), height = "280px")),
    score_rank = pooled_graph_card("Overall score", "Highest first.", plotOutput(ns("g_score_rank"), height = "320px")),
    score_heat = pooled_graph_card("Where the score comes from", "Each part of the score, by country.", plotOutput(ns("g_score_heat"), height = "320px"))
  )
  div(class = "pooled-grid", card[kind$graphs])
}

pooled_file_chip <- function(name, n_countries, n_datasets, just_built) {
  div(
    class = "pooled-filechip",
    tags$i(class = "fa fa-database"), tags$strong(class = "pooled-mono", name),
    tags$span(class = "pooled-muted", paste0(n_countries, " countries · ", n_datasets, " datasets")),
    if (isTRUE(just_built)) tags$span(class = "pooled-badge", "Just built")
  )
}

# ---- Open a file --------------------------------------------------------------------------------------------------------------

pooled_open_ui <- function(id, i18n) {
  ns <- NS(id)
  tagList(
    pooled_page_header("Open a pooled file", "Open a pooled file, then pick a kind of dataset in the sidebar to see its data and graphs.", eyebrow = "Explore pooled data"),
    cd_page_content(
      div(
        class = "pooled-open",
        cd_card(title = "Use the file you just built", subtitle = "Made in this session.", i18n = i18n, uiOutput(ns("built"))),
        cd_card(
          title = "Upload a pooled file", subtitle = "A file made earlier by Build pooled file.", i18n = i18n,
          div(class = "pooled-stack",
              cd_file_upload(ns("open_rds"), label = "Pooled file", hint = "A .rds file made by Build pooled file.", accept = ".rds,.RDS", i18n = i18n),
              uiOutput(ns("error")))
        )
      )
    )
  )
}

# `built`: reactive returning list(pooled, path) for the file built in this session, or NULL.
# `open_file`: function(pooled, name, just_built) that makes it the open file.
pooled_open_server <- function(id, built, open_file) {
  moduleServer(id, function(input, output, session) {
    ns <- session$ns
    err <- reactiveVal(NULL)
    output$built <- renderUI({
      b <- built()
      if (is.null(b)) {
        return(div(class = "pooled-muted", "Nothing has been built yet. Build a pooled file first, or upload one."))
      }
      p <- b$pooled
      div(
        class = "pooled-stack",
        div(class = "pooled-file",
            tags$span(class = "pooled-file__icon", tags$i(class = "fa fa-database")),
            div(class = "pooled-file__main", tags$span(class = "pooled-mono", basename(b$path)),
                tags$span(class = "pooled-muted", paste0(pooled_size(file.size(b$path)), " · ", nrow(p$countries), " countries · ", length(p$datasets), " datasets")))),
        div(class = "pooled-muted", paste(p$countries$country, collapse = ", "), if (nrow(p$left_out)) paste0(". ", nrow(p$left_out), " files were left out when it was built.")),
        div(pooled_btn(ns("use_built"), "Explore this file", icon = "arrow-right", primary = TRUE))
      )
    })
    observeEvent(input$use_built, {
      b <- req(built())
      err(NULL)
      open_file(b$pooled, basename(b$path), TRUE)
    })
    observeEvent(input$open_rds, {
      res <- pooled_read(input$open_rds$datapath)
      if (res$ok) {
        err(NULL)
        open_file(res$pooled, input$open_rds$name, FALSE)
      } else {
        err(res$message)
      }
      cd_reset_file_upload("open_rds")
    })
    output$error <- renderUI(if (!is.null(err())) pooled_banner("error", "This file can't be opened", err()))
  })
}

# ---- Extract a piece -----------------------------------------------------------------------------------------------------------
# The chips at the top choose what goes in the piece (nothing chosen means all, like every chip here). Under them:
# the file, Get the piece (counts, format, download), then Columns and Preview side by side. Countries and Years are the
# same shared filter as the dataset pages.

pooled_extract_ui <- function(id, i18n) {
  ns <- NS(id)
  tagList(
    conditionalPanel(
      "output.loaded", ns = ns,
      cd_filter_bar(
        shiny.react::reactOutput(ns("datasets_ui")), shiny.react::reactOutput(ns("countries_ui")), shiny.react::reactOutput(ns("years_ui")),
        i18n = i18n
      )
    ),
    pooled_page_header("Extract a piece", "Pull just the datasets, countries, years and columns you need out of the pooled file. Choose them with the chips above.", eyebrow = "Explore pooled data"),
    cd_page_content(uiOutput(ns("body")))
  )
}

pooled_extract_server <- function(id, pooled, file_name, just_built, open_piece, shared, i18n) {
  moduleServer(id, function(input, output, session) {
    ns <- session$ns
    columns <- reactiveValues() # dataset -> the columns chosen (absent: every column)
    chosen_ds <- reactiveVal(character())
    reset_n <- reactiveVal(0) # bumped by Start again so the chips are drawn afresh
    preview_ds <- reactiveVal(NULL)
    is_active <- reactive(identical(shared$tab(), "explore_extract"))

    loaded <- reactive(!is.null(pooled()))
    output$loaded <- reactive(loaded())
    outputOptions(output, "loaded", suspendWhenHidden = FALSE)

    # ---- the chips ---------------------------------------------------------------------------------------------------
    output$datasets_ui <- shiny.react::renderReact({
      reset_n()
      cd_chip_multi(ns("datasets"), "Datasets", options = cd_plain_options(names(pooled()$datasets)), selected = isolate(chosen_ds()),
                    i18n = i18n, all_label = "All datasets")
    })
    output$countries_ui <- shiny.react::renderReact({
      is_active(); reset_n()
      cd_chip_multi(ns("countries"), "Countries", options = cd_plain_options(pooled()$countries$country),
                    selected = isolate(shared$countries()), i18n = i18n, all_label = "All countries")
    })
    output$years_ui <- shiny.react::renderReact({
      is_active(); reset_n()
      cd_chip_multi(ns("years"), "Years", options = cd_plain_options(pooled_all_years(pooled()$datasets)), selected = isolate(shared$years()),
                    i18n = i18n, all_label = "All years")
    })
    observeEvent(input$datasets, chosen_ds(setdiff(as.character(input$datasets), "")), ignoreInit = TRUE)
    observeEvent(input$countries, if (is_active()) shared$countries(setdiff(as.character(input$countries), "")), ignoreInit = TRUE)
    observeEvent(input$years, if (is_active()) shared$years(setdiff(as.character(input$years), "")), ignoreInit = TRUE)

    chosen <- reactive({
      all <- names(pooled()$datasets)
      pick <- intersect(all, chosen_ds())
      if (length(pick)) pick else all
    })
    countries <- reactive(shared$countries())
    years_used <- reactive(if (length(shared$years())) as.integer(shared$years()) else NULL)

    # ---- columns: choose a dataset, tick its columns -----------------------------------------------------------------------
    output$cols_ui <- renderUI({
      req(identical(input$cols_mode, "some"))
      ds <- if (!is.null(input$cols_ds) && input$cols_ds %in% chosen()) input$cols_ds else chosen()[[1]]
      all_cols <- names(pooled()$datasets[[ds]])
      sel <- if (is.null(columns[[ds]])) all_cols else columns[[ds]]
      tagList(selectInput(ns("cols_ds"), "Dataset", choices = chosen(), selected = ds, selectize = FALSE),
              div(class = "pooled-cols", checkboxGroupInput(ns("cols_pick"), NULL, choices = all_cols, selected = sel, inline = TRUE)),
              div(class = "pooled-muted", paste(length(sel), "of", length(all_cols), "columns chosen.")))
    })
    observeEvent(input$cols_pick, {
      ds <- input$cols_ds
      if (!is.null(ds) && ds %in% names(pooled()$datasets)) columns[[ds]] <- input$cols_pick
    }, ignoreNULL = FALSE)
    col_list <- reactive({
      if (!identical(input$cols_mode, "some")) return(NULL)
      stats::setNames(lapply(chosen(), function(ds) columns[[ds]]), chosen())
    })

    piece <- reactive(pooled_extract(pooled(), chosen(), countries(), years_used(), col_list()))
    plan <- reactive(pooled_export_plan(input$format %||% "csv", "piece", names(piece()$datasets), pooled()$domain))

    # ---- the page ---------------------------------------------------------------------------------------------------------
    output$body <- renderUI({
      p <- pooled()
      if (is.null(p)) {
        return(div(class = "pooled-empty", tags$i(class = "fa fa-folder-open pooled-empty__icon"),
                   tags$div(class = "pooled-empty__title", "No pooled file is open"), tags$div(class = "pooled-muted", "Open a pooled file to extract a piece of it."),
                   pooled_btn(ns("goto_open"), "Open a file", icon = "folder-open", primary = TRUE)))
      }
      div(
        class = "pooled-stack",
        div(class = "pooled-filebar", style = "margin-bottom: 0;",
            pooled_file_chip(file_name(), nrow(p$countries), length(p$datasets), just_built()),
            pooled_btn(ns("goto_open2"), "Change file", icon = "folder-open")),
        cd_card(title = "Get the piece", subtitle = "Choose how you want it.", i18n = i18n, uiOutput(ns("output_card"))),
        div(
          class = "pooled-extract-grid",
          cd_card(
            title = "Columns", subtitle = "Optional. Country, year and area columns are always kept.", i18n = i18n,
            div(class = "pooled-stack pooled-export",
                radioButtons(ns("cols_mode"), NULL, choices = c("All columns" = "all", "Choose columns" = "some"), selected = "all"),
                uiOutput(ns("cols_ui")))
          ),
          cd_card(title = "Preview", subtitle = "What you will get. It updates as you choose.", i18n = i18n, uiOutput(ns("preview")))
        )
      )
    })
    observeEvent(input$goto_open, cd_navigate_to(session, "explore_open"))
    observeEvent(input$goto_open2, cd_navigate_to(session, "explore_open"))

    output$output_card <- renderUI({
      pc <- piece()
      p <- plan()
      yrs <- if (is.null(years_used())) "All" else paste(range(years_used()), collapse = "–")
      div(
        class = "pooled-stack",
        div(class = "pooled-strip", style = "margin: 0;",
            div(class = "pooled-strip__item", div(class = "pooled-strip__label", "Datasets"), div(class = "pooled-strip__value", length(pc$datasets))),
            div(class = "pooled-strip__item", div(class = "pooled-strip__label", "Countries"), div(class = "pooled-strip__value", nrow(pc$countries))),
            div(class = "pooled-strip__item", div(class = "pooled-strip__label", "Years"), div(class = "pooled-strip__value", yrs)),
            div(class = "pooled-strip__item", div(class = "pooled-strip__label", "Rows"), div(class = "pooled-strip__value", format(pooled_piece_rows(pc), big.mark = ",")))),
        div(
          class = "pooled-get",
          div(class = "pooled-stack", style = "gap: 8px;",
              div(class = "pooled-label", "Format"),
              div(class = "pooled-seg pooled-export",
                  radioButtons(ns("format"), NULL, choices = c("CSV" = "csv", "Excel" = "xlsx", "Pooled file" = "rds"), selected = isolate(input$format) %||% "csv", inline = TRUE)),
              div(class = "pooled-muted", "CSV gives one file for one dataset, or a zip for several. Excel gives a workbook with a sheet for each dataset. Pooled file saves a smaller .rds you can open here later.")),
          div(class = "pooled-stack",
              div(class = "pooled-export-summary", tags$i(class = paste0("fa fa-", switch(p$kind, csv = "file-csv", zip = "file-zipper", xlsx = "file-excel", rds = "database"))),
                  div(tags$strong(p$label), tags$span(class = "pooled-mono", p$filename))),
              div(class = "pooled-tools",
                  tags$a(id = ns("dl_piece"), class = "shiny-download-link cd-button cd-button--primary", href = "", target = "_blank", download = NA, tags$i(class = "fa fa-download"), " Download"),
                  pooled_btn(ns("explore_piece"), "Explore this piece", icon = "chart-line"),
                  pooled_btn(ns("start_again"), "Start again")))
        )
      )
    })

    # Preview: one tab for each dataset in the piece
    for (i in 1:20) local({
      k <- i
      observeEvent(input[[paste0("tab_d", k)]], preview_ds(names(piece()$datasets)[k]))
    })
    output$preview <- renderUI({
      nm <- names(piece()$datasets)
      cur <- if (!is.null(preview_ds()) && preview_ds() %in% nm) preview_ds() else nm[[1]]
      keys <- paste0("d", seq_along(nm))
      tagList(
        cd_tab_strip(ns, as.list(stats::setNames(nm, keys)), keys[match(cur, nm)]),
        div(style = "padding-top: 12px;", reactableOutput(ns("preview_table"))),
        div(class = "pooled-muted", style = "margin-top: 8px;", paste0("Showing up to 6 of ", format(nrow(piece()$datasets[[cur]]), big.mark = ","), " rows for ", cur, "."))
      )
    })
    output$preview_table <- renderReactable({
      pc <- piece()
      ds <- if (!is.null(preview_ds()) && preview_ds() %in% names(pc$datasets)) preview_ds() else names(pc$datasets)[[1]]
      reactable(pc$datasets[[ds]], compact = TRUE, striped = TRUE, defaultPageSize = 6, defaultColDef = colDef(format = colFormat(digits = 2)))
    })

    output$dl_piece <- downloadHandler(
      filename = function() plan()$filename,
      content = function(file) {
        p <- plan()
        pc <- piece()
        if (identical(p$kind, "rds")) {
          pooled_write(pc, file)
        } else {
          withProgress(message = "Preparing your download", value = 0, {
            pooled_export(p, pc$datasets, file, progress = function(i, n, what) setProgress(i / n, detail = what))
          })
        }
      }
    )
    observeEvent(input$explore_piece, open_piece(piece(), paste0(sub("[.]rds$", "", file_name()), "_piece.rds")))

    # Start again: every chip back to "all", every column back in
    observeEvent(input$start_again, {
      chosen_ds(character())
      shared$countries(character())
      shared$years(character())
      preview_ds(NULL)
      for (nm in names(reactiveValuesToList(columns))) columns[[nm]] <- NULL
      updateRadioButtons(session, "cols_mode", selected = "all")
      reset_n(reset_n() + 1)
    })
  })
}
