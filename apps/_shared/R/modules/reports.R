# The Reports page: the report builder (js/src/components/ReportStudio.tsx). A report is a list of blocks plus a design
# (theme, page) and a cover, kept in the dataset (cache$set_report_project()); cd2030.core draws each chart and table
# (render_report_block()) and writes the Word or PDF file (export_report(); the PDF is made from the Word file). This
# module keeps the two in step:
#   - the component's value is the open report; every edit arrives here and is saved to the dataset,
#   - each chart and table is drawn here and sent back as a preview ("cd-report-preview"), one at a time so the page
#     stays responsive. The component gives every chart block a `sig` (what it looks like: its settings and the theme);
#     a block is redrawn when its sig changes,
#   - the fields' values ({country}, {anc4_latest}...) are sent as "cd-report-fields" whenever they may have changed,
#   - buttons (new, open, standard report, duplicate, delete, close, download, final pages) arrive as events on
#     `studio__action`; a new report is named by the user first (the component asks),
#   - a page's "Generate report" button (cd_request_report()) asks for a new report from that page's standard report,
#   - a report has its own language (project$lang), chosen when it is created (the app's language by default): the
#     standard report's text is written in it, and its charts, tables, dates and file are always drawn in it
#     (cd_report_translator()), whatever language the app is in. A report saved before this has none and follows the app.

reports_ui <- function(id, i18n) {
  ns <- NS(id)
  cd_page_ui(
    id, i18n,
    cd_report_studio(ns("studio"), i18n),
    # the file a download writes is served through this (hidden) link's handler
    div(style = "display: none", downloadLink(ns("file"), ""))
  )
}

# ---- what the component shows ------------------------------------------------------------------------------------

cd_report_texts <- function(i18n) {
  # every text of the builders: the translations' lbl_rb_* keys (a new text needs only its line in shared.json)
  keys <- grep("^lbl_rb_", rownames(i18n$get_translations()), value = TRUE)
  stats::setNames(lapply(keys, function(k) cd_text(i18n, k)), sub("^lbl_rb_", "", keys))
}

cd_report_studio <- function(inputId, i18n = cd_i18n()) {
  if (is.null(.chart_schema_cache$schema)) .chart_schema_cache$schema <- cd_chart_schema(i18n)
  chart_keys <- c(
    search = "lbl_cc_search", noResults = "lbl_cc_no_results", reset = "lbl_chart_reset", resetGroup = "lbl_cc_reset_group",
    changed = "lbl_cc_changed", asDrawn = "lbl_chart_style_as_drawn", yes = "lbl_chart_style_yes", no = "lbl_chart_style_no",
    min = "lbl_chart_style_min", max = "lbl_chart_style_max", entriesLegend = "lbl_chart_style_legend_entries",
    entriesCategories = "lbl_chart_style_category_entries", entryText = "lbl_chart_style_entry_text",
    entryColor = "lbl_chart_style_entry_color", show = "lbl_cc_show", hidden = "lbl_cc_hidden"
  )
  cd_react_element("ReportStudio", shiny.react::asProps(
    inputId = inputId,
    value = NULL,
    projects = list(),
    presets = list(),
    kinds = list(),
    regions = list(),
    years = list(),
    themes = list(),
    fonts = as.list(cd2030.core::report_fonts()),
    fieldCatalog = cd_report_field_catalog(i18n),
    flag = NULL,
    converter = NULL,
    chartSchema = list(tabs = .chart_schema_cache$schema$tabs, fields = .chart_schema_cache$schema$fields,
                       texts = lapply(chart_keys, function(k) cd_text(i18n, k))),
    texts = cd_report_texts(i18n)
  ))
}

# The fields a report's text can contain, labelled in every language
cd_report_field_catalog <- function(i18n) {
  langs <- setdiff(i18n$get_languages(), "key")
  lapply(cd2030.core::report_field_catalog(), function(f) {
    label <- if (!is.null(f$indicator)) {
      stats::setNames(lapply(langs, function(l) {
        paste(cd_plain_text(i18n, paste0("opt_", f$indicator), l), cd_plain_text(i18n, paste0("lbl_rb_field_", f$what), l), sep = " \u00b7 ")
      }), langs)
    } else {
      cd_text(i18n, paste0("lbl_rb_field_", f$key))
    }
    list(key = f$key, group = f$group, label = label)
  })
}

