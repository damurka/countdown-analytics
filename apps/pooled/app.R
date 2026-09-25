# Pooled: build one file from several countries' saved datasets, then explore it and export tables.
#
#   Build pooled file   Select files or a folder -> Load (each file shows loaded or failed, with the reason) ->
#                       Review and confirm -> Create: a pooled .rds holding every dataset.
#   Explore pooled data Open a pooled .rds (the one just built, or an upload). A page for each kind of dataset shows its
#                       data and graphs; Compare countries and All datasets look across the whole file; Extract a piece pulls
#                       chosen datasets, countries, years and columns out of it.
#
# Two pages on the shared Countdown shell (../_shared), with the "pooled" (green) theme. The logic is plain R in R/:
# pooled-datasets.R (the tables), pooled-build.R (load and combine), pooled-export.R, pooled-charts.R, pooled-ui.R.
options(shiny.maxRequestSize = 2 * 1024 * 1024^2)

library(cd2030.core)

pacman::p_load(
  shiny,
  shiny.react,
  htmltools,
  dplyr,
  purrr,
  openxlsx,
  readr,
  reactable,
  shiny.i18n,
  ggplot2,
  tidyr,
  zip,
  update = FALSE
)

source("../_shared/load.R")
cd_ui_load()

app_name <- Sys.getenv("CDSUITE_SHINY_NAME", unset = "Pooled")
app_version <- Sys.getenv("CDSUITE_SHINY_VERSION", unset = "2.0.0")
pre_loaded_dir <- Sys.getenv("CDSUITE_SHINY_SELECTED_FILE", unset = NA)
language <- Sys.getenv("CDSUITE_SHINY_LOCALE", unset = "en")

using_local_files <- !is.na(pre_loaded_dir) && nzchar(pre_loaded_dir) && dir.exists(pre_loaded_dir)
pooled_files <- if (using_local_files) list.files(pre_loaded_dir, pattern = "[.]rds$", full.names = TRUE, ignore.case = TRUE) else character()

i18n <- init_i18n(translation_json_path = cd_translations("translation/translation.json"))
i18n$set_translation_language(language)
cd_use_i18n(i18n)

domain_options <- list(
  list(key = "rmncah", text = "RMNCAH"),
  list(key = "vaccine", text = "Immunization (VAXX)")
)

explore_children <- c(
  list(cd_nav_item("Open a file", tabName = "explore_open", icon = "upload")),
  lapply(POOLED_KINDS, function(k) cd_nav_item(k$nav, tabName = k$tab, icon = k$icon)),
  list(
    cd_nav_item("Compare countries", tabName = "explore_compare", icon = "code-compare"),
    cd_nav_item("All datasets", tabName = "explore_all", icon = "database"),
    cd_nav_item("Extract a piece", tabName = "explore_extract", icon = "sliders")
  )
)
include_options <- list(
  list(key = "everything", text = "Everything in each dataset"),
  list(key = "standard", text = "Standard tables only")
)

cd_nav_sections <- list(
  cd_nav_section("Pooling",
    cd_nav_item("Build pooled file", tabName = "build", icon = "layer-group"),
    cd_nav_item("Explore pooled data", icon = "table", children = unname(explore_children))
  )
)

# ---- Build pooled file: the four steps are panes; the cards are static, what is inside them is redrawn ------
build_panes <- list(
  select = cd_card(
    title = "Choose datasets", subtitle = "Step 1 of 4", i18n = i18n,
    div(
      class = "pooled-stack",
      cd_field_select("domain", "Data domain", options = domain_options, value = "rmncah", i18n = i18n,
                      hint = "Decides which tables the pooled file contains."),
      cd_field_select("include", "What to include", options = include_options, value = "everything", i18n = i18n,
                      hint = "Everything adds WUENIC, surveys, denominators, data quality and more. Standard is only the tables Explore has pages for."),
      div(
        class = "pooled-pick",
        cd_file_upload("rds_files", label = "Select files", hint = "Choose several .rds files at once.",
                       accept = ".rds,.RDS", multiple = TRUE, i18n = i18n),
        cd_directory_upload("rds_dir", label = "Select a folder", hint = "We add every .rds file inside it.",
                            accept = ".rds,.RDS", i18n = i18n)
      ),
      uiOutput("select_list"),
      uiOutput("select_actions")
    )
  ),
  load = cd_card(
    title = "Loading files", subtitle = "Step 2 of 4. You can leave this page open while it runs.", i18n = i18n,
    uiOutput("load_body")
  ),
  review = cd_card(title = "Review results", subtitle = "Step 3 of 4", i18n = i18n, uiOutput("review_body")),
  create = cd_card(title = "File created", subtitle = "Step 4 of 4", i18n = i18n, uiOutput("create_body"))
)

