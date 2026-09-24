# Page structure and cards: cd_card(), cd_screens(), cd_screen(), cd_app_body(), cd_app_ui(). These are plain
# functions in the app's own environment, and every element they emit uses the app's own class names (cd-shell*,
# cd-card*, cd-page*) styled by _shared/www/cd-ui.css. cd_app_ui() sends jQuery (which Shiny needs) and the page
# chrome, and nothing else: no framework stylesheet or script. The sidebar's collapse and submenu behaviour lives
# in nav.ts, and page/tab switching in cd_screens()/cd_tab_panes().

#' @title A whole page: filter bar, page header, denominator row, content
#' @description The page assembled from its parts. Modules do not call this directly; they call cd_page_ui(), which
#'   fills in the title, section and subtitle from the page registry.
#' @param dashboardId Unique module ID
#' @param dashboardTitle Localized dashboard title
#' @param i18n Translator object
#' @param filters Optional cd_filter_bar(...) with the page's filter inputs
#' @param ... Page content, passed to cd_page_content()
cd_page_body <- function(dashboardId, dashboardTitle, i18n, ..., filters = NULL, include_report = FALSE,
                         include_notes = FALSE, include_help = TRUE, eyebrow = NULL, subtitle = NULL,
                         include_denominator = FALSE) {

  tagList(
    # The filter bar (if this page has one) comes first, attached to the app's own header rather than sitting
    # as an inset card below the page title -- see .cd-filterbar in styles.css for the full-bleed styling that
    # makes it look attached; the DOM order here is what makes "attached, then the page header below it" true.
    filters,

    # Header section with title and standard buttons
    cd_page_header(
      id = dashboardId,
      title = dashboardTitle,
      i18n = i18n,
      include_report = include_report,
      include_notes = include_notes,
      include_help = include_help,
      eyebrow = eyebrow,
      subtitle = subtitle,
      include_denominator = include_denominator
    ),

    # Main dashboard content: tab panels only now: the options box used to be threaded through here too
    cd_page_content(...)
  )

}

# A minimal tag check: just enough to catch a header/sidebar/body (or a page inside cd_screens()) passed in the
# wrong shape.
cd_tag_assert <- function(tag, type = NULL, class = NULL) {
  if (!inherits(tag, "shiny.tag")) stop("Expected an object with class 'shiny.tag'.")
  if (!is.null(type) && tag$name != type) stop("Expected tag to be of type ", type)
  if (!is.null(class)) {
    classes <- if (is.null(tag$attribs$class)) character(0) else strsplit(tag$attribs$class, " ")[[1]]
    if (!(class %in% classes)) stop("Expected tag to have class '", class, "'")
  }
}

cd_app_body <- function(...) {
  div(class = "cd-shell__content", tags$section(class = "cd-shell__page", ...))
}

# Top-level page switching: every page is mounted and exactly one is shown. .cd-page/.cd-page--active (styles.css)
# do the showing, toggled by nav.ts's setActiveTab(); Shiny's own suspend-when-hidden behaviour follows the pane's
# actual display:none. Page ids are "cd-page-<tabName>", which is how setActiveTab() finds a page.
cd_screens <- function(...) {
  # Pages may be passed one by one or as a list of pages (cd_pages_ui()).
  items <- unlist(lapply(list(...), function(x) if (inherits(x, "shiny.tag")) list(x) else x), recursive = FALSE)
  lapply(items, cd_tag_assert, class = "cd-page")
  div(class = "cd-pages", items)
}

cd_screen <- function(tabName = NULL, ...) {
  if (is.null(tabName)) stop("Need tabName")
  div(class = "cd-page", id = paste0("cd-page-", tabName), ...)
}

# header/sidebar/body: see cd_app_bar()/cd_sidebar() in cd-shell.R for what builds the first two.
cd_app_ui <- function(header, sidebar, body, title = NULL, theme = NULL) {
  # theme: NULL/"rmncah" (the default maroon), "vaccine" (blue) or "pooled" (green) -- see the App themes block at the
  # end of _shared/www/cd-ui.css.
  cd_tag_assert(header, type = "header", class = "cd-shell__header")
  cd_tag_assert(sidebar, type = "aside", class = "cd-shell__sidebar")
  cd_tag_assert(body, type = "div", class = "cd-shell__content")
  content <- div(class = "cd-shell", header, sidebar, body)
  tags$body(
    class = if (!is.null(theme) && !identical(theme, "rmncah")) paste0("cd-theme-", theme),
    # First in <body>, so the cover is in the very first paint -- put after the shell it let the header and sidebar
    # show for a moment before it appeared.
    cd_startup_loader(),
    # jQuery is what Shiny itself needs from the page; the base browser defaults are in _shared/www/cd-ui.css.
    tagList(
      jquerylib::jquery_core(3),
      tags$head(
        tags$meta(charset = "utf-8"),
        tags$meta(name = "viewport", content = "width=device-width, initial-scale=1"),
        if (!is.null(title)) tags$title(title)
      ),
      content
    ),
    # Card collapse (.cd-card__toggle): toggles .cd-card--collapsed and the body's visibility.
    tags$script(HTML("
      document.addEventListener('click', function(e) {
        var more = e.target.closest('.cd-card__more[data-cd-toggle=\"tools\"]');
        if (more) {
          var host = more.closest('.cd-card');
          if (host) more.setAttribute('aria-expanded', host.classList.toggle('cd-card--tools-open') ? 'true' : 'false');
          return;
        }
        var btn = e.target.closest('.cd-card__toggle[data-cd-toggle=\"collapse\"]');
        if (!btn) return;
        var card = btn.closest('.cd-card');
        if (!card) return;
        card.classList.toggle('cd-card--collapsed');
        var icon = btn.querySelector('i');
        if (icon && !btn.classList.contains('cd-card__toggle--chevron')) {
          icon.classList.toggle('fa-minus', !card.classList.contains('cd-card--collapsed'));
          icon.classList.toggle('fa-plus', card.classList.contains('cd-card--collapsed'));
        }
      });
    "))
  )
}

cd_page_content <- function(...) {
  div(class = 'content-body', div(class = 'wrapper-content', ...))
}
