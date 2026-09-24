# A chart with its tools: the plot, the customize panel, the image download and the data download.
#
# The tool row is factored out of cd_plot_ui() so a page can place it somewhere other than the chart's own overlay corner (a card
# header, via cd_card()'s `toolbar` argument) with cd_plot_toolbar_ui(). Both resolve to the same ids (NS(id)); Shiny only cares
# that ids match between UI and server, so cd_plot_server() needs no changes for a page that splits them apart.
cd_plot_toolbar_content <- function(ns) {
  tagList(
    div(class = "cd-tool-optional", cd_chart_customize(ns("customize"))),
    cd_download_button_ui(ns("download_plot")),
    div(class = "cd-tool-optional", cd_download_button_ui(ns("download_data")))
  )
}

cd_plot_toolbar_ui <- function(id) {
  cd_plot_toolbar_content(NS(id))
}

# toolbar_inline: FALSE (the default) renders the tool row as this function's own overlay; TRUE skips it -- the caller places
# cd_plot_toolbar_ui(id) itself (e.g. a cd_card() `toolbar=`).
cd_plot_ui <- function(id, toolbar_inline = FALSE) {
  ns <- NS(id)

  div(
    class = "cd-plot-wrap",
    cd_plot_output(ns("plot")),
    if (!toolbar_inline) div(class = "cd-toolbox", cd_plot_toolbar_content(ns))
  )
}