build_screen <- cd_screen(
  tabName = "build",
  pooled_page_header(
    "Build a pooled file",
    "Choose the countries' saved datasets. We combine them into one .rds file you can open later.",
    eyebrow = "Pooling"
  ),
  cd_page_content(
    div(class = "pooled-rail", shiny.react::reactOutput("build_rail")),
    cd_tab_panes("build_panes", build_panes, active = "select")
  )
)

# ---- Explore pooled data: Open a file, a page for each kind of dataset, Extract a piece ------------------------
explore_screens <- c(
  list(cd_screen(tabName = "explore_open", pooled_open_ui("open", i18n))),
  lapply(names(POOLED_KINDS), function(k) cd_screen(tabName = POOLED_KINDS[[k]]$tab, pooled_kind_ui(k, k, i18n))),
  list(
    cd_screen(tabName = "explore_compare", pooled_compare_ui("compare", i18n)),
    cd_screen(tabName = "explore_all", pooled_all_ui("all", i18n)),
    cd_screen(tabName = "explore_extract", pooled_extract_ui("extract", i18n))
  )
)

ui <- cd_app_ui(
  theme = "pooled",
  title = app_name,
  header = cd_app_bar(app_name, app_version),
  sidebar = cd_sidebar(),
  body = cd_app_body(
    usei18n(i18n),
    cd_head_assets(),
    tags$head(
      fontawesome::fa_html_dependency(), # the icons in the parts of the pages that are plain markup
      tags$link(rel = "stylesheet", type = "text/css", href = paste0("pooled.css?v=", as.integer(file.mtime("www/pooled.css")))),
      # the server sets a plain input from R (the dataset list keeps its ticks and view in the page, not in a React component)
      tags$script(HTML("Shiny.addCustomMessageHandler('pooled-set', function(m){ Shiny.setInputValue(m.id, m.value, {priority: 'event'}); });"))
    ),
    do.call(cd_screens, c(list(build_screen), explore_screens))
  )
)

