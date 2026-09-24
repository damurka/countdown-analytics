# A reporting-rate cell the way project/ReportingRate.dc.html's table draws it: a status SHAPE plus the value in
# bold, never colour alone -- red triangle below 70, amber diamond from 70 to below 90, green circle from 90.
# For a reactable colDef(cell = ...).
cd_rate_status_cell <- function(value) {
  if (is.null(value) || is.na(value)) return("")
  shape <- if (value < 70) {
    tags$path(d = "M5 9.5L9.5 1.5h-9z", fill = "#c0392b")
  } else if (value < 90) {
    tags$path(d = "M5 .5L9.5 5 5 9.5.5 5z", fill = "#b57f0c")
  } else {
    tags$circle(cx = "5", cy = "5", r = "4.5", fill = "#1b7f5a")
  }
  span(
    class = "cd-status-cell",
    tags$svg(width = "10", height = "10", viewBox = "0 0 10 10", `aria-hidden` = "true", shape),
    format(round(value), nsmall = 0)
  )
}

cd_table_ui <- function(id, i18n, title_key, control_type = c("year", "indicator"), width = 6) {
  ns <- NS(id)
  control_type <- arg_match(control_type)
  
  left_control_ui <- if (control_type == "year") {
    cd_chip_select(ns("control_input"), "title_global_year", options = list(), i18n = i18n)
  } else if (control_type == "indicator") {
    cd_indicator_ui(id = ns("control_input"), i18n = i18n)
  } else {
    NULL
  }

  cd_table_card(
    title = i18n$t(title_key),
    width = width,
    i18n = i18n,
    status = "success",
    # Download moved to the header toolbar (cd_table_toolbar(), content_dashboard.R) -- explicit user request,
    # matches project/ReportingRate.dc.html's own table card exactly (its only header control is this same
    # download-as-Excel icon button). left_control_ui (the Year/indicator chip) stays in the body, same as the
    # mockup's own body-row placement for it.
    table_toolbar = cd_download_button_ui(ns("download_data")),
    div(
      class = "cd-stack",
      # The control on the left, "This table only" on the right -- project/ReportingRate.dc.html's own table card.
      div(class = "cd-table-controls", left_control_ui, span(class = "cd-table-hint", i18n$t("lbl_table_only"))),
      cd_spinner(reactableOutput(ns("table")))
    )
  )
}

