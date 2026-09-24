# Pooled: combine several countries' saved datasets (.rds) and export the results. One page on the shared Countdown
# shell (../_shared), with the "pooled" (green) theme.
options(shiny.maxRequestSize = 2 * 1024 * 1024^2)

library(cd2030.core)

pacman::p_load(
  shiny,
  shiny.react,
  htmltools,
  dplyr,
  purrr,
  openxlsx,
  haven,
  readr,
  reactable,
  shiny.i18n,
  stringr,
  update = FALSE
)

source("../_shared/load.R")
cd_ui_load()

app_name <- Sys.getenv("CDSUITE_SHINY_NAME", unset = "Pooled")
app_version <- Sys.getenv("CDSUITE_SHINY_VERSION", unset = "2.0.0")
pre_loaded_dir <- Sys.getenv("CDSUITE_SHINY_SELECTED_FILE", unset = NA)
language <- Sys.getenv("CDSUITE_SHINY_LOCALE", unset = "en")

using_local_files <- !is.na(pre_loaded_dir) && nzchar(pre_loaded_dir) && dir.exists(pre_loaded_dir)
pooled_files <- if (using_local_files) list.files(pre_loaded_dir, pattern = "[.]rds$", full.names = TRUE, ignore.case = TRUE) else character()

i18n <- init_i18n(translation_json_path = cd_translations("translation/translation.json"))
i18n$set_translation_language(language)
cd_use_i18n(i18n)

# Every table the page can build, by domain. The names are what the user sees and what process_dataset() switches on.
base_datasets <- c(
  "Parameters", "Overall Score",
  "Indicator Coverage - National", "Indicator Coverage - Admin 1", "Indicator Coverage - District",
  "Coverage - National", "Coverage - Admin 1"
)
rmncah_datasets <- c("National Mortality", "Admin 1 Mortality", "National Service Utilization", "Admin 1 Service Utilization")
datasets_for <- function(domain) if (identical(domain, "rmncah")) c(base_datasets, rmncah_datasets) else base_datasets

cd_nav_sections <- list(
  cd_nav_section("Pooling",
    cd_nav_item("Data pooling", tabName = "pooling", icon = "layer-group")
  )
)

ui <- cd_app_ui(
  theme = "pooled",
  title = app_name,
  header = cd_app_bar(app_name, app_version),
  sidebar = cd_sidebar(),
  body = cd_app_body(
    usei18n(i18n),
    cd_head_assets(),
    cd_screens(
      cd_screen(
        tabName = "pooling",

        cd_filter_bar(
          cd_chip_select("dataset_type", "Domain", i18n = i18n,
                         options = list(
                           list(key = "rmncah", text = "RMNCAH"),
                           list(key = "vaccine", text = "Immunization (VAXX)")
                         ))
        ),

        cd_page_header("pooling", "CD2030 Data Pooling & Extraction", i18n, include_help = FALSE),

        cd_page_content(
          cd_card(
            title = "Configuration",
            subtitle = "Load the countries' saved datasets, pick a table to build, then download it.",
            i18n = i18n,
            div(
              class = "cd-field-stack",
              if (using_local_files) {
                cd_status_banner(
                  "success",
                  paste(length(pooled_files), "files pre-loaded"),
                  paste("Folder:", basename(pre_loaded_dir)),
                  i18n = i18n
                )
              } else {
                cd_file_upload("rds_files", label = "1. Upload RDS files", accept = ".rds,.RDS", multiple = TRUE, i18n = i18n)
              },
              div(class = "cd-upload-actions", cd_button("load_btn", "Load datasets", icon = "folder-open", variant = "primary", i18n = i18n)),
              shiny.react::reactOutput("target_ui"),
              div(class = "cd-upload-actions", cd_button("process_btn", "Build selected table", icon = "gears", variant = "primary", i18n = i18n)),
              div(
                class = "cd-upload-actions",
                tags$a(id = "download_single", class = "shiny-download-link cd-button", href = "", target = "_blank", download = NA,
                       tags$i(class = "fa fa-file-csv"), " Download current (CSV)"),
                tags$a(id = "download_full", class = "shiny-download-link cd-button cd-button--primary", href = "", target = "_blank", download = NA,
                       tags$i(class = "fa fa-file-excel"), " Download all as Excel")
              )
            )
          ),

          cd_card(
            title = "Data preview",
            i18n = i18n,
            div(class = "cd-log-caption", textOutput("preview_title", inline = TRUE)),
            cd_spinner(reactableOutput("data_preview"), i18n = i18n)
          ),

          cd_card(
            title = "Execution logs",
            i18n = i18n,
            collapsible = TRUE,
            tags$pre(class = "cd-log", textOutput("log_output"))
          )
        )
      )
    )
  )
)

