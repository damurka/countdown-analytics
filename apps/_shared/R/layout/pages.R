# The page registry machinery. An app lists its analysis pages once, with cd_page_def() (apps/<app>/pages.R), and
# registers the list with cd_use_pages(). From then on:
#   - a page module's UI is  cd_page_ui(id, i18n, filters = ..., <cards>)  -- title, section, subtitle, denominator
#     row and report button all come from its registry entry, never from the module;
#   - app.R builds every page container with cd_pages_ui() and starts every server with cd_pages_server().

# One page. `ui`/`server` are the page module's functions (ui(id, i18n, ...), server(id, cache, i18n, ..., active)).
# title/section/subtitle are translation keys. `help`: c(<docs chapter>, <section>) for the Get help button.
# `report`: the page's standard report (cd2030.core::report_presets()), started in the report builder by the page's
#   "Generate report" button; NULL when the page has none. The button is shown only in an app with the Reports page.
# `server_args`: extra arguments after (id, cache, i18n). `active = FALSE`: the server takes no `active` argument.
cd_page_def <- function(id, ui, server, title, section, subtitle, help = NULL, denominator = FALSE, report = NULL,
                        server_args = list(), active = TRUE) {
  list(id = id, ui = ui, server = server, title = title, section = section, subtitle = subtitle, help = help,
       denominator = denominator, report = report, server_args = server_args, active = active)
}

cd_use_pages <- function(pages) {
  assign("pages", stats::setNames(pages, vapply(pages, function(p) p$id, character(1))), envir = .cd_state)
}

cd_page_meta <- function(id) {
  page <- get0("pages", envir = .cd_state, inherits = FALSE)[[id]]
  if (is.null(page)) stop("Page '", id, "' is not in the page registry (pages.R).", call. = FALSE)
  page
}

# The whole page for a module: `id` is the module's own id (= the page id). `filters`: cd_filter_bar(...).
cd_page_ui <- function(id, i18n, ..., filters = NULL) {
  page <- cd_page_meta(id)
  cd_page_body(
    dashboardId = NS(id)("page"),
    dashboardTitle = i18n$t(page$title),
    eyebrow = page$section,
    subtitle = page$subtitle,
    include_denominator = isTRUE(page$denominator),
    include_report = !is.null(page$report) && cd_has_reports(),
    i18n = i18n,
    filters = filters,
    ...
  )
}

# The page containers for every registered page, ready for cd_screens().
cd_pages_ui <- function(pages, i18n) {
  lapply(pages, function(page) cd_screen(tabName = page$id, page$ui(page$id, i18n)))
}

# Starts every page's server plus its header (help, report, notes) -- so a module never wires its own header.
# `page_is(id)`: app.R's reactive "is this page open with data loaded".
cd_pages_server <- function(pages, cache, i18n, page_is) {
  for (page in pages) {
    local({
      p <- page
      args <- c(list(p$id, cache, i18n), p$server_args, if (isTRUE(p$active)) list(active = page_is(p$id)))
      do.call(p$server, args)
      moduleServer(p$id, function(input, output, session) {
        cd_page_header_server("page", cache = cache, path = p$help[1], section = if (length(p$help) > 1) p$help[2],
                              i18n = i18n, key = p$report %||% p$id)
      })
    })
  }
  invisible(NULL)
}
