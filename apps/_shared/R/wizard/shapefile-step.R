# Step 5 (optional): Shapefile. Real folder upload (Phase 3 of the Load Data wizard redesign) --
# was a Phase 1 stub (no upload existed anywhere in this codebase; step_shapefile_complete() always
# returned TRUE and never blocked anything). Reuses cd_directory_upload() -- the same generic
# folder-upload component survey_upload.R already uses (FileUploadZone.tsx with directory = TRUE,
# riding Shiny's own built-in multi-file-upload binding) -- and cd2030.core's new
# read_shapefile_folder() (reassembles the scattered per-file temp paths Shiny hands back into one
# directory sf::st_read() can actually open) + CacheConnection$set_shapefile()/
# set_shapefile_name_field() (an override-with-fallback-to-the-bundled-default field, same pattern
# as regional_survey).
#
# The bundled shapefile always uses NAME_1 for its admin-1 column, but a real user-uploaded one
# won't necessarily -- hence the column picker below: an upload isn't "done" (step_shapefile_complete(),
# step_status.R) until the user has actually picked which column that is.
shapefile_step_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_card(
    title = i18n$t("title_upload_shapefile"),
    subtitle = i18n$t("sub_upload_shapefile"),
    status = "success",
    solidHeader = TRUE,
    width = 12,
    div(
      class = "cd-field-grid",
      style = "grid-template-columns: 1fr;",
      div(
        class = "cd-field-stack",
        cd_directory_upload(
          ns("shapefile_select"), label = "title_upload_shapefile_folder", accept = ".shp,.dbf,.shx,.prj",
          i18n = i18n
        ),
        uiOutput(ns("upload_error")),
        uiOutput(ns("name_field_picker")),
        uiOutput(ns("status"))
      )
    )
  )
}

shapefile_step_server <- function(id, cache, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      # Error only, same convention every other upload zone in this wizard already settled on (upload_box.R,
      # reference_estimates.R, survey_upload.R) -- was cd_message_server() with a persistent default_message
      # ("Shapefile not set", title "Set on another page" -- a stale title from a different context, wrong
      # here since the actual control is right above this message, not on another page at all). That showed
      # unconditionally, forever, whether or not a shapefile upload was ever attempted -- explicit user
      # request: this box shouldn't be there at all when there's nothing wrong. output$status below (the
      # "Using the built-in shapefile"/"Custom shapefile set" banners) already says what's actually going on;
      # this is just for a genuine upload failure.
      tr_err <- function(clean_message) {
        str_glue_data(list(clean_message = clean_message), i18n$t("err_upload_failed_general"))
      }

      # The just-uploaded, not-yet-confirmed sf object -- held here until the user picks which
      # column holds admin-1 names (output$name_field_picker below). Saving straight to the cache
      # before that choice is made would leave check_shapefile_admin_names() reading whatever
      # shapefile_name_field's own default ("NAME_1") happens to fall back to, which a real upload
      # won't necessarily have.
      pending_shapefile <- reactiveVal(NULL)

      observeEvent(input$shapefile_select, {
        req(cache(), input$shapefile_select)
        output$upload_error <- renderUI(NULL)
        result <- tryCatch(
          list(ok = TRUE, value = read_shapefile_folder(input$shapefile_select)),
          error = function(e) list(ok = FALSE, message = clean_error_message(e))
        )
        if (!isTRUE(result$ok)) {
          output$upload_error <- renderUI(cd_status_banner("error", "title_msg_error", tr_err(result$message), i18n = i18n))
          pending_shapefile(NULL)
          return()
        }
        pending_shapefile(result$value)
      })

      output$name_field_picker <- renderUI({
        sf_data <- pending_shapefile()
        req(sf_data)
        geom_col <- attr(sf_data, "sf_column") %||% "geometry"
        cols <- setdiff(colnames(sf_data), geom_col)
        tagList(
          # cd_field_select(), not selectInput() -- same reasoning as national_rates.R's own survey_start_year
          # field (its comment has the full explanation): a native <select>, not a secretly-still-selectize one.
          cd_field_select(
            ns("name_field"), "lbl_shapefile_name_field", i18n = i18n,
            value = if ("NAME_1" %in% cols) "NAME_1" else cols[1], options = cd_plain_options(cols)
          ),
          cd_button(ns("confirm_shapefile"), "btn_upload_confirm_shapefile", i18n)
        )
      })

      observeEvent(input$confirm_shapefile, {
        req(cache(), pending_shapefile(), input$name_field)
        cache()$set_shapefile(pending_shapefile())
        cache()$set_shapefile_name_field(input$name_field)
        pending_shapefile(NULL)
      })

      # The zone's own "Reset" icon (FileUploadZone.tsx, same event every other upload zone in this wizard
      # already wires up) -- explicit user request, "review all file upload to ensure they show it was updated
      # and can be cleared": this was the one upload zone in the whole wizard with genuinely no way to undo a
      # confirmed custom shapefile at all (clear_shapefile() already existed on CacheConnection, cd2030.core --
      # nothing here ever called it). No cache()$set_shapefile_name_field(NULL) alongside it: that setter
      # validates against is_scalar_character() and would abort on NULL, but it doesn't need clearing anyway --
      # once cache()$is_default("shapefile") is TRUE again, step_shapefile_complete() (step_status.R) and this
      # file's own output$status short-circuit on is_default() before shapefile_name_field is ever read, so a
      # stale value just sits there unused, exactly like every other override-plus-config field pair in this
      # app already tolerates.
      observeEvent(input$shapefile_select_reset, {
        req(cache())
        cache()$clear_shapefile()
        pending_shapefile(NULL)
      })

      output$status <- renderUI({
        req(cache())
        is_default <- isTRUE(cache()$is_default("shapefile"))
        has_name_field <- !is.null(cache()$shapefile_name_field) && !is_default

        default_banner <- if (is_default) {
          cd_status_banner(
            "info", "title_upload_shapefile_default",
            str_glue_data(list(country = cache()$country), i18n$t("sub_upload_shapefile_default")),
            i18n = i18n
          )
        } else if (has_name_field) {
          cd_status_banner("success", "title_upload_shapefile_custom", "sub_upload_shapefile_custom", i18n = i18n)
        }

        # Proactive alert (point 4 of the wizard's progressive-validation design, matching
        # survey_upload.R's own) -- only meaningful once there's an actual, fully-configured
        # shapefile (bundled default, or an uploaded one with its name field picked) to check
        # against. Map Shapefile is already reachable, shows its real UI unconditionally, and is
        # always required regardless of what this finds (step_status.R's wizard_step_defs) -- alert
        # here either way, no forced navigation.
        mismatch_banner <- if (is_default || has_name_field) {
          mismatched <- tryCatch(cache()$check_shapefile_admin_names(), error = function(e) NULL)
          if (!is.null(mismatched) && nrow(mismatched) > 0) {
            cd_status_banner(
              "warning", "title_shapefile_names_mismatch",
              str_glue_data(list(n = nrow(mismatched)), i18n$t("sub_shapefile_names_mismatch")),
              i18n = i18n
            )
          }
        }

        tagList(default_banner, mismatch_banner)
      })
    }
  )
}