server <- function(input, output, session) {

  cd_shell_server(output, cd_nav_sections, initial_tab = "build", data_ready = reactive(TRUE), i18n = i18n)

  show_language <- function(lang) {
    update_lang(lang)
    cd_set_language(session, lang)
  }
  observeEvent(input$selected_language, show_language(input$selected_language))

  empty_files <- function() data.frame(name = character(), size = numeric(), path = character(), include = logical(), stringsAsFactors = FALSE)
  rv <- reactiveValues(
    step = "select",
    files = empty_files(), skipped = character(),
    results = list(), phase = "idle", run_domain = "rmncah", run_include = "everything",
    pooled = NULL, pooled_path = NULL,
    explore = NULL
  )
  domain <- reactive(input$domain %||% "rmncah")

  go_step <- function(step) {
    rv$step <- step
    cd_update_tab_panes(session, "build_panes", step)
  }

  # ---- step rail ------------------------------------------------------------------------------------------
  output$build_rail <- shiny.react::renderReact(cd_wizard_steps("build_step", pooled_step_list(rv$step), i18n))
  observeEvent(input$build_step, {
    key <- input$build_step
    if (identical(key, "select") && !identical(rv$phase, "running") && !identical(rv$step, "create")) go_step("select")
  })

  # ---- 1. select ------------------------------------------------------------------------------------------
  add_files <- function(picked) {
    keep <- grepl("[.]rds$", picked$name, ignore.case = TRUE)
    rv$skipped <- unique(c(rv$skipped, picked$name[!keep]))
    if (!any(keep)) return(invisible())
    new <- data.frame(name = picked$name[keep], size = picked$size[keep], path = picked$datapath[keep], include = TRUE, stringsAsFactors = FALSE)
    rv$files <- rbind(rv$files[!rv$files$name %in% new$name, , drop = FALSE], new)
  }
  if (using_local_files) {
    add_files(data.frame(name = basename(pooled_files), size = file.size(pooled_files), datapath = pooled_files))
  }
  observeEvent(input$rds_files, {
    add_files(input$rds_files)
    cd_reset_file_upload("rds_files")
  })
  observeEvent(input$rds_dir, {
    add_files(input$rds_dir)
    cd_reset_file_upload("rds_dir")
  })
  observeEvent(input$file_toggle, {
    f <- rv$files
    f$include[f$name == input$file_toggle$name] <- isTRUE(input$file_toggle$on)
    rv$files <- f
  })
  observeEvent(input$file_remove, rv$files <- rv$files[rv$files$name != input$file_remove, , drop = FALSE])
  observeEvent(input$clear_files, {
    rv$files <- empty_files()
    rv$skipped <- character()
  })

  output$select_list <- renderUI({
    f <- rv$files
    if (!nrow(f)) {
      return(div(class = "pooled-muted", "No files chosen yet."))
    }
    n_inc <- sum(f$include)
    div(
      class = "pooled-stack",
      if (using_local_files) pooled_banner("info", paste(length(pooled_files), "files pre-loaded"), paste("Folder:", basename(pre_loaded_dir))),
      div(
        div(class = "pooled-footer", style = "margin: 0; padding: 0; border: 0;",
            div(tags$span(class = "pooled-label", paste("Selected:", nrow(f), if (nrow(f) == 1) "file" else "files"))),
            div(tags$span(class = "pooled-muted", paste0(pooled_size(sum(f$size[f$include])), " of 2 GB")))),
        tags$ul(class = "pooled-list", style = "margin-top: 8px;", lapply(seq_len(nrow(f)), function(i) pooled_file_pick_row(f$name[[i]], f$size[[i]], f$include[[i]])))
      ),
      if (length(rv$skipped)) div(class = "pooled-muted", paste0("Skipped, not an .rds file: ", paste(rv$skipped, collapse = ", "), "."))
    )
  })
  output$select_actions <- renderUI({
    n <- sum(rv$files$include)
    div(
      class = "pooled-footer",
      div(pooled_btn("clear_files", "Clear all", disabled = nrow(rv$files) == 0)),
      div(pooled_btn("start_load", paste("Load", n, if (n == 1) "file" else "files"), icon = "arrow-right", primary = TRUE, disabled = n == 0))
    )
  })

  # ---- 2. load: one file at a time, so each shows as it finishes ----------------------------------------------
  waiting_entry <- function(name, path, size) {
    list(name = name, path = path, size = size, country = NA_character_, iso3 = NA_character_, date = pooled_file_date(name, path),
         status = "waiting", message = NULL, tables = list(), issues = character())
  }
  observeEvent(input$start_load, {
    f <- rv$files[rv$files$include, , drop = FALSE]
    req(nrow(f) > 0)
    rv$run_domain <- domain()
    rv$run_include <- input$include %||% "everything"
    rv$results <- lapply(seq_len(nrow(f)), function(i) waiting_entry(f$name[[i]], f$path[[i]], f$size[[i]]))
    rv$phase <- "running"
    go_step("load")
  })

  observe({
    if (identical(rv$phase, "running")) {
      invalidateLater(120)
      isolate({
        res <- rv$results
        st <- vapply(res, function(r) r$status, "")
        i_loading <- match("loading", st)
        i_waiting <- match("waiting", st)
        if (!is.na(i_loading)) {
          r <- res[[i_loading]]
          res[[i_loading]] <- pooled_load_file(r$path, r$name, rv$run_domain, include = rv$run_include %||% "everything")
          rv$results <- pooled_finalize(res) # compare with the files loaded so far, so a gap shows the moment a file finishes
        } else if (!is.na(i_waiting)) {
          res[[i_waiting]]$status <- "loading"
          rv$results <- res
        } else {
          rv$results <- pooled_finalize(res)
          rv$phase <- "done"
        }
      })
    }
  })

  observeEvent(input$retry_file, {
    res <- rv$results
    i <- match(input$retry_file, vapply(res, function(r) r$name, ""))
    req(!is.na(i))
    res[[i]] <- waiting_entry(res[[i]]$name, res[[i]]$path, res[[i]]$size)
    rv$results <- res
    rv$phase <- "running"
    go_step("load")
  })
  observeEvent(input$cancel_load, {
    rv$phase <- "idle"
    rv$results <- list()
    go_step("select")
  })
  observeEvent(input$back_to_files, {
    rv$phase <- "idle"
    rv$results <- list()
    go_step("select")
  })

  output$load_body <- renderUI({
    res <- rv$results
    req(length(res) > 0)
    st <- vapply(res, function(r) r$status, "")
    n <- length(res)
    n_done <- sum(st %in% c("ok", "warn", "error", "skipped"))
    running <- identical(rv$phase, "running")
    tagList(
      div(
        class = "pooled-stack",
        div(
          div(class = "pooled-progress-head", tags$strong(paste(n_done, "of", n, "files done")), tags$span(class = "pooled-muted", paste0(round(100 * n_done / n), "%"))),
          div(class = if (running) "pooled-progress--running", pooled_progress(100 * n_done / n, "Overall loading progress"))
        ),
        div(
          class = "pooled-stats",
          pooled_stat(sum(st == "ok"), "Loaded", "ok"), pooled_stat(sum(st == "warn"), "Loaded with a warning", "warn"),
          pooled_stat(sum(st == "error"), "Failed", "err"), pooled_stat(sum(st %in% c("waiting", "loading")), "Still to load", "wait")
        ),
        tags$ul(class = "pooled-list", `aria-label` = "File results", `aria-live` = "polite", lapply(res, pooled_load_row, running = running))
      ),
      div(
        class = "pooled-footer",
        div(pooled_btn("cancel_load", if (running) "Cancel loading" else "Back to files")),
        div(pooled_btn("to_review", "Review results", icon = "arrow-right", primary = TRUE, disabled = running))
      )
    )
  })
  observeEvent(input$to_review, {
    rv$results <- pooled_finalize(pooled_resolve_duplicates(rv$results))
    go_step("review")
  })

  # ---- 3. review and confirm --------------------------------------------------------------------------------
  observeEvent(input$leave_out, {
    res <- rv$results
    i <- match(input$leave_out, vapply(res, function(r) r$name, ""))
    req(!is.na(i))
    res[[i]]$status <- "skipped"
    res[[i]]$message <- "Left out by you."
    rv$results <- pooled_finalize(res)
  })

  status_counts <- reactive({
    st <- vapply(rv$results, function(r) r$status, "")
    list(ok = sum(st == "ok"), warn = sum(st == "warn"), error = sum(st == "error"), skipped = sum(st == "skipped"), n = length(st))
  })

  output$review_body <- renderUI({
    req(length(rv$results) > 0)
    sc <- status_counts()
    usable <- sc$ok + sc$warn
    issues <- Filter(function(r) r$status %in% c("error", "warn"), rv$results)
    tagList(
      div(
        class = "pooled-stack",
        div(
          class = "pooled-stats",
          pooled_stat(sc$ok, "Ready to combine", "ok"), pooled_stat(sc$warn, "Ready, with a warning", "warn"),
          pooled_stat(sc$error, "Failed to load", "err"), if (sc$skipped > 0) pooled_stat(sc$skipped, "Left out by you", "wait")
        ),
        if (length(issues)) div(class = "pooled-stack", style = "gap: 8px;", tags$div(class = "pooled-label", "Needs your attention"),
                                tags$ul(class = "pooled-list", lapply(issues, pooled_issue_row)))
      ),
      div(
        class = "pooled-footer",
        div(pooled_btn("back_to_files", "Back to files")),
        div(pooled_btn("combine", if (usable == 1) "Combine 1 file" else paste("Combine", usable, "files"), icon = "layer-group", primary = TRUE, disabled = usable == 0))
      )
    )
  })

  observeEvent(input$combine, {
    sc <- status_counts()
    left <- sc$error + sc$skipped
    if (left == 0) {
      do_combine()
    } else {
      usable <- sc$ok + sc$warn
      cd_show_dialog(
        paste0("Combine with ", left, if (left == 1) " file" else " files", " left out?"),
        p(HTML(sprintf("The pooled file will have <strong>%d of %d</strong> files. Those left out are listed in the file's log with the reason.", usable, sc$n))),
        if (sc$warn > 0) tags$ul(tags$li(sprintf("%d %s included even though it has a warning.", sc$warn, if (sc$warn == 1) "file is" else "files are"))),
        footer = tagList(cd_dialog_close_button("Go back"), pooled_btn("combine_confirm", paste("Combine", usable, if (usable == 1) "file" else "files"), icon = "layer-group", primary = TRUE))
      )
    }
  })
  observeEvent(input$combine_confirm, {
    cd_remove_dialog()
    do_combine()
  })

  # ---- 4. create ------------------------------------------------------------------------------------------------
  do_combine <- function() {
    withProgress(message = "Combining files", value = 0, {
      out <- tryCatch({
        pooled <- pooled_combine(rv$results, rv$run_domain, app_version, progress = function(i, n, what) setProgress(i / n, detail = what))
        path <- file.path(tempdir(), pooled_file_name(rv$run_domain))
        setProgress(1, detail = "Saving the file")
        pooled_write(pooled, path)
        list(pooled = pooled, path = path)
      }, error = function(e) e)
    })
    if (inherits(out, "error")) {
      showNotification(conditionMessage(out), type = "error")
    } else {
      rv$pooled <- out$pooled
      rv$pooled_path <- out$path
      go_step("create")
    }
  }

  output$create_body <- renderUI({
    p <- req(rv$pooled)
    left <- p$left_out
    tagList(
      div(
        class = "pooled-stack",
        pooled_banner("success", "Pooled file created", paste(nrow(p$countries), if (nrow(p$countries) == 1) "country" else "countries", "and", length(p$datasets), "datasets were combined into one file.")),
        div(
          class = "pooled-file",
          tags$span(class = "pooled-file__icon", tags$i(class = "fa fa-database")),
          div(class = "pooled-file__main", tags$span(class = "pooled-mono", basename(rv$pooled_path)),
              tags$span(class = "pooled-muted", paste0(pooled_size(file.size(rv$pooled_path)), " · ", paste(p$countries$country, collapse = ", ")))),
          tags$a(id = "download_rds", class = "shiny-download-link cd-button", href = "", target = "_blank", download = NA, tags$i(class = "fa fa-download"), " Download .rds"),
          pooled_btn("explore_this", "Explore this file", icon = "arrow-right", primary = TRUE)
        ),
        div(
          tags$div(class = "pooled-label", style = "margin-bottom: 6px;", "Inside the file"),
          div(class = "pooled-inside", lapply(names(p$datasets), function(nm) {
            div(class = "pooled-inside__row", tags$span(nm), tags$span(paste(format(nrow(p$datasets[[nm]]), big.mark = ","), "rows")))
          }))
        ),
        if (nrow(left)) div(
          tags$div(class = "pooled-label", style = "margin-bottom: 6px;", "Left out"),
          pooled_banner("warning", paste(nrow(left), if (nrow(left) == 1) "file was not included" else "files were not included"),
                        paste(paste0(left$file, " (", sub("[.]$", "", left$reason), ")"), collapse = ". "))
        )
      ),
      div(class = "pooled-footer", div(pooled_btn("build_another", "Build another file", icon = "plus")), div())
    )
  })
  output$download_rds <- downloadHandler(
    filename = function() basename(req(rv$pooled_path)),
    content = function(file) file.copy(rv$pooled_path, file, overwrite = TRUE)
  )
  observeEvent(input$build_another, {
    rv$files <- empty_files()
    rv$skipped <- character()
    rv$results <- list()
    rv$phase <- "idle"
    rv$pooled <- NULL
    go_step("select")
  })
  observeEvent(input$explore_this, open_file(rv$pooled, basename(rv$pooled_path), TRUE))

  # ---- Explore pooled data ---------------------------------------------------------------------------------------------
  file_name <- reactiveVal(NULL)
  just_built <- reactiveVal(FALSE)
  pooled_open <- reactive(rv$explore)
  shared <- list(tab = reactive(input$tabs), countries = reactiveVal(character()), years = reactiveVal(character()))

  # Make `pooled` the open file and go to the first page that has something in it.
  open_file <- function(pooled, name, built) {
    rv$explore <- pooled
    file_name(name)
    just_built(built)
    shared$countries(character())
    shared$years(character())
    has <- vapply(POOLED_KINDS, function(k) length(pooled_kind_datasets(k, pooled$datasets)) > 0, logical(1))
    cd_navigate_to(session, POOLED_KINDS[[names(POOLED_KINDS)[has][1] %||% "params"]]$tab)
  }

  pooled_open_server("open", built = reactive(if (!is.null(rv$pooled)) list(pooled = rv$pooled, path = rv$pooled_path)), open_file = open_file)
  for (k in names(POOLED_KINDS)) pooled_kind_server(k, k, pooled_open, file_name, just_built, shared, i18n)
  pooled_compare_server("compare", pooled_open, file_name, just_built, shared, i18n)
  pooled_all_server("all", pooled_open, file_name, just_built, shared, i18n)
  pooled_extract_server("extract", pooled_open, reactive(file_name() %||% "pooled.rds"), just_built, open_piece = function(piece, name) open_file(piece, name, FALSE), shared = shared, i18n = i18n)

  output$header_pill <- renderUI({
    req(rv$explore, startsWith(input$tabs %||% "", "explore_"))
    tags$span(
      class = "cd-dataset-pill",
      tags$span(class = "cd-dataset-pill__dot"),
      tags$span(class = "cd-dataset-pill__country", file_name()),
      tags$span(class = "cd-dataset-pill__file", paste(nrow(rv$explore$countries), "countries"))
    )
  })
}

shinyApp(ui = ui, server = server)