cd_plot_server <- function(
  id,
  i18n,
  # plot
  plot_data, # reactive
  plot_fun, # function(data) -> draws plot (or returns ggplot object)
  plot_filename = reactive("plot"),
  # plot download
  plot_label_key = "btn_global_download_plot",
  plot_extension = reactive("png"),
  # data download (excel)
  data_label_key = "btn_global_download_data",
  data_extension = reactive("xlsx"),
  excel_write_fun = NULL, # function(wb, data) writes workbook
  # or, for the data on one sheet, the translation keys of its sheet name and (optional) title -- see cd_sheet_writer()
  excel_sheet = NULL,
  excel_title = NULL
) {
  if (is.null(excel_write_fun) && !is.null(excel_sheet)) excel_write_fun <- cd_sheet_writer(i18n, excel_sheet, excel_title)
  moduleServer(
    id = id,
    module = function(input, output, session) {
      # What the user changed about how this chart looks lives in the dataset. For the screen: cache$set_chart_options(<chart id>, ...)
      # (the id is the module path). For the generated report: cache$set_chart_options("report/<chart id>", ...), where the chart id
      # (cd2030.core::cd_chart_id()) is made from the data the chart draws, so the report finds the same chart by the same id; a chart whose
      # data does not say what it is falls back to its type of graph (cd_chart_type()). cd_app()
      # puts the cache reactive in session$userData$cd_cache; a page without one (the gallery, pooled) just has none stored.
      chart_id <- sub("-$", "", session$ns(""))
      chart_key <- reactive({
        tryCatch(cd2030.core::cd_chart_id(plot_data()) %||% cd2030.core::cd_chart_type(plot_obj()), error = function(e) NULL)
      })
      report_id <- reactive(if (is.null(chart_key())) NULL else paste0("report/", chart_key()))
      chart_cache <- session$userData$cd_cache
      current_cache <- function() if (is.null(chart_cache)) NULL else tryCatch(isolate(chart_cache()), error = function(e) NULL)
      stored <- function(which) {
        cache <- current_cache()
        if (is.null(cache)) return(NULL)
        opts <- tryCatch(cache$chart_options[[which]], error = function(e) NULL)
        if (is.null(opts) || !length(opts)) NULL else opts
      }

      # The plot as its function draws it; the customize panel changes how it is drawn, never what it shows.
      plot_obj <- reactive({
        req(plot_data())
        plot_fun(plot_data())
      })

      # What the panel holds. Until it has reported (or been handed the stored values when it mounted) the stored options are
      # used, so a chart drawn before its panel is on screen already looks as the user left it. Only the screen's values change the
      # chart on screen; the report's are kept for generate_report().
      panel <- reactiveValues(loaded = FALSE, screen = NULL, report = NULL)
      observeEvent(input$customize, {
        panel$screen <- cd_panel_to_options(input$customize$screen)
        panel$report <- cd_panel_to_options(input$customize$report)
        panel$loaded <- TRUE
      }, ignoreInit = TRUE, ignoreNULL = FALSE)
      chart_options <- reactive(if (panel$loaded) panel$screen else stored(chart_id))

      layout <- reactive(cd_chart_layout(plot_obj(), chart_options()$flip))
      final_plot <- reactive(cd_apply_chart_options(plot_obj(), chart_options(), layout()))

      output$plot <- cd_render_plot(
        {
          p <- plot_obj()
          lay <- layout()

          # Tell the panel about this chart: its own text (placeholders), its legend entries and categories, and what Auto did
          # for its orientation. This runs inside the render on purpose: a render only runs for a chart that is on screen, so
          # charts on pages nobody has opened are never built just to fill in a panel.
          editable <- inherits(p, "ggplot")
          cd_update_input("customize", session,
            chartId = chart_key() %||% "",
            defaults = if (editable) cd_chart_label_defaults(p) else list(),
            entries = if (editable) cd_chart_entries(p) else list(),
            autoNote = if (lay$auto && isTRUE(lay$flip)) cd_text(i18n, "lbl_chart_auto_down") else "")

          final_plot()
        },
        # cd_plot_client_height() (render-plot.R) grows past this chart's natural height when the client reports more room (the
        # expand button's full-screen toggle).
        height = function() cd_plot_client_height(tryCatch(layout()$height, error = function(e) 400))
      )

      # Stored -> panel: each time the panel mounts (a tabbed card re-mounts its tools on every tab), hand it what is stored.
      # `pushed` remembers it, so the echo is not saved again.
      pushed <- new.env(parent = emptyenv())
      observeEvent(input$customize__mounted, {
        screen <- stored(chart_id)
        report <- if (!is.null(report_id())) stored(report_id())
        if (is.null(screen) && is.null(report)) return()
        value <- list(screen = cd_options_to_panel(screen), report = cd_options_to_panel(report))
        pushed$value <- value
        panel$screen <- screen
        panel$report <- report
        panel$loaded <- TRUE
        cd_update_input("customize", session, value = value)
      })

      # Panel -> stored
      observeEvent(input$customize, {
        cache <- current_cache()
        if (is.null(cache) || identical(input$customize, pushed$value)) return()
        cache$set_chart_options(chart_id, if (length(panel$screen)) panel$screen else NULL)
        if (!is.null(report_id()) && (length(panel$report) || !is.null(stored(report_id())))) {
          cache$set_chart_options(report_id(), if (length(panel$report)) panel$report else NULL)
        }
      }, ignoreInit = TRUE, ignoreNULL = FALSE)

      cd_download_button_server(
        id = "download_plot",
        filename = plot_filename,
        extension = plot_extension,
        data = plot_data,
        i18n = i18n,
        label = plot_label_key,
        icon = "camera",
        button_class = "cd-tool-btn",
        content = function(file, d) {
          # The image carries the same changes as the screen.
          drawn <- plot_fun(d)
          opts <- isolate(chart_options())
          lay <- cd_chart_layout(drawn, opts$flip)
          p <- cd_apply_chart_options(drawn, opts, lay)
          height_px <- max(2160, round(lay$height / 400 * 2160 * 0.75))
          if (inherits(p, "ggplot")) {
            ggsave(file, plot = p, width = 3840, height = height_px, dpi = 300, units = "px")
          } else {
            # a base-graphics plot: it has just been drawn, so save what is on the device
            ggsave(file, width = 3840, height = 2160, dpi = 300, units = "px")
          }
        }
      )

      if (!is.null(excel_write_fun) && is.function(excel_write_fun)) {
        cd_download_button_server(
          id = "download_data",
          filename = plot_filename,
          extension = data_extension,
          data = plot_data,
          i18n = i18n,
          label = data_label_key,
          icon = "table",
          button_class = "cd-tool-btn",
          content = function(file, d) {
            wb <- createWorkbook()
            excel_write_fun(wb, d) # IMPORTANT: d is already evaluated data (not reactive)
            saveWorkbook(wb, file, overwrite = TRUE)
          }
        )
      }
    }
  )
}
