# Scoped pages: the "same analysis at a different geography" pages (national coverage vs. sub-national coverage,
# national target vs. sub-national target, ...). They differ only in WHICH admin-level filters they show and what
# admin level / region they hand to the analysis module, so that is all a page now says:
#
#   subnational_target_ui     <- function(id, i18n) cd_scoped_page_ui(id, i18n, cd_scope("region", fixed_level = "district"), target_ui)
#   subnational_target_server <- function(id, cache, i18n, active = reactive(TRUE))
#     cd_scoped_page_server(id, cache, i18n, cd_scope("region", fixed_level = "district"), target_server, active)
#
# The analysis module (`inner_ui(id, i18n, ...)` / `inner_server(id, cache, i18n, admin_level, region, active)`) is the
# app's own; the filter bar, the admin-level wiring and the unwrapping of its value are shared here.

#' What filters a scoped page shows.
#'  - "national":     none; the analysis gets admin_level "national" and no region
#'  - "level":        an admin-level chip only (no region chip)
#'  - "region":       a region chip only; the analysis gets `fixed_level` (default "adminlevel_1")
#'  - "level_region": an admin-level chip and a region chip; `show_district` lets districts be picked as regions
cd_scope <- function(kind = c("national", "level", "region", "level_region"), fixed_level = NULL, show_district = FALSE) {
  list(kind = match.arg(kind), fixed_level = fixed_level, show_district = show_district)
}

# The chips for a scope, or NULL when it has none. `ns` is the page's NS().
cd_scope_filters <- function(ns, i18n, scope) {
  if (scope$kind == "national") return(NULL)
  cd_filter_bar(cd_admin_level_ui(ns("scope"), i18n, show_admin_level = scope$kind %in% c("level", "level_region")))
}

# Reactives for the admin level and region a scope resolves to. Call it inside a module server.
cd_scope_server <- function(id, cache, i18n, scope) {
  if (scope$kind == "national") {
    return(list(admin_level = reactive("national"), region = reactive(NULL)))
  }

  admin <- cd_admin_level_server(
    id, cache, i18n,
    show_admin_level = scope$kind %in% c("level", "level_region"),
    show_region = scope$kind != "level",
    show_district = scope$kind == "level_region" && scope$show_district
  )

  list(
    admin_level = reactive({
      req(admin())
      scope$fixed_level %||% admin()$admin_level
    }),
    region = reactive({
      req(admin())
      admin()$region
    })
  )
}

# A whole scoped page: page shell + the scope's filter bar + the analysis module. `...` goes to inner_ui.
cd_scoped_page_ui <- function(id, i18n, scope, inner_ui, ...) {
  ns <- NS(id)
  cd_page_ui(id, i18n, filters = cd_scope_filters(ns, i18n, scope), inner_ui(ns("body"), i18n, ...))
}

cd_scoped_page_server <- function(id, cache, i18n, scope, inner_server, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      geo <- cd_scope_server("scope", cache, i18n, scope)
      inner_server("body", cache, i18n, geo$admin_level, geo$region, active = active)
    }
  )
}