cd_table_server <- function(
    id,
    cache,
    i18n,
    data,
    columns = NULL,
    control_type = c("year", "indicator"),
    filename = reactive("download"),
    label_key = "btn_global_download_data",
    extension = reactive("xlsx"),
    data_transform = NULL,
    excel_write_fun = NULL, # function(wb, data) writes workbook
    # or, for the data on one sheet, the translation keys of its sheet name and (optional) title -- see cd_sheet_writer()
    excel_sheet = NULL,
    excel_title = NULL
) {
    if (is.null(excel_write_fun) && !is.null(excel_sheet)) excel_write_fun <- cd_sheet_writer(i18n, excel_sheet, excel_title)
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(data))
  stopifnot(is.reactive(filename))
  stopifnot(is.reactive(extension))
  
  control_type <- arg_match(control_type)
  
  moduleServer(
    id = id,
    module = function(input, output, session) {
      
      
      selected_value <- if (control_type == "year") {
        
        # The years come from the cache. They are pushed once the chip is on the page (a message to a chip that
        # has not mounted is lost). Reading the current choice inside isolate() keeps this from re-running, and
        # overwriting the user's pick, every time they choose a year.
        chip_mounted <- cd_mounted(input, "control_input")
        observe({
          req(chip_mounted(), cache(), cache()$data_years)
          years <- as.character(cache()$data_years)
          keep <- isolate(input$control_input)
          cd_update_input("control_input", session,
                       options = cd_plain_options(years),
                       value = if (!is.null(keep) && keep %in% years) keep else years[[1]])
        })
        
        reactive({ input$control_input })
        
      } else if (control_type == "indicator") {
        
        # Call your custom server module to get the selected indicator
        cd_indicator_server("control_input")
        
      } else {
        reactive({ NULL })
      }
      
      output$table <- renderReactable({
        req(data())

        dt <- if (!is.null(data_transform) && is.function(data_transform)) {
          data() %>% data_transform()
        } else {
          data()
        }
        
        if (control_type == "year" && "year" %in% names(dt)) {
          req(selected_value())
          dt <- dt %>% 
            filter(year == as.integer(selected_value()))
        }
        
        base_cols <- list(
          year = colDef(
            name = i18n$t("title_global_year"),
            aggregate = "unique" 
          ),
          adminlevel_1 = colDef(
            name = i18n$t("opt_adminlevel_1")
          ),
          district = colDef(
            name = i18n$t("opt_district")
          ),
          month = colDef(
            name = i18n$t("lbl_axis_x_outlier_trend")
          )
        )
        
        # ---------------------------------------------------------
        # THE MAGIC: Auto-detecting & Auto-translating Columns
        # ---------------------------------------------------------
        
        # A) Auto-detect "cov_" columns
        cov_cols <- grep("^cov_", names(dt), value = TRUE)
        if (length(cov_cols) > 0) {
          cov_defs <- set_names(lapply(cov_cols, function(c) {
            indicator <- i18n$t(paste0("opt_", str_remove(str_remove(c, "_[^_]*$"), "^cov_")))
            colDef(name = as.character(str_glue(i18n$t("lbl_axis_y_coverage"))))
          }), cov_cols)
          base_cols <- utils::modifyList(base_cols, cov_defs)
        }
        
        # B) Auto-detect "_med" and "_mad" columns (Extreme Outliers Table)
        med_cols <- grep("_med$", names(dt), value = TRUE)
        if (length(med_cols) > 0) {
          
          # Median columns (with str_glue interpolation)
          med_defs <- set_names(lapply(med_cols, function(x) {
            base_ind <- sub("_med$", "", x)
            indicator <- i18n$t(paste0("opt_", base_ind)) # This creates the '{indicator}' variable for str_glue
            colDef(name = as.character(str_glue(i18n$t("opt_median"))))
          }), med_cols)
          base_cols <- utils::modifyList(base_cols, med_defs)
          
          # MAD columns (with str_glue interpolation)
          mad_cols <- grep("_mad$", names(dt), value = TRUE)
          mad_defs <- set_names(lapply(mad_cols, function(x) {
            base_ind <- sub("_mad$", "", x)
            indicator <- i18n$t(paste0("opt_", base_ind)) # This creates the '{indicator}' variable for str_glue
            colDef(name = as.character(str_glue(i18n$t("opt_mad"))))
          }), mad_cols)
          base_cols <- utils::modifyList(base_cols, mad_defs)
          
          # The Base Indicator column itself
          base_inds <- sub("_med$", "", med_cols)
          ind_defs <- set_names(lapply(base_inds, function(x) colDef(name = i18n$t(paste0("opt_", x)))), base_inds)
          base_cols <- utils::modifyList(base_cols, ind_defs)
        }
        
        # C) If it's pure indicator selection, translate the standalone indicator column
        if (control_type == "indicator") {
          ind_val <- selected_value()
          if (ind_val %in% names(dt)) {
            base_cols[[ind_val]] <- colDef(name = i18n$t(paste0("opt_", ind_val)))
          }
        }
        
        final_cols <- if (is.null(columns)) base_cols else modifyList(base_cols, columns)
        final_cols <- final_cols[names(final_cols) %in% names(dt)]

        # Numbers right-aligned, per project/ReportingRate.dc.html's table -- unless the caller already set one.
        for (nm in names(final_cols)) {
          # year/month are identifiers, left-aligned like the design's own Year column, not figures.
          if (is.numeric(dt[[nm]]) && !nm %in% c("year", "month") && is.null(final_cols[[nm]]$align)) {
            final_cols[[nm]]$align <- "right"
          }
        }

        dt %>%
          reactable(
            columns = final_cols,
            defaultColDef = colDef(
              minWidth = 110, # keeps a name from breaking mid-word; a wide table scrolls sideways instead
              cell = function(value) {
                if (!is.numeric(value)) {
                  return(value)
                }
                format(round(value), nsmall = 0)
              }
            )
          )
      })

      if (!is.null(excel_write_fun) && is.function(excel_write_fun)) {
        cd_download_button_server(
          id = "download_data",
          filename = reactive(paste0(filename(), "_", selected_value())),
          extension = extension,
          data = data,
          i18n = i18n,
          label = label_key,
          icon = "table",
          button_class = "cd-tool-btn cd-tool-btn--data",
          content = function(file, d) {
            wb <- createWorkbook()
            excel_write_fun(wb, d) # IMPORTANT: d is already evaluated data (not reactive)
            saveWorkbook(wb, file, overwrite = TRUE)
          }
        )
      }
      
      return(selected_value)
    }
  )
}
