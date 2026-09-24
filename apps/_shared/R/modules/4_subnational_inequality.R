subnational_inequality_ui <- function(id, i18n) {
  cd_scoped_page_ui(id, i18n, cd_scope("level_region"), inequality_ui)
}

subnational_inequality_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  cd_scoped_page_server(id, cache, i18n, cd_scope("level_region"), inequality_server, active)
}
