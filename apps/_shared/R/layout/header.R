cd_page_header <- function(id, title, i18n, include_report = FALSE, include_notes = FALSE, include_help = TRUE,
                            eyebrow = NULL, subtitle = NULL, include_denominator = FALSE) {
  ns <- NS(id)
  tagList(div(
    class = 'cd-page-header',
    div(
      class = 'cd-page-heading',
      if (!is.null(eyebrow)) div(class = 'cd-page-eyebrow', i18n$t(eyebrow)),
      h1(title),
      if (!is.null(subtitle)) p(class = 'cd-page-subtitle', i18n$t(subtitle))
    ),
    div(
      class = 'right-buttons',
      if (include_report) cd_button(ns('report'), "btn_report_generate", i18n, icon = 'file-lines', size = 'sm'),
      if (include_notes) cd_notes_button_ui(ns('add_notes'), i18n),
      if (include_help) cd_help_button_ui(ns('get_help'), name = i18n$t('btn_global_help'))
    )
  ),
  # Analysis pages: which denominators the numbers on the page were divided by -- project/NationalCoverage.dc.html's
  # own "Denominator" row under the page header. Filled by cd_page_header_server() below.
  if (include_denominator) uiOutput(ns('denominator'), class = 'cd-denominator-slot'))
}

# "Denominator  (o Vaccination DHIS2)  (o Maternal DHIS2)  Set on the Denominator Selection page."
cd_denominator_row <- function(vaccination, maternal = NULL, i18n) {
  label <- function(code) {
    key <- paste0('opt_', code)
    val <- i18n$t(key)
    if (is.null(val) || identical(val, key)) toupper(code) else val
  }
  chip <- function(kind_key, code) {
    span(class = 'cd-denom-chip', span(class = 'cd-denom-chip__dot'),
         span(class = 'cd-denom-chip__kind', i18n$t(kind_key)), label(code))
  }
  div(
    class = 'cd-denominator-row',
    span(class = 'cd-denominator-row__label', i18n$t('lbl_denominator_row')),
    chip('opt_vacc', vaccination),
    if (!is.null(maternal)) chip('title_global_maternal', maternal),
    span(class = 'cd-denominator-row__note', i18n$t('msg_denominator_set_on'))
  )
}

# `key`: the page's standard report (cd2030.core::report_presets()) and its id in the notes store.
cd_page_header_server <- function(id, cache, path, section = NULL, i18n, key = id) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {

      output$denominator <- renderUI({
        req(cache(), cache()$denominator)
        if (!cd_has_maternal()) return(cd_denominator_row(cache()$denominator, NULL, i18n))
        req(cache()$maternal_denominator)
        cd_denominator_row(cache()$denominator, cache()$maternal_denominator, i18n)
      })

      # the page's standard report opens in the report builder (modules/reports.R), which asks for its name
      observeEvent(input$report, cd_request_report(session, key))

      cd_help_button_server(
        id = 'get_help',
        path = path,
        section = section,
        cache = cache
      )

      cd_notes_button_server(
        id = 'add_notes',
        cache = cache,
        document_objects = if (!is.null(objects)) objects[[key]] else NULL,
        page_id = key,
        page_name = md_title,
        i18n = i18n
      )
    }
  )
}