# A country's flag as a data URL, for the cover (NULL when it cannot be found)
cd_report_flag <- function(cache) {
  path <- tryCatch(cd2030.core::report_flag_file(cache$country_iso), error = function(e) NULL)
  if (is.null(path)) return(NULL)
  paste0("data:image/png;base64,", jsonlite::base64_enc(readBin(path, "raw", file.info(path)$size)))
}

# The kinds of chart and table, with their choices translated
cd_report_kinds <- function(i18n, cache) {
  analysis <- tryCatch(get_analysis_indicators(), error = function(e) character())
  opt <- function(values, key) lapply(values, function(v) list(value = v, label = cd_text(i18n, paste0(key, v))))
  kinds <- cd2030.core::report_block_kinds(cd_report_group())
  lapply(names(kinds), function(k) {
    spec <- kinds[[k]]
    indicators <- if (identical(spec$indicators, "analysis")) analysis else spec$indicators
    defaults <- list()
    if (length(indicators)) defaults$indicator <- if ("anc4" %in% indicators) "anc4" else indicators[[1]]
    if (length(spec$levels)) defaults$admin_level <- spec$levels[[1]]
    if (length(spec$variants)) defaults$variant <- names(spec$variants)[[1]]
    if (isTRUE(spec$regional)) defaults$region <- "@report"
    list(
      kind = k, type = spec$type, group = spec$group,
      groupLabel = cd_text(i18n, paste0("lbl_rb_group_", spec$group)),
      label = cd_text(i18n, paste0("lbl_rb_kind_", k)),
      indicators = if (length(indicators)) opt(indicators, "opt_"),
      levels = if (length(spec$levels)) opt(spec$levels, "lbl_rb_level_"),
      variants = if (length(spec$variants)) opt(names(spec$variants), "lbl_rb_var_"),
      year = isTRUE(spec$year),
      regional = isTRUE(spec$regional),
      tall = isTRUE(spec$tall),
      defaults = defaults
    )
  })
}

# What a chart block looks like, as the component computed it (layout.ts blockSig(): its settings and the theme); a
# preview is sent with the sig it was drawn for. A block the component has not signed yet has none.
cd_report_sig <- function(b) b$sig %||% ""

cd_report_new_id <- function() paste0("r", format(Sys.time(), "%Y%m%d%H%M%S"), sample.int(999, 1))

# The app's indicator group (rmncah, vaccine): which standard reports and kinds it has
cd_report_group <- function() getOption("cd2030.app_group", cd2030.core::get_selected_group())

# The translator cd2030.core draws a report with: t(key) in one language (the user's), whatever the app's translator is on
cd_report_translator <- function(i18n, lang) {
  lang <- if (lang %in% c("en", "fr", "pt")) lang else "en"
  list(t = function(key, ...) cd_plain_text(i18n, key, lang), lang = lang)
}

# Every block of a report: a document's blocks, or each item of a deck's slides (its block, with the item's id and its
# box, the size it is drawn at, in inches)
cd_report_blocks <- function(p) cd2030.core::report_project_blocks(p)

cd_report_is_deck <- function(p) identical(p$kind, "deck")

cd_report_summary <- function(projects) {
  if (!length(projects)) return(list())
  rows <- lapply(names(projects), function(id) {
    p <- projects[[id]]
    blocks <- cd_report_blocks(p)
    list(
      id = id, name = p$name %||% "",
      kind = if (cd_report_is_deck(p)) "deck" else "document",
      updated = p$updated %||% "",
      charts = sum(vapply(blocks, function(b) isTRUE(b$type %in% c("chart", "table")), logical(1))),
      blocks = if (cd_report_is_deck(p)) length(p$slides %||% list()) else length(blocks),
      order = p$updated %||% ""
    )
  })
  rows[order(vapply(rows, function(r) r$order, character(1)), decreasing = TRUE)]
}

# ---- server ------------------------------------------------------------------------------------------------------

