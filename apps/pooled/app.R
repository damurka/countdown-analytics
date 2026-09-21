library(shiny)
library(bslib)
library(DT)
library(dplyr)
library(purrr)
library(openxlsx)
library(haven)
library(readr)
library(cd2030.core)

pre_loaded_dir <- Sys.getenv("CDSUITE_SHINY_SELECTED_FILE", unset = NA)
print(pre_loaded_dir)
pooled_files <- list.files(pre_loaded_dir, pattern = "\\.rds$", full.names = TRUE, ignore.case = TRUE)

ui <- page_sidebar(
  title = 'CD2030 Data Pooling & Extraction',
  theme = bs_theme(
    version = 5,
    preset = 'flatly',
    "font-size-base" = "0.75rem"
  ),

  sidebar = sidebar(
    title = 'Configuration',
    if (pre_loaded_dir != "") {
      div(
        class = "p-2 bg-light border rounded mb-3 text-muted",
        style = "font-size: 0.85rem; line-height: 1.4;",
        icon("check-circle", class = "text-success"),
        strong(length(pooled_files), "files pre-loaded"),
        br(),
        span("Folder: "),
        # code() gives it a nice monospaced look, word-break ensures it doesn't overflow
        tags$code(basename(pre_loaded_dir), style = "font-size: 0.8rem; word-break: break-all;")
      )
    },
    radioButtons('dataset_type', 'Select Domain:',
                 choices = c('RMNCAH' = 'rmncah', 'Immunization (VAXX)' = 'vaccine')),

    if (is.null(pre_loaded_dir)) {
      fileInput('rds_files', '1. Upload RDS Files:',
                multiple = TRUE,
                accept = c('.rds', '.RDS'))
    },

    # Step 1: Explicit load button
    actionButton('load_btn', '2. Load Caches', class = 'btn-warning', icon = icon('folder-open')),

    hr(),

    # Step 2: Select and Process dynamically
    selectInput('target_dataset', '3. Select Dataset to Process:', choices = NULL),
    actionButton('process_btn', '4. Process Selected', class = 'btn-primary', icon = icon('cogs')),

    hr(),
    h5('Downloads'),
    downloadButton('download_single', 'Download Current (CSV)', class = 'btn-outline-secondary w-100 mb-2'),
    downloadButton('download_full', 'Download All as Excel', class = 'btn-success w-100')
  ),

  # Replaced standard card with a tabbed interface for Logs
  navset_card_underline(
    id = "main_tabs",
    title = textOutput('preview_title'),

    nav_panel(
      title = "Data Preview",
      icon = icon("table"),
      DTOutput('data_preview')
    ),

    nav_panel(
      title = "Execution Logs",
      icon = icon("rectangle-list"),
      verbatimTextOutput('log_output')
    )
  )
)

server <- function(input, output, session) {

  # Added 'logs' to reactiveValues to track errors and warnings
  rv <- reactiveValues(caches = list(), current_data = NULL, logs = character())

  # Helper function to push messages to the log screen
  append_log <- function(msg) {
    timestamp <- format(Sys.time(), "%H:%M:%S")
    rv$logs <- c(rv$logs, paste0("[", timestamp, "] ", msg))
  }

  # --- Update UI Dropdown based on Domain ---
  observeEvent(input$dataset_type, {
    base_choices <- c(
      'Parameters',
      'Overall Score',
      'Indicator Coverage - National',
      'Indicator Coverage - Admin 1',
      'Indicator Coverage - District',
      'Coverage - National',
      'Coverage - Admin 1'
    )

    if (input$dataset_type == 'rmncah') {
      updateSelectInput(session, 'target_dataset', choices = c(base_choices, 'National Mortality', 'Admin 1 Mortality', 'National Service Utilization', 'Admin Service Utilization'))
    } else {
      updateSelectInput(session, 'target_dataset', choices = base_choices)
    }
  })

  # --- Step 1: LOAD ONLY (With Error Catching) ---
  observeEvent(input$load_btn, {

    # Check if we are using the local pre-loaded files or the UI uploads
    using_local_files <- (pre_loaded_dir != "")

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
        # Use the global pooled_files variable
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
          cache <- init_CacheConnection(path, indicator_group = input$dataset_type)
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

      # Automatically switch to the Preview tab if data was generated
      nav_select("main_tabs", "Data Preview")
    })
  })

  # --- UI Renderers ---
  output$preview_title <- renderText({
    if (is.null(rv$current_data)) 'Dataset Preview (Awaiting Processing)' else paste('Preview:', input$target_dataset)
  })

  output$data_preview <- renderDT({
    req(rv$current_data)
    datatable(rv$current_data, options = list(pageLength = 10, scrollX = TRUE), rownames = FALSE, class = 'cell-border stripe')
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
    filename = function() paste0('pooled_', input$dataset_type, '_data_', Sys.Date(), '.xlsx'),
    content = function(file) {
      req(length(rv$caches) > 0)
      append_log("--- Generating Full Excel Export ---")
      wb <- createWorkbook()

      sheets_to_build <- c('Parameters', 'Overall Score', 'Indicator Coverage - National', 'Indicator Coverage - Admin 1', 'Indicator Coverage - District', 'Coverage - National', 'Coverage - Admin 1')
      if (input$dataset_type == 'rmncah') sheets_to_build <- c(sheets_to_build, 'National Mortality', 'Admin 1 Mortality', 'National Service Utilization', 'Admin 1 Service Utilization')

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

shinyApp(ui, server)
