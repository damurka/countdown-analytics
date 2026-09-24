# Component gallery: every shared component on one page, live. Used to take the screenshots in docs/COMPONENTS.md and as a
# place to try a component out. Run it from this folder:  shiny::runApp("apps/_shared/docs/gallery")
#
# It is not an app anyone ships: no dataset, no registry. Each block is wrapped in a `div#g-<name>` so it can be captured.

options(cd2030.selected_group = "rmncah")
library(cd2030.core)
pacman::p_load(shiny, shiny.react, htmltools, dplyr, purrr, openxlsx, reactable, ggplot2, rlang, shiny.i18n, stringr, update = FALSE)

source("../../load.R")
cd_ui_load(dir = normalizePath("../.."))
options(cd2030.app_group = "rmncah")
options(cd2030.config = list(has_maternal = TRUE))

i18n <- init_i18n(translation_json_path = cd_translations("../../../rmncah/translation/translation.json"))
i18n$set_translation_language("en")
cd_use_i18n(i18n)

# A labelled block of the gallery
g <- function(id, title, note, ...) {
  div(
    id = paste0("g-", id), class = "g-block",
    tags$h3(title), tags$p(class = "g-note", note),
    div(class = "g-demo", ...)
  )
}

demo_steps <- list(
  list(key = "upload", title_key = "step_upload_title", status = "complete"),
  list(key = "quality", title_key = "step_quality_title", status = "complete"),
  list(key = "survey_files", title_key = "step_survey_files_title", status = "current"),
  list(key = "national_rates", title_key = "step_national_rates_title", status = "available"),
  list(key = "shapefile", title_key = "step_shapefile_title", status = "locked"),
  list(key = "survey_mapping", title_key = "step_survey_mapping_title", status = "locked"),
  list(key = "map_mapping", title_key = "step_map_mapping_title", status = "locked")
)

cd_nav_sections <- list(cd_nav_section("Gallery", cd_nav_item("Components", tabName = "gallery", icon = "shapes")))