reports_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  moduleServer(id, function(input, output, session) {
    studio_id <- session$ns("studio")
    state <- reactiveValues(open = NULL, project = NULL, file = NULL, file_name = NULL)
    drawn <- new.env(parent = emptyenv())   # block id -> signature already sent
    queue <- reactiveVal(list())

    message <- function(type, payload) session$sendCustomMessage(type, c(list(id = studio_id), payload))
    push <- function(...) cd_update_input("studio", session, ...)
    projects <- function() tryCatch(cache()$report_projects, error = function(e) list()) %||% list()

    # the app's language, and the translator a report is drawn with: in the report's own language
    lang <- reactive(if (isTruthy(cache())) cache()$language %||% "en" else "en")
    report_lang <- function(project = isolate(state$project)) project$lang %||% isolate(lang())
    tr <- function(project = isolate(state$project)) cd_report_translator(i18n, report_lang(project))

    # a page's "Generate report" (cd_request_report()): list(preset, nonce), passed to the component, which asks for the
    # new report's name
    request <- reactiveVal(NULL)
    session$userData$cd_report_request <- request

    # Everything the component shows besides the open report, in ONE update: two updates to the same input in one
    # flush do not both arrive (the second replaces the first).
    push_home <- function(extra = list()) {
      presets <- cd2030.core::report_presets(isolate(lang()), cd_report_group())
      regions <- cd_report_regions(cache())
      years <- cache()$data_years
      props <- list(
        projects = cd_report_summary(projects()),
        presets = lapply(names(presets), function(k) list(
          id = k,
          name = presets[[k]]$name,
          description = presets[[k]]$description,
          kind = presets[[k]]$kind %||% "document",
          charts = sum(vapply(cd_report_blocks(presets[[k]]), function(b) isTRUE(b$type %in% c("chart", "table")), logical(1)))
        )),
        # what a new report's name is made from
        suggest = list(country = tryCatch(cache()$country, error = function(e) "") %||% "",
                       year = if (length(years)) as.character(max(years)) else ""),
        request = isolate(request()),
        kinds = cd_report_kinds(i18n, cache()),
        regions = as.list(regions),
        years = as.list(cache()$data_years),
        themes = c(
          unname(lapply(cd2030.core::report_themes(), function(th) {
            th$name <- cd_text(i18n, paste0("lbl_rb_theme_", th$theme))
            th$palette <- as.list(th$palette)
            th
          })),
          # made from Office files (their template is kept in the dataset)
          unname(lapply(tryCatch(cache()$report_themes, error = function(e) list()) %||% list(), function(th) {
            th$palette <- as.list(th$palette)
            th
          }))
        ),
        flag = cd_report_flag(cache()),
        converter = cd2030.core::report_converter(),
        layouts = tryCatch(unname(cd2030.core::report_deck_layouts()), error = function(e) list())
      )
      # what the caller adds replaces the same fields (a NULL too: value = NULL closes the open report)
      for (name in names(extra)) props[name] <- list(extra[[name]])
      do.call(push, props)
    }

    # the fields' values for the open report; sent again when what they depend on (name, cover) changes
    fields_key <- reactiveVal(NULL)
    send_fields <- function(project) {
      key <- cd_report_key(list(report_lang(project), project$name, project$region, project$cover$editors, project$cover$date_mode, project$cover$date, project$cover$reference))
      if (identical(key, isolate(fields_key()))) return(invisible())
      fields_key(key)
      message("cd-report-fields", list(fields = cd2030.core::report_fields(cache(), project, lang = report_lang(project))))
    }

    # what the component needs about the dataset and its reports
    observeEvent(list(cache(), active(), input$studio__mounted), {
      req(cache(), active())
      push_home()
    }, ignoreNULL = FALSE)

    # a new app language: the standard reports' names in it (and an open report that has no language of its own follows it)
    observeEvent(lang(), {
      req(cache(), active())
      push_home()
      if (!is.null(state$project) && is.null(state$project$lang)) {
        fields_key(NULL)
        send_fields(state$project)
      }
    }, ignoreInit = TRUE)

    # a page asked for a report from its standard report
    observeEvent(request(), {
      req(cache())
      push_home(list(request = request()))
    }, ignoreInit = TRUE)

    # a new dataset closes the open report (and its charts are drawn again for the blocks panel)
    observeEvent(cache(), {
      state$open <- NULL
      push(value = NULL)
      rm(list = ls(thumbs), envir = thumbs)
      thumb_queue(list())
    }, ignoreInit = TRUE)

    save <- function(project) {
      project$updated <- format(Sys.time(), "%Y-%m-%d %H:%M")
      cache()$set_report_project(project$id, project)
      project
    }

    # the component signs the blocks (see cd_report_sig()) and sends the report back straight away, which queues the
    # previews of a new report; a saved report's blocks are signed already, and are queued here (sending the same report
    # again would not reach the server: Shiny drops a value equal to the last one)
    open_project <- function(project) {
      state$open <- project$id
      state$project <- project
      rm(list = ls(drawn), envir = drawn)
      queue(list())
      fields_key(NULL)
      message("cd-report-preview", list(reset = TRUE))
      push_home(list(value = project))
      send_fields(project)
      send_assets(project)
      queue_previews(cd_report_blocks(project))
      queue_thumbs()
    }

    # ---- the blocks panel's pictures: each kind of chart drawn small with its first settings, once per dataset, one
    # per turn of the event loop and only when the open report's previews are drawn
    thumbs <- new.env()
    thumb_queue <- reactiveVal(list())
    queue_thumbs <- function() {
      done <- ls(thumbs)
      ready <- Filter(nzchar, mget(done, envir = thumbs))
      if (length(ready)) message("cd-report-thumbs", list(thumbs = ready))
      kinds <- cd_report_kinds(i18n, isolate(cache()))
      # (not the Bayesian model: drawing it fits the model, which takes a while)
      thumb_queue(Filter(function(k) identical(k$type, "chart") && !(k$kind %in% c(done, "bayes_coverage")), kinds))
    }
    observe({
      q <- thumb_queue()
      if (!length(q) || length(queue())) return()
      k <- q[[1]]
      isolate(thumb_queue(q[-1]))
      if (exists(k$kind, envir = thumbs, inherits = FALSE)) return()
      project <- isolate(state$project)
      src <- tryCatch(cd_report_thumb(isolate(cache()), k, tr(project), project$design), error = function(e) NULL)
      assign(k$kind, src %||% "", envir = thumbs)
      if (!is.null(src)) message("cd-report-thumbs", list(thumbs = stats::setNames(list(src), k$kind)))
    })

    # the pictures a report uses are kept once in the dataset (cache$set_report_asset()); the builder gets them when the
    # report opens, and keeps the ones it adds
    send_assets <- function(project) {
      ids <- unique(c(unlist(lapply(cd_report_blocks(project), function(b) {
        if (identical(b$type, "image") && is.character(b$src) && startsWith(b$src, "asset:")) sub("^asset:", "", b$src)
      })), cd_report_design_asset_ids(project$design$slide_designs)))
      if (!length(ids)) return(invisible())
      urls <- lapply(ids, function(i) cd2030.core::report_asset_data_url(cache(), i))
      keep <- !vapply(urls, is.null, logical(1))
      if (any(keep)) message("cd-report-assets", list(assets = stats::setNames(urls[keep], ids[keep])))
    }

    # the pictures of a theme's slide designs (logos, a background photo), for the editor to draw
    send_design_assets <- function(designs) {
      ids <- cd_report_design_asset_ids(designs)
      if (!length(ids)) return(invisible())
      urls <- lapply(ids, function(i) cd2030.core::report_asset_data_url(cache(), i))
      keep <- !vapply(urls, is.null, logical(1))
      if (any(keep)) message("cd-report-assets", list(assets = stats::setNames(urls[keep], ids[keep])))
    }

    queue_previews <- function(blocks) {
      todo <- Filter(function(b) {
        isTRUE(b$type %in% c("chart", "table")) && nzchar(cd_report_sig(b)) && !identical(drawn[[b$id]], cd_report_sig(b))
      }, blocks)
      queue(c(isolate(queue()), todo))
    }

    # the builder's edits: save, and redraw what changed
    observeEvent(input$studio, {
      p <- input$studio
      req(cache(), is.list(p), identical(p$id, state$open))
      state$project <- save(p)
      message("cd-report-saved", list())
      send_fields(p)
      queue_previews(cd_report_blocks(p))
    }, ignoreNULL = TRUE)

    # draw one queued preview per turn of the event loop, so the page stays responsive and previews arrive one by one
    observe({
      q <- queue()
      if (!length(q)) return()
      b <- q[[1]]
      rest <- q[-1]
      sig <- cd_report_sig(b)
      if (!identical(drawn[[b$id]], sig)) {
        drawn[[b$id]] <- sig
        project <- isolate(state$project)
        b <- cd2030.core::report_resolve_block(b, project, cd_report_regions(isolate(cache())))
        preview <- cd_report_preview(isolate(cache()), b, tr(project), sig, project$design)
        message("cd-report-preview", list(previews = stats::setNames(list(preview), b$id)))
      }
      # later blocks of a changed chart replace earlier ones for the same block
      isolate(queue(Filter(function(x) !identical(x$id, b$id) || !identical(cd_report_sig(x), sig), rest)))
    })

    # buttons
    observeEvent(input$studio__action, {
      a <- input$studio__action
      req(cache())
      type <- a$type %||% ""
      # the name and the language the user gave the new report
      named <- function(fallback) if (is.character(a$name) && nzchar(trimws(a$name))) trimws(a$name) else fallback
      new_lang <- if (isTRUE(a$lang %in% c("en", "fr", "pt"))) a$lang else isolate(lang())
      if (type == "new" && identical(a$kind, "deck")) {
        # a blank slide deck (16:9); the editor gives it its title slide
        design <- utils::modifyList(cd2030.core::report_default_design(), list(slide_size = "16:9", cover = FALSE, contents = FALSE))
        p <- list(id = cd_report_new_id(), name = named(cd_plain_text(i18n, "lbl_rb_untitledDeck", new_lang)), lang = new_lang,
                  kind = "deck", design = design, cover = cd2030.core::report_default_cover(), blocks = list(), slides = list())
        open_project(save(p))
      } else if (type == "new") {
        p <- list(id = cd_report_new_id(), name = named(cd_plain_text(i18n, "lbl_rb_untitled", new_lang)), lang = new_lang,
                  design = cd2030.core::report_default_design(), cover = cd2030.core::report_default_cover(),
                  blocks = list(list(id = "b1", type = "paragraph", text = "")))
        open_project(save(p))
      } else if (type == "preset") {
        preset <- cd2030.core::report_presets(new_lang, cd_report_group())[[a$preset]]
        req(preset)
        suffix <- function(x) paste0(x, "_", sample.int(1e6, 1))
        p <- list(id = cd_report_new_id(), name = named(preset$name), lang = new_lang, design = preset$design,
                  cover = preset$cover,
                  # a national report, unless its blocks are drawn for one region (the one-pager)
                  region = if (any(vapply(cd_report_blocks(preset), function(b) identical(b$region, "@report"), logical(1)))) cd_report_regions(cache())[1],
                  blocks = lapply(preset$blocks %||% list(), function(b) { b$id <- suffix(b$id); b }))
        if (identical(preset$kind, "deck")) {
          # a standard slide deck: its slides and their items, each with a new id
          p$kind <- "deck"
          p$slides <- lapply(preset$slides %||% list(), function(s) {
            s$id <- suffix(s$id %||% "s")
            s$items <- lapply(s$items %||% list(), function(it) {
              it$id <- suffix(it$id %||% "i")
              it$block$id <- it$id
              it
            })
            s
          })
        }
        open_project(save(p))
      } else if (type == "open") {
        p <- projects()[[a$project]]
        req(p)
        open_project(p)
      } else if (type == "duplicate") {
        p <- projects()[[a$project]]
        req(p)
        p$id <- cd_report_new_id()
        p$name <- paste(p$name, cd_plain_text(i18n, "lbl_rb_copy", report_lang(p)))
        save(p)
        push_home()
      } else if (type == "delete") {
        cache()$set_report_project(a$project, NULL)
        push_home()
      } else if (type == "close") {
        state$open <- NULL
        push_home(list(value = NULL))
      } else if (type == "asset" || type == "asset_url") {
        # a picture added in the builder (a file it read, or a web address to download now)
        stored <- tryCatch(cd2030.core::report_store_asset(cache(), a$asset, if (type == "asset") a$src else a$url),
                           error = function(e) conditionMessage(e))
        if (is.character(stored)) {
          message("cd-report-assets", list(failed = list(id = a$asset, message = stored)))
        } else if (type == "asset_url") {
          message("cd-report-assets", list(assets = stats::setNames(list(stored$url), stored$id), done = list(id = stored$id, ratio = stored$ratio)))
        }
      } else if (type == "theme_file") {
        # a PowerPoint or Word file (template or document) made into a theme; the file is kept, and exports are written
        # from it
        result <- tryCatch({
          ext <- tolower(tools::file_ext(a$name %||% ""))
          if (!ext %in% c("potx", "pptx", "dotx", "docx")) stop(cd_plain_text(i18n, "lbl_rb_themeFileKinds", report_lang()))
          data <- jsonlite::base64_dec(sub("^data:[^,]*,", "", a$data %||% ""))
          path <- tempfile(fileext = paste0(".", ext))
          writeBin(data, path)
          th <- cd2030.core::report_theme_from_file(path, name = tools::file_path_sans_ext(basename(a$name)))
          asset <- paste0("tpl_", th$theme)
          cache()$set_report_asset(asset, list(type = "application/octet-stream", data = data))
          th$template <- paste0("asset:", asset)
          th$template_ext <- ext
          th$slide_designs <- cd_report_designs_store(cache(), th$slide_designs, asset)
          cache()$set_report_theme(th$theme, th)
          th
        }, error = function(e) conditionMessage(e))
        if (is.character(result)) {
          message("cd-report-theme", list(failed = result))
        } else {
          push_home()
          result$palette <- as.list(result$palette)
          send_design_assets(result$slide_designs)
          message("cd-report-theme", list(theme = result))
        }
      } else if (type == "export") {
        cd_report_export(session, cache(), projects()[[state$open]], a$format %||% "docx", i18n, tr(projects()[[state$open]]), message, state)
      } else if (type == "final") {
        cd_report_final(cache(), projects()[[state$open]], tr(projects()[[state$open]]), message)
      }
    })

    output$file <- downloadHandler(
      filename = function() state$file_name %||% "report.docx",
      content = function(file) file.copy(state$file, file, overwrite = TRUE)
    )
    # its link is hidden; a hidden output is suspended and its download never registered
    outputOptions(output, "file", suspendWhenHidden = FALSE)
  })
}

