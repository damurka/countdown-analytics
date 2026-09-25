# The Countdown pages and wizard, loaded by every app with:
#
#   source("../_shared/load.R")
#   cd_ui_load()
#
# The interface they are built from (components, page frame, charts, the report builder) is the datasuite.ui package,
# which this attaches. What is left in this folder is Countdown's, and moves into cd2030.core next:
#   R/core        cd_app() (the frame with the Introduction and Load Data screens), cd_cfg()
#   R/layout      the page header's denominator row, scoped pages, indicator tab panels, the standard nav sections
#   R/charts      the coverage and table cards with their Countdown pickers
#   R/filters     the filter inputs (admin level, indicator, population, years, denominator, palette)
#   R/wizard      the Load Data wizard
#   R/modules     the analysis pages every Countdown app shares

# `dir`: the shared folder itself, for a caller that is not an app beside it (the component gallery in docs/gallery).
cd_ui_load <- function(env = globalenv(), dir = NULL) {
  if (is.null(dir)) dir <- Find(dir.exists, c(file.path("..", "_shared"), "_shared"))
  if (is.null(dir)) stop("The shared UI folder (_shared) was not found next to this app.", call. = FALSE)
  dir <- normalizePath(dir, winslash = "/")
  options(cd2030.ui_dir = dir)
  suppressPackageStartupMessages(library(datasuite.ui))

  files <- sort(list.files(file.path(dir, "R"), pattern = "[.]R$", recursive = TRUE, full.names = TRUE))
  for (f in files) sys.source(f, envir = env, keep.source = FALSE)
  invisible(dir)
}
