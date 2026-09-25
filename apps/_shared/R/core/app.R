# A Countdown app: the frame (datasuite.ui::app_frame()) with the Introduction and Load Data screens, and a dataset
# that is ready once its Countdown data is loaded (and ready for the analysis pages once it is adjusted).
#
#   cd_app(app_name, app_version, theme = "vaccine", nav_sections = cd_nav_sections, registry = cd_page_registry,
#          i18n = i18n, language = language, selected_file = selected_file)
#
# It expects the app to have defined introduction_ui()/_server() and upload_data_ui()/_server() (the Load Data wizard).
# `theme`: NULL/"rmncah" (maroon), "vaccine" (blue) or "pooled" (green) -- see the App themes block of cd-ui.css.
cd_app <- function(app_name, app_version, theme, nav_sections, registry, i18n, language, selected_file) {
  app_frame(
    app_name, app_version, theme, nav_sections, registry, i18n, language, selected_file,
    start_screens = list(
      cd_screen(tabName = "introduction", introduction_ui("introduction", i18n = i18n)),
      cd_screen(tabName = "upload_data", upload_data_ui("upload_data", i18n = i18n, is_electron = !is.na(selected_file)))
    ),
    start_tab = "upload_data", open_tabs = c("introduction", "upload_data"),
    data = function(input, output, session) {
      introduction_server("introduction", selected_language = reactive(input$selected_language))
      loaded <- upload_data_server("upload_data", i18n, selected_file, active = reactive(identical(input$tabs, "upload_data")))
      cache <- loaded$cache
      # ready once Countdown data is loaded (a .dta/.rds upload has it at once; an Excel upload after the wizard's Finish)
      data_ready <- reactive(isTruthy(cache()) && isTruthy(cache()$countdown_data))
      list(
        dataset = cache,
        ready = data_ready,
        # the analysis pages wait until the data is adjusted
        analysis_ready = reactive(isTRUE(data_ready()) && isTRUE(cache()$adjusted_flag)),
        # a fresh upload (walked through the wizard) takes the language on screen; a resumed file shows its own
        adopt_language = loaded$requires_walkthrough
      )
    }
  )
}