# One chart or table, drawn as the exported file will draw it (the theme and the report's saved chart styling included).
# A chart's legend entries come with it, so the builder can recolour or rename them.
cd_report_preview <- function(cache, b, i18n, sig, design = NULL) {
  r <- cd2030.core::with_report_chart_options(cache, cd2030.core::render_report_block(cache, b, i18n, design), design = design)
  size <- cd2030.core::report_block_size(b, design)
  if (identical(r$type, "plot")) {
    f <- tempfile(fileext = ".png")
    on.exit(unlink(f), add = TRUE)
    ok <- tryCatch({ cd2030.core::save_report_chart(r, b, f, dpi = 300, design = design); TRUE }, error = function(e) conditionMessage(e))
    if (!isTRUE(ok)) return(list(sig = sig, error = ok, w = size[1], h = size[2]))
    src <- paste0("data:image/png;base64,", jsonlite::base64_enc(readBin(f, "raw", file.info(f)$size)))
    list(sig = sig, src = src, w = size[1], h = size[2], entries = tryCatch(cd_chart_entries(r$value), error = function(e) list()),
         # a chart drawn as panels (by year, district...): how, so the builder can change it
         facets = tryCatch(cd2030.core::chart_facet_info(r$value), error = function(e) NULL))
  } else if (identical(r$type, "table")) {
    html <- as.character(flextable::htmltools_value(r$value))
    rows <- tryCatch(flextable::nrow_part(r$value, "body"), error = function(e) 8)
    list(sig = sig, html = html, w = size[1], h = 0.6 + rows * 0.28)
  } else {
    list(sig = sig, error = r$message %||% "", w = size[1], h = size[2])
  }
}

