# cd_card()'s own title/subtitle block (cd-dashboard.R) -- see CardHeader.tsx's own comment for why this is the
# one part of cd_card() that safely becomes a real React component. `title`/`subtitle`: raw translation KEYS
# (cd_card() extracts these itself, from whatever i18n$t()-produced tag its own caller passed -- see cd_key()
# below and cd_card()'s own comment), resolved into LocalText here via cd_text(), same convention as
# cd_field_select()/cd_chip_multi() and friends -- this re-translates live on a language switch (tr()/useLang(),
# CardHeader.tsx) the same way every other React text in the app already does. `icon`: a bare icon NAME (e.g.
# "chart-line", cd_card()'s own new `icon` param), resolved here the same way cd_download_status()'s own callers
# resolve theirs.
cd_card_header <- function(title, subtitle = NULL, icon = NULL, i18n = cd_i18n()) {
  cd_react_element("CardHeader", do.call(shiny.react::asProps, c(
    list(title = cd_text(i18n, title)),
    if (!is.null(subtitle)) list(subtitle = cd_text(i18n, subtitle)),
    if (!is.null(icon)) list(icon = cd_icon_class(icon))
  )))
}

# A chart card's whole cd_card(toolbar=) content -- Ask AI, a thin divider, THIS chart's own tool row
# (cd_plot_toolbar_ui()/cd_coverage_plot_toolbar_ui(), _shared/R/charts/plot-downloads.R), and the expand toggle --
# matching project/ReportingRate.dc.html's own card-header layout exactly. `chart_toolbar`: already-rendered UI
# for the one chart currently showing in that card (a single chart card passes its own directly; a tabbed card
# re-renders this via output$..., picking whichever tab's toolbar matches the currently active one).
cd_chart_toolbar <- function(chart_toolbar, i18n = cd_i18n()) {
  # cd-tool-optional (styles.css): everything here but Ask AI, its divider and the download-image button folds
  # away when the card is narrow (a half-width card in cd_card_row()), leaving those plus the "more tools" and
  # collapse buttons -- project/ReportingRate.dc.html's "National reporting rate" card. display: contents at normal width, so the
  # wrapper changes nothing about the flex layout.
  tagList(
    cd_ask_ai_button(i18n),
    div(class = "cd-card__toolbar-divider"),
    chart_toolbar,
    div(class = "cd-tool-optional", cd_expand_button(i18n = i18n)),
    cd_more_tools_button(),
    cd_collapse_chevron()
  )
}

# "More tools" toggle, also narrow-card only: reveals the .cd-tool-optional tools (Ask AI, view options, labels,
# data download, expand) in a row under the header instead of leaving them unreachable. Handled by the same
# document click listener as the collapse toggle (cd_app_ui(), _shared/R/layout/page.R and card.R), which flips
# .cd-card--tools-open on the card.
cd_more_tools_button <- function() {
  tags$button(
    type = "button", class = "cd-card__toggle cd-card__more", `data-cd-toggle` = "tools",
    `aria-label` = "More tools", `aria-expanded` = "false", shiny::icon("ellipsis")
  )
}

# Collapse toggle shown only in a narrow card's header (see cd_chart_toolbar()) -- same button and same click
# handler (cd_app_ui()'s .cd-card__toggle[data-cd-toggle="collapse"] listener) as cd_card(collapsible = TRUE)'s
# own, just an up-chevron that flips instead of a minus/plus.
cd_collapse_chevron <- function() {
  tags$button(
    type = "button", class = "cd-card__toggle cd-card__toggle--chevron", `data-cd-toggle` = "collapse",
    `aria-label` = "Collapse card", shiny::icon("chevron-up")
  )
}

