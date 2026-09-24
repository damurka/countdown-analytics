# tools for this chart only (see _shared/R/charts/chart-options.R) -- factored out of cd_plot_ui() below so a
# page that wants them placed somewhere OTHER than the chart's own overlay corner (a card header, via cd_card()'s
# own `toolbar` argument, _shared/R/layout/page.R and card.R -- explicit user request, project/ReportingRate.dc.html)
# can render them there instead, through cd_plot_toolbar_ui() below. Both this and cd_plot_ui()'s
# own NS(id) resolve to the exact same ids regardless of which one actually renders them -- Shiny only cares
# that ids match between UI and server, not where in the page tree they physically sit -- so
# cd_plot_server() needs no changes at all for a page that splits them apart this way.
# cd_chart_view() before cd_chart_labels() -- explicit user request ("adjust the card with panel to be like the
# ones in your design"): the reference mockups agree on view-options (sliders) before edit-labels (T) 2 times
# out of 3 (project/PopulationTrend.dc.html, project/SubNationalReportingRate.dc.html's own "options open"
# state); only ReportingRate.dc.html's plain state shows the reverse, and this app had matched that one alone.
cd_plot_toolbar_content <- function(ns) {
  tagList(
    div(class = "cd-tool-optional", cd_chart_view(ns("view")), cd_chart_labels(ns("labels"))),
    cd_download_button_ui(ns("download_plot")),
    div(class = "cd-tool-optional", cd_download_button_ui(ns("download_data")))
  )
}

cd_plot_toolbar_ui <- function(id) {
  cd_plot_toolbar_content(NS(id))
}

# toolbar_inline: FALSE (the default, unchanged for every existing caller) renders the tool row as this
# function's own built-in overlay, exactly as before. TRUE skips that entirely -- the caller is expected to
# place cd_plot_toolbar_ui(id) somewhere itself instead (e.g. a cd_card() `toolbar=`).
cd_plot_ui <- function(id, toolbar_inline = FALSE) {
  ns <- NS(id)

  div(
    class = "cd-plot-wrap",
    # cd_plot_output() (render-plot.R) already wraps its own output in cd_spinner() -- this used to
    # double-wrap it in a second withSpinner() (harmless but redundant, confirmed pre-existing), dropped
    # while converting every withSpinner() call site to cd_spinner() (explicit user request).
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
      # The plot as its function draws it. The chart tools then change how it is drawn, never what it shows.
      plot_obj <- reactive({
        req(plot_data())
        plot_fun(plot_data())
      })

      # `input$labels` / `input$view`: what the user changed for this chart (NULL when nothing)
      layout <- reactive(cd_chart_layout(plot_obj(), input$view))
      final_plot <- reactive(cd_apply_chart_options(plot_obj(), input$labels, input$view, layout()))

      output$plot <- cd_render_plot(
        {
          p <- plot_obj()
          lay <- layout()

          # Tell the tools about this chart: its own text (placeholders in the label editor) and what Auto did.
          # This runs inside the render on purpose: a render only runs for a chart that is on screen, so charts on
          # pages nobody has opened are never built just to fill in a tool. The tools are mounted by then.
          editable <- inherits(p, "ggplot")
          cd_update_input("labels", session, editable = editable,
                       defaults = if (editable) cd_chart_label_defaults(p, flipped = lay$flipped) else list())
          cd_update_input("view", session,
                       autoNote = if (lay$auto && lay$flip) cd_text(i18n, "lbl_chart_auto_down") else "")

          final_plot()
        },
        # cd_plot_client_height() (render-plot.R): grows past this chart's own natural layout()$height when
        # the client reports more room (ExpandButton.tsx's fullscreen toggle) -- explicit user request, see
        # its own comment for why a plain height=function(){layout()$height} (this line's previous form)
        # left an expanded card's chart stuck at its normal size with empty space below it.
        height = function() cd_plot_client_height(tryCatch(layout()$height, error = function(e) 400))
      )

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
          # The image carries the same label and view changes as the screen.
          drawn <- plot_fun(d)
          lay <- cd_chart_layout(drawn, isolate(input$view))
          p <- cd_apply_chart_options(drawn, isolate(input$labels), isolate(input$view), lay)
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