# A kind of chart drawn small with its first settings, as a picture for the blocks panel (NULL when it cannot be drawn
# with this dataset). A kind drawn for one region is drawn for the first.
cd_report_thumb <- function(cache, kind, i18n, design = NULL) {
  b <- utils::modifyList(list(id = paste0("thumb_", kind$kind), type = "chart", kind = kind$kind, size = "third"), kind$defaults %||% list())
  if (identical(b$region, "@report")) b$region <- cd_report_regions(cache)[1]
  # a thumbnail is too small for text: the chart's shape only, without titles, axis labels, legend or data labels
  hide <- c("show_title", "show_subtitle", "show_caption", "show_x_title", "show_y_title", "show_x_text", "show_y_text",
            "show_legend", "show_labels", "show_strips")
  b$options <- utils::modifyList(b$options %||% list(), stats::setNames(as.list(rep(FALSE, length(hide))), hide))
  b$caption <- FALSE
  r <- cd2030.core::with_report_chart_options(cache, cd2030.core::render_report_block(cache, b, i18n, design), design = design)
  if (!identical(r$type, "plot")) return(NULL)
  f <- tempfile(fileext = ".png")
  on.exit(unlink(f), add = TRUE)
  ok <- tryCatch({ cd2030.core::save_report_chart(r, b, f, dpi = 90, design = design); TRUE }, error = function(e) FALSE)
  if (!ok || !file.exists(f)) return(NULL)
  paste0("data:image/png;base64,", jsonlite::base64_enc(readBin(f, "raw", file.info(f)$size)))
}