server <- function(input, output, session) {

  cd_shell_server(output, cd_nav_sections, initial_tab = "pooling", data_ready = reactive(TRUE), i18n = i18n)

  show_language <- function(lang) {
    update_lang(lang)
    cd_set_language(session, lang)
  }
  observeEvent(input$selected_language, show_language(input$selected_language))

  # 'logs' track errors and warnings shown on the Execution logs card
  rv <- reactiveValues(caches = list(), current_data = NULL, logs = character())

  # Helper function to push messages to the log screen
  append_log <- function(msg) {
    timestamp <- format(Sys.time(), "%H:%M:%S")
    rv$logs <- c(rv$logs, paste0("[", timestamp, "] ", msg))
  }

  domain <- reactive(input$dataset_type %||% "rmncah")

  # The table picker follows the domain: the RMNCAH-only tables are not offered for vaccine data.
  output$target_ui <- shiny.react::renderReact({
    choices <- datasets_for(domain())
    cd_field_select("target_dataset", "2. Table to build", i18n = i18n, options = cd_plain_options(choices),
                    value = choices[[1]])
  })

  output$header_pill <- renderUI({
    req(length(rv$caches) > 0)
    tags$span(
      class = "cd-dataset-pill",
      tags$span(class = "cd-dataset-pill__dot"),
      tags$span(class = "cd-dataset-pill__country", paste(length(rv$caches), "datasets loaded"))
    )
  })

  # --- Step 1: LOAD ONLY (With Error Catching) ---
  observeEvent(input$load_btn, {

    if (!using_local_files) {
      req(input$rds_files) # Only require the UI upload if we aren't using local files
    }

    withProgress(message = 'Loading Cache Connections...', value = 0, {

      # Reset logs and data on new load
      rv$logs <- character()
      rv$current_data <- NULL
      append_log("--- Starting Cache Load ---")

      incProgress(0.1, detail = 'Preparing files...')

      # Determine paths based on the source
      if (using_local_files) {
        rds_files_paths <- pooled_files
        append_log("Using pre-configured local directory.")
      } else {
        # Copy UI uploads to temp dir as before
        process_dir <- file.path(tempdir(), 'processing_rds')
        if (!dir.exists(process_dir)) dir.create(process_dir)

        file.copy(from = input$rds_files$datapath,
                  to = file.path(process_dir, input$rds_files$name),
                  overwrite = TRUE)

        rds_files_paths <- file.path(process_dir, input$rds_files$name)
        append_log("Using UI uploaded files.")
      }

      incProgress(0.4, detail = 'Initializing caches...')

      # Safely load each cache
      loaded_caches <- map(rds_files_paths, function(path) {
        tryCatch({
          cache <- init_CacheConnection(path, indicator_group = domain())
          set_selected_group(domain()) # loading a dataset sets the session group to the dataset's own
          if (is.null(cache$adjusted_data) && !cache$adjusted_flag) {
            append_log(paste0("WARNING: ", cache$country %||% basename(path), " has not been processed/adjusted."))
          }
          return(cache)
        }, error = function(e) {
          append_log(paste0("ERROR Loading File '", basename(path), "': ", e$message))
          return(NULL) # Return NULL so we can drop it later
        })
      })

      # Drop failed caches
      rv$caches <- compact(loaded_caches)

      append_log(paste("Successfully loaded", length(rv$caches), "out of", length(rds_files_paths), "files."))
      showNotification('Caches loaded! Check Execution Logs for any warnings.', type = 'message')
    })
  })

  # --- Core Processing Logic Engine (With Per-Country Error Catching) ---
  process_dataset <- function(caches, dataset_name, log_func) {
    set_selected_group(domain())

    # Define the core extraction logic based on the requested dataset
    extract_func <- switch(dataset_name,
                           'Parameters' = function(.x) {
                             tibble(
                               performance_threshold = .x$performance_threshold,
                               anc_k_factor = .x$k_factors['anc'],
                               idelv_k_factor = .x$k_factors['idelv'],
                               vacc_k_factor = .x$k_factors['vacc'],
                               nmr = .x$national_estimates$nmr,
                               pnmr = .x$national_estimates$pnmr,
                               twin_rate = .x$national_estimates$twin_rate,
                               preg_loss = .x$national_estimates$preg_loss,
                               sbr = .x$national_estimates$sbr,
                               anc1 = .x$survey_estimates['anc1'],
                               penta1 = .x$survey_estimates['penta1'],
                               penta3 = .x$survey_estimates['penta3'],
                               measles1 = .x$survey_estimates['measles1'],
                               bcg = .x$survey_estimates['bcg'],
                               survey_year = .x$survey_year,
                               vaccine_denominator = .x$denominator,
                               maternal_denominator = .x$maternal_denominator
                             ) %>%
                               mutate(country = .x$country, iso3 = .x$country_iso) %>%
                               relocate(country, iso3)
                           },
                           'Overall Score' = function(.x) {
                             .x$overall_score %>%
                               mutate(
                                 country = .x$country,
                                 iso3 = .x$country_iso
                               ) %>%
                               select(-no) %>%
                               relocate(country, iso3)
                           },
                           'Indicator Coverage - National' = function(.x) {
                             .x$indicator_coverage_national %>%
                               mutate(country = .x$country, iso3 = .x$country_iso) %>%
                               relocate(country, iso3)
                           },
                           'Indicator Coverage - Admin 1'  = function(.x) {
                             .x$indicator_coverage_admin1 %>%
                               mutate(country = .x$country, iso3 = .x$country_iso) %>%
                               relocate(country, iso3, adminlevel_1)
                           },
                           'Indicator Coverage - District' = function(.x) {
                             .x$indicator_coverage_district %>%
                               mutate(country = .x$country, iso3 = .x$country_iso) %>%
                               relocate(country, iso3, adminlevel_1, district)
                           },
                           'Coverage - National' = function(.x) {
                             inds <- list_c(map(c('anc_1trimester', 'anc4', 'ideliv', 'csection', 'hiv_test', 'instlivebirths', 'pnc48h', 'penta1', 'penta3', 'measles1', 'measles2', 'bcg', 'opv1', 'opv2', 'opv3', 'syphilis_test', 'ipt2', 'ipt3'), function(ind) paste0('cov_', ind, '_', .x$get_denominator(ind))))
                             .x$calculate_coverage('national') %>%
                               select(year, any_of(inds)) %>%
                              #  rename_with(~ gsub('^cov_|_(anc1|penta1|dhis2|penta1derived)$', '', .x)) %>%
                               mutate(country = .x$country, iso3 = .x$country_iso) %>%
                               relocate(country, iso3)
                           },
                           'Coverage - Admin 1' = function(.x) {
                             inds <- list_c(map(c('anc_1trimester', 'anc4', 'ideliv', 'csection', 'hiv_test', 'instlivebirths', 'pnc48h', 'penta1', 'penta3', 'measles1', 'measles2', 'bcg', 'syphilis_test', 'ipt2', 'ipt3'), function(ind) paste0('cov_', ind, '_', .x$get_denominator(ind))))
                             .x$calculate_coverage('adminlevel_1') %>%
                               select(adminlevel_1, year, any_of(inds)) %>%
                              #  rename_with(~ gsub('^cov_|_(anc1|penta1|dhis2|penta1derived)$', '', .x)) %>%
                               mutate(country = .x$country, iso3 = .x$country_iso) %>%
                               relocate(country, iso3, adminlevel_1)
                           },
                           'National Mortality' = function(.x) {
                             .x$mortality_summary %>%
                               filter(adminlevel_1 == 'National') %>%
                              #  select(year, mmr_inst, sbr_inst, -adminlevel_1) %>%
                               select(-adminlevel_1) %>%
                               mutate(country = .x$country, iso3 = .x$country_iso) %>%
                               relocate(country, iso3)
                           },
                           'Admin 1 Mortality' = function(.x) {
                             .x$mortality_summary %>%
                               filter(adminlevel_1 != 'National') %>%
                              #  select(year, mmr_inst, sbr_inst, -adminlevel_1) %>%
                               mutate(country = .x$country, iso3 = .x$country_iso) %>%
                               relocate(country, iso3, adminlevel_1)
                           },
                           'National Service Utilization' = function(.x) {
                             .x$service_utilization_national %>%
                              #  select(year, perc_opd_under5, perc_ipd_under5, mean_opd_under5, mean_ipd_under5) %>%
                               mutate(country = .x$country, iso3 = .x$country_iso) %>%
                               relocate(country, iso3)
                           },
                           'Admin 1 Service Utilization' = function(.x) {
                             .x$service_utilization_admin1 %>%
                              #  select(year, perc_opd_under5, perc_ipd_under5, mean_opd_under5, mean_ipd_under5) %>%
                               mutate(country = .x$country, iso3 = .x$country_iso) %>%
                               relocate(country, iso3, adminlevel_1)
                           },
                           NULL
    )

    if (is.null(extract_func)) return(NULL)

    # Safely iterate over caches, so one bad country doesn't crash the map_df
    results <- map(caches, function(cache) {
      tryCatch({
        return(extract_func(cache))
      }, error = function(e) {
        country_lbl <- if (!is.null(cache$country)) cache$country else "Unknown Country"
        log_func(paste0("ERROR processing '", dataset_name, "' for ", country_lbl, ": ", e$message))
        return(NULL)
      })
    })

    # Combine all successful extractions
    valid_results <- compact(results)
    if (length(valid_results) == 0) {
      log_func(paste("WARNING: '", dataset_name, "' yielded no valid data across all caches."))
      return(NULL)
    }

    return(bind_rows(valid_results))
  }

  # --- Step 2: PROCESS ON DEMAND ---
  observeEvent(input$process_btn, {
    req(length(rv$caches) > 0, input$target_dataset)

    withProgress(message = paste('Processing', input$target_dataset, '...'), value = 0.5, {
      append_log(paste("--- Started Processing:", input$target_dataset, "---"))

      rv$current_data <- process_dataset(rv$caches, input$target_dataset, append_log)

      if (!is.null(rv$current_data)) {
        append_log(paste("SUCCESS:", input$target_dataset, "generated with", nrow(rv$current_data), "rows."))
        showNotification(paste(input$target_dataset, 'processed!'), type = 'message')
      } else {
        showNotification('Failed to generate dataset. Check logs.', type = 'error')
      }

    })
  })

  # --- UI Renderers ---
  output$preview_title <- renderText({
    if (is.null(rv$current_data)) 'Awaiting processing' else input$target_dataset
  })

  output$data_preview <- renderReactable({
    req(rv$current_data)
    reactable(rv$current_data, defaultPageSize = 10, searchable = TRUE, striped = TRUE, highlight = TRUE, compact = TRUE)
  })

  # Renders the collected logs
  output$log_output <- renderText({
    if (length(rv$logs) == 0) return("No logs yet. Upload files to begin.")
    paste(rv$logs, collapse = "\n")
  })

  # --- Download Handlers ---
  output$download_single <- downloadHandler(
    filename = function() paste0(gsub(' ', '_', input$target_dataset), '_', Sys.Date(), '.csv'),
    content = function(file) {
      req(rv$current_data)
      write.csv(rv$current_data, file, row.names = FALSE)
    }
  )

  output$download_full <- downloadHandler(
    filename = function() paste0('pooled_', domain(), '_data_', Sys.Date(), '.xlsx'),
    content = function(file) {
      req(length(rv$caches) > 0)
      append_log("--- Generating Full Excel Export ---")
      wb <- createWorkbook()

      sheets_to_build <- c('Parameters', 'Overall Score', 'Indicator Coverage - National', 'Indicator Coverage - Admin 1', 'Indicator Coverage - District', 'Coverage - National', 'Coverage - Admin 1')
      if (identical(domain(), 'rmncah')) sheets_to_build <- c(sheets_to_build, rmncah_datasets)

      withProgress(message = 'Generating Full Excel Workbook...', value = 0, {
        for (i in seq_along(sheets_to_build)) {
          sheet_name <- sheets_to_build[i]
          incProgress(1/length(sheets_to_build), detail = paste('Processing', sheet_name))

          sheet_data <- process_dataset(rv$caches, sheet_name, append_log)
          if (!is.null(sheet_data)) {
            safe_name <- substring(sheet_name, 1, 31)
            addWorksheet(wb, safe_name)
            writeData(wb, safe_name, sheet_data)
          }
        }
      })
      append_log("SUCCESS: Full Excel Export generated.")
      saveWorkbook(wb, file, overwrite = TRUE)
    }
  )
}

shinyApp(ui = ui, server = server)