# A cd_card() pre-wired for one chart (or a tabbed group of charts) -- explicit user request, after
# 1a_checks_reporting_rate.R had to hand-assemble `toolbar = cd_chart_toolbar(...)` and `width =`/`tabs =` at
# each of its own two chart cards separately: one named entry point instead, so a FUTURE chart-card page (or a
# later edit to this one) doesn't have to re-derive the same composition. `chart_toolbar`: already-rendered UI
# for the one chart currently showing (cd_plot_toolbar_ui()/cd_coverage_plot_toolbar_ui(), or a uiOutput()
# that resolves to one of those, for a tabbed card whose visible chart changes -- see
# 1a_checks_reporting_rate.R's own output$subnational_toolbar for that pattern). `tabs`: this card's own tab
# strip (cd_tab_strip()), when it has one. `width`: cd_card()'s own default (6) applies unless overridden, same as
# a bare cd_card() call -- NOT forced to NULL/full-width, which would silently change every caller that relies on
# the default without saying so.
cd_chart_card <- function(title, chart_toolbar, ..., i18n = cd_i18n(), tabs = NULL, width = 6, icon = NULL) {
  cd_card(
    title = title,
    icon = icon,
    width = width,
    toolbar = cd_chart_toolbar(chart_toolbar, i18n),
    tabs = tabs,
    ...
  )
}

# A table card's own header toolbar -- explicit user request ("table should have download for data at the
# top and ... expand"), matching project/ReportingRate.dc.html's own table card exactly: its header carries
# ONE icon button (Download table as Excel), nothing else -- no Ask AI/divider, unlike cd_chart_toolbar()
# (deliberately not reused here, per cd_table_card()'s own comment below). The expand toggle is not in that
# mockup card, but is the same request, applied consistently with the chart card's own toolbar just above.
# `table_toolbar`: already-rendered UI for this table's own action(s) -- cd_download_button_ui(), currently the
# only caller (cd_table_ui(), _shared/R/charts/table-downloads.R).
cd_table_toolbar <- function(table_toolbar = NULL, i18n = cd_i18n()) {
  tagList(
    table_toolbar,
    cd_expand_button(i18n = i18n)
  )
}

# A cd_card() for a table -- explicit user request, alongside cd_chart_card() above, so both card KINDS have one
# obvious, separately-named place for their own header-toolbar convention (a table card's own natural toolbar
# -- a filter chip, a download button -- is nothing like a chart card's, so this deliberately does NOT reuse
# cd_chart_toolbar()) without the two ever needing to share one signature. cd_table_ui() (ui/download/
# table_download.R) already goes through this instead of calling cd_card() directly. `table_toolbar`: NULL (the
# default) renders a bare header, same as before this param existed -- additive, every other caller unaffected.
cd_table_card <- function(title, ..., i18n = cd_i18n(), table_toolbar = NULL, width = 6) {
  cd_card(title = title, width = width, toolbar = cd_table_toolbar(table_toolbar, i18n), ...)
}

cd_card_row <- function(...) {
  div(class = "cd-card-row", ...)
}

cd_tab_strip <- function(ns, tabs, active) {
  div(
    role = "tablist",
    class = "cd-card__tabs",
    lapply(names(tabs), function(key) {
      is_active <- identical(key, active)
      # A real <button>, not actionLink()'s <a> -- these switch content in place, they don't navigate anywhere.
      # "action-button" is what makes Shiny treat a click as input$<id> (a click counter), same as actionLink().
      tags$button(
        id = ns(paste0("tab_", key)), type = "button",
        class = paste("action-button cd-card__tab", if (is_active) "cd-card__tab--active" else NULL),
        role = "tab", `aria-selected` = if (is_active) "true" else "false",
        tabs[[key]]
      )
    })
  )
}

