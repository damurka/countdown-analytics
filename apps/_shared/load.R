# The shared Countdown UI, loaded by every app with:
#
#   source("../_shared/load.R")
#   cd_ui_load()
#
# See README.md in this folder for what lives where. In short:
#   R/core        translator state, asset/dependency helpers, small Shiny helpers
#   R/components  one R wrapper per React component (buttons, inputs, files, dialogs, feedback, ...)
#   R/layout      page, card, header, shell/sidebar and tab-panel builders
#   R/charts      plots, download buttons, chart/table download toolbars, chart options
#   R/filters     the filter inputs shared by both apps (admin level, indicator, population, years, denominator)
#   R/actions     page-level actions (help, notes, report)
#   www           cd-ui.css, fonts, cd-react/cd-react.js (built from ../../js with `npm run build`)
# It is laid out like an R package on purpose (R/ and www/), so it can be promoted to a real package later:
# R/ becomes the package's R/ and www/ becomes inst/www/.

# `dir`: the shared folder itself, for a caller that is not an app beside it (the component gallery in docs/gallery).
cd_ui_load <- function(env = globalenv(), dir = NULL) {
  if (is.null(dir)) dir <- Find(dir.exists, c(file.path("..", "_shared"), "_shared"))
  if (is.null(dir)) stop("The shared UI folder (_shared) was not found next to this app.", call. = FALSE)
  dir <- normalizePath(dir, winslash = "/")
  options(cd2030.ui_dir = dir)

  files <- sort(list.files(file.path(dir, "R"), pattern = "[.]R$", recursive = TRUE, full.names = TRUE))
  for (f in files) sys.source(f, envir = env, keep.source = FALSE)

  shiny::addResourcePath("cd-ui", file.path(dir, "www"))
  invisible(dir)
}