# The report's pages as they will be printed: the Word file is written, turned into a PDF by Word or LibreOffice, and each
# page is sent as a picture
cd_report_final <- function(cache, project, i18n, message) {
  if (is.null(project)) return(invisible())
  project <- cd_report_with_template(cache, project)
  progress <- function(x) message("cd-report-final", list(status = "running", pct = x))
  progress(0)
  result <- tryCatch(cd2030.core::report_final_pages(cache, project, i18n = i18n, dpi = 110, progress = progress),
                     error = function(e) conditionMessage(e))
  if (is.character(result)) {
    message("cd-report-final", list(status = "error", message = result, noConverter = is.null(cd2030.core::report_converter())))
    return(invisible())
  }
  on.exit(unlink(dirname(result$pdf), recursive = TRUE), add = TRUE)
  pages <- lapply(result$pages, function(f) paste0("data:image/png;base64,", jsonlite::base64_enc(readBin(f, "raw", file.info(f)$size))))
  message("cd-report-final", list(status = "done", pages = pages, converter = result$converter))
}

# A PowerPoint file's slide designs with their pictures (logos, a background photo) kept once in the dataset, as the
# report's pictures are ("asset:<prefix>_<n>" in `src`): the editor draws them, and cd_report_with_template() writes them
# out again for the export. A picture over 5 MB is left out.
cd_report_designs_store <- function(cache, designs, prefix) {
  if (!is.list(designs)) return(NULL)
  n <- 0
  lapply(designs, function(d) {
    if (!is.list(d)) return(d)
    d$decor <- Filter(Negate(is.null), lapply(d$decor %||% list(), function(item) {
      if (!identical(item$type, "image")) return(item)
      f <- item$file
      if (!is.character(f) || !file.exists(f) || file.info(f)$size > 5e6) return(NULL)
      type <- switch(tolower(tools::file_ext(f)), png = "image/png", gif = "image/gif", "image/jpeg")
      n <<- n + 1
      id <- paste0(prefix, "_", n)
      cache$set_report_asset(id, list(type = type, data = readBin(f, "raw", file.info(f)$size)))
      item$src <- paste0("asset:", id)
      item$file <- NULL
      item
    }))
    # what a file does not set is left out (NULL would reach the editor as {})
    d$decor <- lapply(d$decor, function(item) Filter(Negate(is.null), item))
    for (k in c("title", "subtitle", "body")) if (is.list(d[[k]])) d[[k]] <- Filter(Negate(is.null), d[[k]])
    Filter(Negate(is.null), d)
  })
}

