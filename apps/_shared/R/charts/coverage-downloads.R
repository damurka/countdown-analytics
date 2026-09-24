cd_coverage_plot_ui <- function(id, toolbar_inline = FALSE) {
  ns <- NS(id)
  cd_plot_ui(ns("plot"), toolbar_inline = toolbar_inline)
}

# The companion to cd_coverage_plot_ui(id, toolbar_inline = TRUE) -- see cd_plot_toolbar_ui()'s own comment
# (plot_download.R) for why a caller needs this at all: with toolbar_inline = TRUE, cd_coverage_plot_ui() no
# longer renders its own tool row, so something has to render cd_plot_toolbar_ui() at the SAME nested id
# (ns("plot")) somewhere else instead -- this is that, mirroring cd_coverage_plot_ui()'s own nesting exactly.
cd_coverage_plot_toolbar_ui <- function(id) {
  ns <- NS(id)
  cd_plot_toolbar_ui(ns("plot"))
}

cd_coverage_plot_server <- function(id, filename, data_fn, ..., sheet_name, i18n, plot_fun = NULL) {
  stopifnot(is.reactive(data_fn))
  stopifnot(is.reactive(filename))
  stopifnot(is.reactive(sheet_name))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      cd_plot_server(
        id = "plot",
        i18n = i18n,
        plot_data = data_fn,
        plot_filename = filename,
        plot_fun = if (is.null(plot_fun)) function(d) plot(d, ...) else plot_fun,
        excel_write_fun = function(wb, d) cd_add_sheet(wb, sheet_name(), d)
      )
    }
  )
}
