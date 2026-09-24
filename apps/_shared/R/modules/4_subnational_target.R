subnational_target_ui <- function(id, i18n) {
  cd_scoped_page_ui(id, i18n, cd_scope("region", fixed_level = "district"), target_ui)
}

subnational_target_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  cd_scoped_page_server(id, cache, i18n, cd_scope("region", fixed_level = "district"), target_server, active)
}