# The ids of the slide designs' pictures kept in the dataset
cd_report_design_asset_ids <- function(designs) {
  if (!is.list(designs)) return(character())
  ids <- unlist(lapply(designs, function(d) lapply(if (is.list(d)) d$decor else NULL, function(item) {
    if (is.character(item$src) && startsWith(item$src, "asset:")) sub("^asset:", "", item$src)
  })))
  unique(as.character(ids))
}

# The slide designs' pictures (kept in the dataset, or data URIs) written to files, as cd2030.core draws them
cd_report_designs_files <- function(cache, designs) {
  if (!is.list(designs)) return(designs)
  lapply(designs, function(d) {
    if (!is.list(d)) return(d)
    d$decor <- lapply(d$decor %||% list(), function(item) {
      src <- item$src
      if (!identical(item$type, "image") || !is.character(src)) return(item)
      if (startsWith(src, "asset:")) {
        asset <- tryCatch(cache$report_assets[[sub("^asset:", "", src)]], error = function(e) NULL)
        if (is.null(asset)) return(item)
        ext <- if (grepl("png", asset$type %||% "")) ".png" else if (grepl("gif", asset$type %||% "")) ".gif" else ".jpg"
        f <- tempfile("slide_design_", fileext = ext)
        writeBin(asset$data, f)
        item$file <- f
        item$src <- NULL
        return(item)
      }
      if (!startsWith(src, "data:")) return(item)
      ext <- if (grepl("^data:image/png", src)) ".png" else if (grepl("^data:image/gif", src)) ".gif" else ".jpg"
      f <- tempfile("slide_design_", fileext = ext)
      writeBin(jsonlite::base64_dec(sub("^data:[^,]*,", "", src)), f)
      item$file <- f
      item$src <- NULL
      item
    })
    d
  })
}