#' @param toolbar Optional -- extra controls (e.g. cd_ask_ai_button(), icon buttons) shown top-right of the
#'   header, beside the title. Grouped with the collapse toggle into one flex item (.cd-card__header-actions,
#'   styles.css) so both stay pinned right regardless of which of the two are actually present.
#' @param tabs Optional -- a tab strip (cd_tab_strip(), content_dashboard.R) rendered directly under the
#'   header, before the body. Explicit user request, project/ReportingRate.dc.html (the "compact filter bar"
#'   mockup): both are additive, so every OTHER existing cd_card() call (~15 module files) renders identically to
#'   before -- neither argument does anything unless a caller passes it.
#' @param width Accepted and ignored. A cd_card() is always a plain, full-width block; two cards sharing one row
#'   is cd_card_row()'s job (content_dashboard.R, a CSS grid). Kept so existing calls that pass width = 6/12 still work.
#' @param icon Optional icon NAME (e.g. "chart-line", not a resolved class) shown before the title -- only
#'   applies when `title` goes through the React path below; ignored otherwise, same as every other
#'   title-only option would be for a caller supplying its own markup.
#' @param i18n Translator, used only to resolve `title`/`subtitle` for the React path (cd_card_header()) --
#'   every current caller already has one in scope, so this rarely needs to be passed explicitly.
cd_card <- function(..., title = NULL, subtitle = NULL, footer = NULL, status = NULL, solidHeader = FALSE,
                 background = NULL, width = NULL, height = NULL, collapsible = FALSE, collapsed = FALSE,
                 toolbar = NULL, tabs = NULL, icon = NULL, i18n = cd_i18n()) {
  boxClass <- "cd-card"
  if (solidHeader || !is.null(background)) boxClass <- paste(boxClass, "cd-card--solid")
  if (!is.null(status)) boxClass <- paste0(boxClass, " cd-card--", status)
  if (collapsible && collapsed) boxClass <- paste(boxClass, "cd-card--collapsed")
  if (!is.null(tabs)) boxClass <- paste(boxClass, "cd-card--tabbed")
  if (!is.null(background)) boxClass <- paste0(boxClass, " cd-card--bg-", background)
  style <- if (!is.null(height)) paste0("height: ", htmltools::validateCssUnit(height)) else NULL

  # cd_card_header() (a real React component, CardHeader.tsx) -- explicit user request, "replace cd_card() ...
  # create custom components". cd_key(title), not is.character(title): title is essentially NEVER a plain
  # string at a real call site -- every caller passes i18n$t("...") itself, and (confirmed live: the icon
  # prop silently never rendered until this was fixed) that returns a live-retranslatable
  # <span data-key="..."> tag, not a string -- usei18n()'s own client-side DOM-rescan mechanism, unrelated to
  # cd_text()/tr()/useLang(), which is what a React prop needs instead. cd_key() (below) unwraps that tag back
  # to its own key (or passes a genuinely-raw string straight through unchanged, so that keeps working too);
  # cd_card_header() resolves the key into LocalText itself. The one exception, 1a_checks_reporting_rate.R's own
  # `title = uiOutput(...)`, is a genuinely reactive Shiny render target with no key to extract at all (a
  # plain tag, no data-key attribute) -- cd_key() returns NULL for it, correctly falling through to this exact
  # plain-HTML path below, permanently, not as a stopgap.
  title_key <- cd_key(title)
  subtitle_key <- if (!is.null(subtitle)) cd_key(subtitle) else NULL
  can_react_header <- is.character(title_key) && length(title_key) == 1 &&
    (is.null(subtitle) || (is.character(subtitle_key) && length(subtitle_key) == 1))
  titleTag <- if (!is.null(title)) {
    if (can_react_header) {
      cd_card_header(title_key, subtitle = subtitle_key, icon = icon, i18n = i18n)
    } else if (is.null(subtitle)) {
      tags$h3(class = "cd-card__title", title)
    } else {
      div(
        class = "cd-card__heading",
        tags$h3(class = "cd-card__title", title),
        div(class = "cd-card__subtitle", subtitle)
      )
    }
  } else NULL
  collapseTag <- if (collapsible) {
    tags$button(
      type = "button", class = "cd-card__toggle", `data-cd-toggle` = "collapse",
      shiny::icon(if (collapsed) "plus" else "minus")
    )
  } else NULL
  toolbarTag <- if (!is.null(toolbar)) div(class = "cd-card__toolbar", toolbar) else NULL
  actionsTag <- if (!is.null(toolbarTag) || !is.null(collapseTag)) {
    div(class = "cd-card__header-actions", toolbarTag, collapseTag)
  } else NULL
  headerTag <- if (!is.null(titleTag) || !is.null(actionsTag)) div(class = "cd-card__header", titleTag, actionsTag) else NULL

  div(
    class = boxClass, style = style,
    headerTag,
    tabs,
    div(class = "cd-card__body", ...),
    if (!is.null(footer)) div(class = "cd-card__footer", footer)
  )
}
