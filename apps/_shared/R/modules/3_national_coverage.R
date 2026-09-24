national_coverage_ui <- function(id, i18n) {
  cd_scoped_page_ui(id, i18n, cd_scope("national"), coverage_ui, "title_coverage_national")
}

national_coverage_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  cd_scoped_page_server(id, cache, i18n, cd_scope("national"), coverage_server, active)
}
