# One leaf link (tabName set) or one collapsible group (children set, tabName left NULL). `requires_adjustment`:
# explicit user request ("if data is not adjusted it cannot generate analysis, so continue to have grayed out
# ... on the sidemenu from denominator down till adjustment is done") -- locks this item (and, since
# Sidebar.tsx resolves it once per top-level item and passes the SAME resolved value down through its own
# existing recursion, every child underneath it too) against app.R's own stricter `analysis_ready` reactive
# instead of the plain `data_ready` every other item still uses. Only ever set on a section's own TOP-level
# items in app.R (Denominators' two leaf items, Analysis's six group items) -- there is no need to also mark
# each descendant individually.
cd_nav_item <- function(label, tabName = NULL, icon = NULL, i18n = cd_i18n(), children = NULL, requires_adjustment = FALSE) {
  list(
    key = tabName %||% paste(c(label, sample.int(1e6, 1)), collapse = "-"),
    tabName = tabName,
    label = cd_text(i18n, label),
    icon = cd_icon_class(icon),
    children = children,
    requiresAdjustment = requires_adjustment
  )
}

# A section: an uppercase label ("DATA QUALITY") over a run of nav items.
cd_nav_section <- function(label, ..., i18n = cd_i18n()) {
  list(label = cd_text(i18n, label), items = list(...))
}

# The header row: three grid columns (see .cd-navbar in styles.css) -- toggle + breadcrumb pinned left, the
# dataset pill centered on the row's full width regardless of how wide the left/right content are, and
# language + Ask AI + Download report pinned right. A pair of flex-grow spacers can't do that (they'd center
# the pill only in the space left over between two specific siblings, not on the row as a whole), so this is a
# CSS grid rather than more flex, with the right-hand trio grouped in one wrapper so it lands in one grid cell.
cd_app_bar <- function(app_name, app_version) {
  tags$header(
    class = "cd-shell__header",
    span(
      class = "cd-shell__brand cd-brand",
      # The Countdown logo (three figures), the same in every app and theme.
      tags$img(class = "cd-brand__mark", src = "cd-ui/countdown-mark.png", alt = "Countdown", width = "36", height = "36"),
      tags$span(
        tags$span(class = "cd-brand__name", "Countdown"),
        tags$span(class = "cd-brand__version", paste0(app_name, " · v", app_version))
      )
    ),
    tags$nav(
      class = "cd-navbar", role = "navigation",
      uiOutput("cd_header_crumb", container = tags$span, class = "cd-header-crumb"),
      uiOutput("header_pill", container = tags$span, class = "cd-header-pill-slot"),
      div(
        class = "cd-header-right",
        uiOutput("cd_header_actions", container = tags$span, class = "cd-header-actions"),
        uiOutput("download_buttons", container = tags$span, class = "cd-header-download-slot")
      )
    )
  )
}

# The sidebar: React (nav tree and the documentation footer link; the brand mark lives in the header's brand
# cell instead, which is already sized to the sidebar's width).
cd_sidebar <- function() {
  tags$aside(class = "cd-shell__sidebar", uiOutput("cd_sidebar_nav"))
}

# Renders the three React roots above. Called once from the server with the nav tree built in cd_nav_section()/
# cd_nav_item(); the header crumb/actions outputs don't depend on anything reactive, so those two render once
# as before. The sidebar nav (Phase 9, sidebar locking) is the one exception: `data_ready`, a reactive(logical)
# from app.R (the exact same "cache() exists AND cache()$countdown_data exists" condition every page module's
# own `active = page_is(...)` already gates its real computation on -- see page_is()'s own comment in app.R for
# why that reads `countdown_data`, not `quality_confirmed`) -- so every item except Introduction/Load Data
# (nav.ts's own ALWAYS_UNLOCKED_TABS) locks until a dataset has actually finished loading, and unlocks live the
# moment it has, without a page reload. `analysis_ready`: a second, stricter reactive(logical) -- explicit user
# request, "if data is not adjusted it cannot generate analysis" -- for whichever items cd_nav_item() marked
# `requires_adjustment = TRUE` (Denominators and Analysis, app.R's own cd_nav_sections); everything else
# (Data Quality/Remove Years/Data Adjustment itself) still only needs `data_ready`, so the user can actually
# reach the page that performs the adjustment. Defaults to `data_ready` so a caller that never adjusts data at
# all (none currently do) doesn't have to pass a second, identical reactive just to satisfy this parameter.
cd_shell_server <- function(output, sections, initial_tab, data_ready, analysis_ready = data_ready, i18n = cd_i18n(), docs_href = NULL) {
  stopifnot(is.reactive(data_ready))
  stopifnot(is.reactive(analysis_ready))

  output$cd_header_crumb <- renderUI({
    cd_react_element("HeaderBreadcrumb", shiny.react::asProps(sections = sections))
  })

  output$cd_header_actions <- renderUI({
    cd_react_element("HeaderActions", shiny.react::asProps(
      askAiLabel = "Ask AI",
      askAiHint = cd_text(i18n, "lbl_ask_ai_soon"),
      # flag: a Unicode regional-indicator flag emoji, not an image/icon font -- renders everywhere text does,
      # no asset or icon-set dependency, and is the fastest visual cue for "which language is this" (HeaderBar.tsx).
      languages = list(
        list(key = "en", text = "EN", flag = "\U0001F1EC\U0001F1E7"),
        list(key = "fr", text = "FR", flag = "\U0001F1EB\U0001F1F7"),
        list(key = "pt", text = "PT", flag = "\U0001F1F5\U0001F1F9")
      )
    ))
  })

  output$cd_sidebar_nav <- renderUI({
    cd_react_element("Sidebar", shiny.react::asProps(
      sections = sections,
      initialTab = initial_tab,
      docsLabel = cd_text(i18n, "title_documentation"),
      docsHref = docs_href,
      dataReady = isTRUE(data_ready()),
      analysisReady = isTRUE(analysis_ready())
    ))
  })
}
