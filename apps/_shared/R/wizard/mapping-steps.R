# Steps 6 and 7 (both always required -- step_status.R's wizard_step_defs; explicit user request, "map
# survey and map shapefile should not skip[,] user must review before moving to the next step"): the two
# mapping modals, extracted out of the old file_upload.R's single "Sub-national mapping" group into their
# own steps. modal_helpers.R's mapping_modal_ui()/mapping_modal_server() are unchanged -- only what wraps them
# moved.

# Shared by map_survey_server()/map_shapefile_server() below -- a second banner (cd_status_banner(), the same
# component national_rates.R's own prefill banner uses), placed under the "Mapping uploaded" success message,
# saying how much of what got saved was actually auto-matched vs reviewed/entered by the user. Explicit user
# request: MappingModal.tsx's own auto-match banner only ever shows once, inside the modal, while it's open --
# nothing on the step page itself said so afterward, and a user manually correcting a row had no way to signal
# that was their own input rather than another guess. `source` (modal_helpers.R's mapping_modal_server(),
# per-row "auto"/"user") is missing entirely on a mapping saved before this column existed (an old .rds
# resume) -- silently skip the note rather than guess at its provenance.
mapping_provenance_banner <- function(mapping_df, i18n) {
  if (is.null(mapping_df) || !("source" %in% colnames(mapping_df)) || nrow(mapping_df) == 0) {
    return(NULL)
  }

  n_auto <- sum(mapping_df$source == "auto")
  n_user <- sum(mapping_df$source == "user")

  key <- if (n_user == 0) {
    "lbl_map_summary_all_auto"
  } else if (n_auto == 0) {
    "lbl_map_summary_all_user"
  } else {
    "lbl_map_summary_mixed"
  }

  text <- str_glue_data(list(n = n_auto + n_user, n_auto = n_auto, n_user = n_user), i18n$t(key))
  cd_status_banner("info", "title_msg_map_summary", text, i18n = i18n)
}

map_survey_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_card(
    title = i18n$t("title_upload_group_mapping"),
    subtitle = i18n$t("sub_upload_group_mapping"),
    status = "success",
    solidHeader = TRUE,
    width = 12,
    uiOutput(ns("body"))
  )
}

map_survey_server <- function(id, cache, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      survey_message_box <- cd_message_server("survey_feedback", i18n = i18n)

      # regional_survey's own active binding already falls back to cd2030.core's bundled default once a
      # country is known (same override-with-fallback pattern shapefile/un_estimates/... all use) -- so this
      # is never NULL once cache() itself exists, whether or not the user has uploaded their OWN regional
      # survey file yet. That's what makes always showing the mapping trigger below safe (see body's own
      # comment): there's always something real to match against, the bundled default if nothing else.
      survey_data <- reactive({
        req(cache())
        cache()$regional_survey
      })

      # No is_default()/fallback confusion here unlike the survey_files step -- survey_mapping's own active
      # binding is a plain getter with no package-bundled default, so is.null() already means exactly "nothing
      # mapped yet".
      survey_map <- reactive({
        req(cache())
        cache()$survey_mapping
      })

      # Was a flat "not mapped yet" info message ("title_msg_action_needed" -- "Set on another page", a stale
      # title left over from a different context, misleading here since the actual mapping control is right
      # below this message, not elsewhere). Was, for a while, further split into "required" (a real name
      # mismatch was found) vs "optional" (everything already matches, or nothing's uploaded to mismatch
      # against yet) -- reverted: explicit user request, this step is now always required, review or not
      # ("map survey and map shapefile should not skip[,] user must review before moving to the next step...
      # the only optional part are file uploads"), so it's always either "not reviewed yet" (warning) or
      # "reviewed" (success), never "optional". Same message logic map_shapefile_server() uses below.
      observe({
        req(cache())
        if (!is.null(survey_map())) {
          survey_message_box$update_message("msg_upload_survey_mapped", "success", title = "title_msg_mapped")
        } else {
          survey_message_box$update_message("msg_upload_mapping_required", "warning", title = "title_msg_mapping_required")
        }
      })
      restore_default_control(ns, output, input, "survey_map_restore", "survey_mapping", cache, function() cache()$clear_survey_mapping(), "btn_upload_clear_mapping", i18n)

      mapping_modal_server(
        id = "survey_data",
        cache = cache,
        survey_data = survey_data,
        survey_map = survey_map,
        label = "btn_upload_map_survey",
        title = "msg_upload_manual_mapping",
        show_col = "adminlevel_1",
        type = "survey_mapping",
        i18n = i18n
      )

      # Was gated on relevant() (!is_default("regional_survey")) -- hid the mapping trigger entirely, behind
      # just msg_upload_map_survey_nothing_yet's own placeholder, until the user had uploaded their OWN
      # regional survey file. Explicit user request: keep the mapping option available either way, same as
      # map_shapefile_server() below already does unconditionally (a shapefile is always available, the bundled
      # default if nothing else) -- survey_data() above is exactly as safe to map against right now, for the
      # same reason.
      output$survey_map_summary <- renderUI(mapping_provenance_banner(survey_map(), i18n))

      output$body <- renderUI({
        req(cache())
        tagList(
          div(class = "cd-wizard-mapping-trigger", mapping_modal_ui(ns("survey_data")), uiOutput(ns("survey_map_restore"))),
          cd_message_ui(ns("survey_feedback")),
          uiOutput(ns("survey_map_summary"))
        )
      })
    }
  )
}

