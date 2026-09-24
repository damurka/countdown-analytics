# Step 1's secondary content: the UN/WUENIC/UN Mortality reference-data uploads, shown alongside the main
# dataset picker (upload_box.R) rather than as their own wizard step -- these are alternate/override reference
# *files*, not rate values (step 3) or survey microdata (step 4), so they belong with the main upload. Extracted
# verbatim out of the old file_upload.R (which used to bundle this with the survey-folder upload and the two
# mapping modals in one box) -- no behavior changes here beyond what's noted inline.
#
# restore_default_control(): a small "Restore default" link shown only while `field` currently holds a user
# override (cache()$is_default(field) is FALSE -- un_estimates/un_mortality_estimates/wuenic_estimates never
# actually return NULL once a country is set, they fall back to the package's own bundled dataset instead, so
# this is the only way to ask "is this the built-in default or something the user uploaded"). No longer used by
# THIS file's own three fields below -- they now fold "restore default" into the upload zone's own Reset icon
# instead of a separate link sitting below the box (see reference_estimates_server()'s own input$X_data_reset
# observers). Still defined here and reused by mapping_steps.R (sourced after this file, same as
# national_rates.R's nr_group() is already reused by other files via plain source-order availability), which
# keeps its own separate below-box link for now.
restore_default_control <- function(ns, output, input, output_id, field, cache, clear_fn, label_key, i18n) {
  output[[output_id]] <- renderUI({
    req(cache())
    if (isTRUE(cache()$is_default(field))) return(NULL)
    cd_button(ns(output_id), label_key, i18n, icon = "rotate-left", variant = "link", class = "cd-restore-link")
  })
  observeEvent(input[[output_id]], {
    req(cache())
    clear_fn()
  })
}

# Re-pushes cd_set_file_upload() to a file-upload zone every time it (re)mounts, for any field currently holding a
# non-default value -- explicit user request ("some survey files were uploaded but not visible when editing")
# after confirming live this is the exact same bug upload_box.R's own hfd_file zone had (see its own long
# comment on cd_remounted() vs cd_mounted() for the full mechanism: a step's whole panel, including every zone in
# it, gets torn down and rebuilt on a landing-page Edit link, and a freshly mounted FileUploadZone.tsx starts
# back at its own empty "Browse or drop" state with nothing telling it a real file is already on file). Unlike
# hfd_file, none of these zones ever had anywhere durable to keep the ORIGINAL filename once their one-shot
# upload observer exits -- filename_val (a per-field reactiveVal, set by the caller alongside its own
# cd_set_file_upload() call in the upload success branch, cleared in its own _reset observer) fixes that for a file
# uploaded THIS session; a field that's non-default for a reason that never went through this session's own
# upload observer at all (a resumed .rds, Electron's cdsuite_file auto-load pre-populating the main dataset)
# never had a filename captured here either, so this falls back to a generic translated label instead of
# silently showing nothing.
push_upload_on_remount <- function(input, session, i18n, input_id, field, cache, filename_val) {
  remounted <- cd_remounted(input, input_id)
  observe({
    req(remounted(), cache())
    if (!isTRUE(cache()$is_default(field))) {
      cd_set_file_upload(input_id, filename_val() %||% i18n$t("lbl_upload_file_on_record"), session)
    }
  })
}

# No cd_card() wrapper here either (see upload_box.R's own comment) -- this renders as a second, divided section
# inside the SAME card upload_box_ui() opens, using nr_group()'s exact heading markup (national_rates.R, sourced
# before this file) for visual consistency with every other labeled field group in the app, rather than a
# second .cd-card of its own directly under the first.
# Which zones show is the app's own (cd_wizard_config()$reference_uploads, wizard-config.R): UN mortality estimates
# only feed the rmncah mortality pages, so vaxx leaves that one out.
reference_estimates_ui <- function(id, i18n) {
  ns <- NS(id)
  uploads <- cd_wizard_config()$reference_uploads

  zone <- function(input_id, label_key, error_id) {
    div(
      class = "cd-field-stack",
      cd_file_upload(ns(input_id), label = label_key, hint = "hint_upload_dta_format", accept = ".dta", i18n = i18n),
      uiOutput(ns(error_id))
    )
  }

  tagList(
    tags$hr(class = "cd-card-divider"),
    nr_group(
      i18n, "title_upload_group_estimates", "sub_upload_group_estimates",
      cols = length(uploads),
      if ("un_estimates" %in% uploads) zone("un_data", "title_upload_un_estimates", "un_error"),
      if ("wuenic_estimates" %in% uploads) zone("wuenic_data", "title_upload_wuenic", "wuenic_error"),
      if ("un_mortality_estimates" %in% uploads) zone("un_mortality_data", "title_upload_un_mortality", "un_mortality_error")
    )
  )
}