# A report whose theme came from an Office file: its template, written out for cd2030.core to start from (and its
# slide designs' pictures)
cd_report_with_template <- function(cache, project) {
  if (is.list(project$design$slide_designs)) project$design$slide_designs <- cd_report_designs_files(cache, project$design$slide_designs)
  tpl <- project$design$template
  if (!is.character(tpl) || !startsWith(tpl, "asset:")) return(project)
  asset <- tryCatch(cache$report_assets[[sub("^asset:", "", tpl)]], error = function(e) NULL)
  if (is.null(asset)) {
    project$design$template <- NULL
    return(project)
  }
  path <- tempfile(fileext = paste0(".", project$design$template_ext %||% project$design$template_kind %||% "pptx"))
  writeBin(asset$data, path)
  project$design$template <- path
  project
}

cd_report_export <- function(session, cache, project, format, i18n, translator, message, state) {
  if (is.null(project)) return(invisible())
  project <- cd_report_with_template(cache, project)
  # a document is written as Word or PDF, a slide deck as PowerPoint or PDF
  format <- if (isTRUE(format %in% c("docx", "pdf", "pptx"))) format else "docx"
  if (cd_report_is_deck(project) && format == "docx") format <- "pptx"
  if (!cd_report_is_deck(project) && format == "pptx") format <- "docx"
  stages <- list(draw = "lbl_rb_stage_draw", write = switch(format, pdf = "lbl_rb_stage_pdf", pptx = "lbl_rb_stage_pptx", "lbl_rb_stage_word"))
  progress <- function(x) {
    message("cd-report-export", list(status = "running", format = format, pct = x,
                                      stage = cd_text(i18n, if (x < 0.8) stages$draw else stages$write)))
  }
  country <- tryCatch(cache$country, error = function(e) "") %||% ""
  file <- tempfile(fileext = paste0(".", format))
  made_by <- NULL
  result <- tryCatch({
    made_by <- attr(cd2030.core::export_report(cache, project, file, format = format, i18n = translator, progress = progress), "converter")
    TRUE
  }, error = function(e) conditionMessage(e))
  if (!isTRUE(result)) {
    message("cd-report-export", list(status = "error", format = format, message = result))
    return(invisible())
  }
  name <- gsub("[^A-Za-z0-9]+", "_", paste(country, project$name))
  state$file <- file
  state$file_name <- paste0(gsub("^_|_$", "", name), "_", format(Sys.Date()), ".", format)
  url <- paste0("session/", session$token, "/download/", session$ns("file"), "?w=")
  message("cd-report-export", list(status = "done", format = format, url = url, fileName = state$file_name, madeBy = made_by))
}

# The dataset's regions (admin level 1), sorted
cd_report_regions <- function(cache) {
  tryCatch(sort(unique(cache$subnational_regions$adminlevel_1)), error = function(e) character())
}

# A short key for "has this changed"
cd_report_key <- function(x) paste(utils::capture.output(dput(x)), collapse = "")