map_shapefile_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_card(
    title = i18n$t("title_upload_map_shapefile"),
    subtitle = i18n$t("sub_upload_map_shapefile"),
    status = "success",
    solidHeader = TRUE,
    width = 12,
    div(class = "cd-wizard-mapping-trigger", mapping_modal_ui(ns("map_data")), uiOutput(ns("map_map_restore"))),
    cd_message_ui(ns("map_feedback")),
    uiOutput(ns("map_map_summary"))
  )
}

# No "relevant" gating here unlike Map Survey Files above -- a shapefile is always available (the package's own
# built-in one, per shapefile_step.R's Phase-1 stub), so there's always something to map against, whether or
# not a custom shapefile upload exists yet.
map_shapefile_server <- function(id, cache, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      map_message_box <- cd_message_server("map_feedback", i18n = i18n)

      # cache()$shapefile, not a direct get_country_shapefile() call -- Phase 3 of the wizard
      # redesign gave CacheConnection an override-with-fallback shapefile field (same pattern as
      # regional_survey): this already resolves to the user's uploaded shapefile once one exists,
      # falling back to the bundled default otherwise, so this step maps against whichever is
      # actually active instead of always the bundled one regardless.
      map_data <- reactive({
        req(cache())
        cache()$shapefile
      })

      map_map <- reactive({
        req(cache())
        cache()$map_mapping
      })

      # Same fix, same reason -- see map_survey_server()'s own identical observe() above.
      observe({
        req(cache())
        if (!is.null(map_map())) {
          map_message_box$update_message("msg_upload_map_mapping_uploaded", "success", title = "title_msg_mapped")
        } else {
          map_message_box$update_message("msg_upload_mapping_required", "warning", title = "title_msg_mapping_required")
        }
      })
      restore_default_control(ns, output, input, "map_map_restore", "map_mapping", cache, function() cache()$clear_map_mapping(), "btn_upload_clear_mapping", i18n)

      output$map_map_summary <- renderUI(mapping_provenance_banner(map_map(), i18n))

      mapping_modal_server(
        id = "map_data",
        cache = cache,
        survey_data = map_data,
        survey_map = map_map,
        label = "btn_upload_map_mapping",
        title = "title_upload_map_mapping_modal",
        # A function, not a fixed string -- shapefile_step.R's Phase 3 name-field picker means this
        # can genuinely change (bundled default "NAME_1" vs whatever an uploaded shapefile's own
        # column is called); mapping_modal_server() resolves this fresh at each use, not once at setup.
        show_col = function() { req(cache()); cache()$shapefile_name_field },
        type = "map_mapping",
        i18n = i18n
      )
    }
  )
}