ui <- cd_app_ui(
  title = "Component gallery", theme = Sys.getenv("GALLERY_THEME", "rmncah"),
  header = cd_app_bar("Gallery", "docs"),
  sidebar = cd_sidebar(),
  body = cd_app_body(
    usei18n(i18n),
    cd_head_assets(),
    tags$style(HTML("
      .g-block { margin: 0 0 28px; padding: 18px 20px; background: #fff; border: 1px solid var(--cd-border); border-radius: 12px; }
      .g-block h3 { margin: 0 0 4px; font-size: 16px; }
      .g-note { margin: 0 0 14px; color: var(--cd-muted); font-size: 13px; }
      .g-demo { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
      .g-demo > .cd-card, .g-demo > .cd-field-stack, .g-full { width: 100%; }
    ")),
    cd_screens(cd_screen(tabName = "gallery",
      tags$h1("Component gallery"),

      g("buttons", "cd_button", "variant: default, primary, link, bare; size; icon; disabled; block.",
        cd_button("b1", "btn_upload_download_master", i18n = i18n, icon = "download"),
        cd_button("b2", "Primary action", variant = "primary", icon = "wrench", i18n = i18n),
        cd_button("b3", "Link button", variant = "link", i18n = i18n),
        cd_button("b4", "Disabled", disabled = TRUE, i18n = i18n),
        cd_button("b5", "Small", size = "sm", i18n = i18n)),

      g("chips", "cd_chip_select / cd_chip_multi / cd_chip_number / cd_palette_chip", "Filter chips; click one to open its popover.",
        cd_chip_select("c1", "title_global_admin_level", choices = c(opt_adminlevel_1 = "adminlevel_1", opt_district = "district"), i18n = i18n),
        cd_chip_multi("c2", "title_global_select_years", options = cd_plain_options(2020:2025), selected = c(2021, 2022), i18n = i18n),
        cd_chip_number("c3", "Threshold", value = 90, min = 0, max = 100, step = 1, unit = "%", i18n = i18n),
        cd_palette_chip("c4", i18n)),

      g("filterbar", "cd_filter_bar", "The sticky bar under the header; shown here as it sits in a page.",
        div(class = "g-full", style = "position: relative; margin: -10px;",
            cd_filter_bar(
              cd_chip_select("f1", "title_global_admin_level", choices = c(opt_adminlevel_1 = "adminlevel_1", opt_district = "district"), i18n = i18n),
              cd_chip_multi("f2", "title_global_select_years", options = cd_plain_options(2020:2025), i18n = i18n)))),

      g("mapoptions", "cd_map_options", "Inline bar for the options of a group of maps; sits directly above them.",
        div(class = "g-full", cd_map_options(
          cd_chip_multi("m1", "title_global_select_years", options = cd_plain_options(2020:2025), i18n = i18n),
          cd_palette_chip("m2", i18n)))),

      g("fields", "cd_field_number / cd_field_select / cd_checkbox / cd_text_area", "Always-visible labelled inputs. The number field validates min/max live.",
        div(class = "cd-field-stack", style = "max-width: 420px;",
          cd_field_number("n1", "title_upload_anc1_survey", value = 150, min = 0, max = 100, step = 1, hint = "hint_upload_percent", i18n = i18n),
          cd_field_number("n2", "title_upload_nmr", i18n = i18n, required = TRUE, min = 0, max = 0.05, step = 0.001),
          cd_field_select("s1", "title_adjust_anc_factor", options = cd_plain_options(c(0, 0.25, 0.5, 0.75, 1)), value = "0.5", i18n = i18n),
          cd_checkbox("k1", "Include national estimate", value = TRUE, i18n = i18n),
          cd_text_area("t1", "Notes", placeholder = "Type here", height = 80, i18n = i18n))),

      g("banners", "cd_status_banner", "status: info, success, warning, error. A file name shows in monospace.",
        div(class = "g-full",
          cd_status_banner("success", "title_upload_success_heading", "Upload successful: File Benin.xlsx is ready.", i18n = i18n),
          cd_status_banner("info", "Heads up", "This is an informational banner.", i18n = i18n),
          cd_status_banner("warning", "Check the data", "3 districts have no service data.", i18n = i18n),
          cd_status_banner("error", "title_upload_error_heading", "The file provided does not exist", i18n = i18n))),

      g("messages", "cd_message_ui / cd_message_server", "A stacked message list; the server adds, replaces and clears messages.",
        div(class = "g-full", cd_message_ui("mb"))),

      g("empty", "cd_empty_state", "Shown in place of a chart that has nothing to draw; the action fires input$<id>_action.",
        div(class = "g-full", cd_empty_state("es", "title_denom_coverage_empty", "msg_denom_coverage_empty", i18n = i18n,
                                              action_label = "btn_denom_goto_load_data"))),

      g("loading", "cd_loading_skeleton / cd_spinner", "The skeleton shown while an output calculates; cd_spinner() wraps an output with it.",
        div(class = "g-full", cd_spinner(uiOutput("never"), i18n = i18n, min_height = 200))),

      g("upload", "cd_file_upload", "Drag-and-drop zone; Shiny's own file input does the upload. multiple = TRUE takes several files.",
        div(class = "g-full", style = "display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;",
          cd_file_upload("u1", label = "btn_upload_hfd", hint = "hint_upload_hfd_format", accept = ".xlsx", i18n = i18n),
          cd_file_upload("u2", label = "Several files", accept = ".rds", multiple = TRUE, i18n = i18n),
          cd_directory_upload("u3", label = "Shapefile folder", i18n = i18n))),

      g("tooltip", "cd_tooltip", "A small info icon with a hover text.",
        span("Denominator", cd_tooltip("The population the coverage is divided by."))),

      g("card", "cd_card", "A plain card: title, subtitle, optional toolbar, tabs, collapse.",
        cd_card(title = "Dataset", subtitle = "The file the whole analysis runs on.", i18n = i18n, status = "success", solidHeader = TRUE,
                p("Any content goes here."), cd_button("cb", "Save", variant = "primary", i18n = i18n))),

      g("chartcard", "cd_chart_card + cd_plot_ui / cd_plot_server", "A chart with its tool row (labels, view, image, data, expand). Try the tools.",
        div(class = "g-full", cd_chart_card("Fuel economy by weight", chart_toolbar = cd_plot_toolbar_ui("plt1"), i18n = i18n,
                                            cd_plot_ui("plt1", toolbar_inline = TRUE)))),

      g("tabs", "cd_tab_strip + cd_tab_panes", "Tabs inside a card; the caller switches panes (cd_update_tab_panes).",
        div(class = "g-full", cd_card(title = "Tabbed card", i18n = i18n, tabs = cd_tab_strip(NS("tb"), c(a = "Penta3", b = "Measles1", custom = "Custom Check"), "a"),
          cd_tab_panes("tb-panes", list(a = p("Penta3 chart"), b = p("Measles1 chart"), custom = p("Custom chart")))))),

      g("header", "cd_page_header / cd_denominator_row", "The title block (with Get help) and the denominator row.",
        div(class = "g-full",
          cd_page_header("hdr", "Reporting Rate", i18n, eyebrow = "lbl_nav_section_quality", subtitle = "sub_rr_main", include_help = TRUE),
          cd_denominator_row("dhis2", "anc1", i18n))),

      g("wizard", "cd_wizard_steps", "The Load Data step rail: complete, current, available, locked.",
        div(class = "g-full", div(class = "cd-wizard-rail-card", cd_wizard_steps("rail", demo_steps, i18n)))),

      g("dialog", "cd_show_dialog", "A modal dialog; the buttons close it.",
        cd_button("open_dialog", "Open a dialog", i18n = i18n))
    ))
  )
)

server <- function(input, output, session) {
  cd_shell_server(output, cd_nav_sections, initial_tab = "gallery", data_ready = reactive(TRUE), i18n = i18n)
  output$never <- renderUI(req(FALSE))

  mb <- cd_message_server("mb", i18n = i18n)
  observe({
    mb$update_message("Loading from cache", "info", title = "Loading")
    mb$add_message("Upload successful: File Benin.xlsx is ready.", "success", title = "title_upload_success_heading")
  })

  cd_plot_server(
    "plt1", i18n = i18n,
    plot_data = reactive(mtcars),
    plot_fun = function(d) ggplot(d, aes(wt, mpg)) + geom_point(colour = "#9b5758", size = 3) + geom_smooth(method = "lm", se = FALSE, colour = "#1f2328") +
      labs(title = "Fuel economy by weight", x = "Weight (1000 lb)", y = "Miles per gallon") + theme_minimal(),
    plot_filename = reactive("mtcars"), excel_sheet = "ratio_plot"
  )

  observeEvent(input$open_dialog, {
    cd_show_dialog(
      "Delete this dataset?", p("Nothing is deleted in the gallery; this is how a dialog looks."),
      footer = tagList(cd_dialog_close_button("Cancel"), cd_dialog_close_button("Delete", primary = TRUE)),
      easy_close = TRUE
    )
  })
}

shinyApp(ui, server)