reference_estimates_server <- function(id, cache, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns
      uploads <- cd_wizard_config()$reference_uploads

      # cache()$data_years, not cache()$countdown_data directly -- Phase 3 of the wizard redesign
      # means countdown_data stays NULL for the whole walkthrough (a fresh Excel upload only gets
      # wizard_parts until Finish), but data_years already has its own wizard-mode fallback
      # (CacheConnection, cd2030.core) and gives exactly the min/max years set_un_estimates() below
      # actually needs either way. Confirmed live: reading countdown_data directly here meant
      # req(data(), input$un_data) never passed during a fresh upload, so "Upload UN Estimates data"
      # silently did nothing at all, the whole time the wizard's own Upload Data step is open.
      data_years <- reactive({
        req(cache())
        cache()$data_years
      })

      country_iso <- reactive({
        req(cache())
        cache()$country_iso
      })

      # The originally-uploaded filename for each field, THIS session only -- see push_upload_on_remount()'s
      # own comment above for why these exist at all (nothing else durably holds it once the upload observer
      # below exits).
      un_filename <- reactiveVal(NULL)
      wuenic_filename <- reactiveVal(NULL)
      un_mortality_filename <- reactiveVal(NULL)

      # Error only, same pattern as upload_box.R's own output$upload_status -- a successful upload is shown by
      # the zone itself switching to its "already uploaded" state (cd_set_file_upload(), same mechanism the main
      # Dataset zone uses), not a separate "Using default data"/"Upload successful" message box underneath it.
      # There's nothing to show for the default/no-override case any more either -- every field already defaults
      # to the app's own bundled data unless overridden, which doesn't need its own explicit notice.
      upload_error <- function(output_id, e) {
        output[[output_id]] <- renderUI({
          cd_status_banner("error", "title_msg_upload_failed", "err_upload_unsupported", i18n = i18n)
        })
      }

      observeEvent(input$un_data, {
        req(data_years(), input$un_data)
        file_name <- input$un_data$name
        output$un_error <- renderUI(NULL)

        tryCatch({
          start_year <- min(data_years())
          end_year <- robust_max(data_years(), 2024)
          un <- load_un_estimates(path = input$un_data$datapath,
                                  country_iso = country_iso(),
                                  start_year = start_year,
                                  end_year = end_year)
          cache()$set_un_estimates(un)
          un_filename(file_name)
          cd_set_file_upload("un_data", file_name, session)
        },
        error = function(e) {
          print(e)
          upload_error("un_error", e)
        })
      })
      push_upload_on_remount(input, session, i18n, "un_data", "un_estimates", cache, un_filename)

      # cache(), not data()/data_years() -- this only needs to know "a (possibly new) cache exists",
      # not the years themselves, and cache() itself changes on both a fresh wizard upload and a
      # resumed .rds alike, unlike the old data() (broken the same way for this observer -- never
      # fired during the wizard at all). Safe to fire more often than strictly necessary: the
      # is_default() guards below make an extra, redundant reset a no-op.
      observeEvent(cache(), {
        req(cache())
        # cd_reset_file_upload() is a plain custom message (see its own comment, _shared/R/core (and components/)): a reset
        # sent to a zone that hasn't mounted yet just has no listener and does nothing, same as shinyjs::reset()
        # always behaved.
        if (isTRUE(cache()$is_default("un_estimates"))) {
          cd_reset_file_upload("un_data")
        }
        if (isTRUE(cache()$is_default("wuenic_estimates"))) {
          cd_reset_file_upload("wuenic_data")
        }
        if ("un_mortality_estimates" %in% uploads && isTRUE(cache()$is_default("un_mortality_estimates"))) {
          cd_reset_file_upload("un_mortality_data")
        }
      })

      # The zone's own "Reset" icon (FileUploadZone.tsx) fires this as a plain input value on click -- no
      # separate "Restore default" link sitting below the box any more (see its own comment for why this is a
      # SEPARATE event from input$un_data itself: clicking Reset clears the picker locally without picking a
      # new file, so it never produces a fresh file-input change event to hook). Already-cleared client-side by
      # the time this fires, so no cd_reset_file_upload() echo needed back.
      observeEvent(input$un_data_reset, {
        req(cache())
        cache()$clear_un_estimates()
        un_filename(NULL)
      })

      observeEvent(input$wuenic_data, {
        req(cache())
        file_name <- input$wuenic_data$name
        output$wuenic_error <- renderUI(NULL)

        tryCatch({
          wuenic <- load_wuenic_data(path = input$wuenic_data$datapath,
                                     country_iso = country_iso())
          cache()$set_wuenic_estimates(wuenic)
          wuenic_filename(file_name)
          cd_set_file_upload("wuenic_data", file_name, session)
        },
        error = function(e) {
          upload_error("wuenic_error", e)
        })
      })
      push_upload_on_remount(input, session, i18n, "wuenic_data", "wuenic_estimates", cache, wuenic_filename)

      observeEvent(input$wuenic_data_reset, {
        req(cache())
        cache()$clear_wuenic_estimates()
        wuenic_filename(NULL)
      })

      # UN Mortality Estimates -- mirrors un_data's own observer exactly (load_un_mortality_data() has a
      # simpler signature, no start_year/end_year needed).
      observeEvent(input$un_mortality_data, {
        req(cache())
        file_name <- input$un_mortality_data$name
        output$un_mortality_error <- renderUI(NULL)

        tryCatch({
          mortality <- load_un_mortality_data(path = input$un_mortality_data$datapath,
                                              country_iso = country_iso())
          cache()$set_un_mortality_estimates(mortality)
          un_mortality_filename(file_name)
          cd_set_file_upload("un_mortality_data", file_name, session)
        },
        error = function(e) {
          upload_error("un_mortality_error", e)
        })
      })
      push_upload_on_remount(input, session, i18n, "un_mortality_data", "un_mortality_estimates", cache, un_mortality_filename)

      observeEvent(input$un_mortality_data_reset, {
        req(cache())
        cache()$clear_un_mortality_estimates()
        un_mortality_filename(NULL)
      })
    }
  )
}
