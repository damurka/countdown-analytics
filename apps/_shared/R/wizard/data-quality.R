# Step 2 (Phase 3 of the Load Data wizard redesign): only sheet/file existence
# (chk_dq_files_sheets) is still a hard, parse-time blocker enforced unconditionally inside
# cd2030.core's own load_excel_parts() -- a real failure there never lets the wizard reach this
# step at all (upload_box.R's load_file() leaves initial_cache() at NULL and status() at an error
# state on failure), so reaching this screen already means that one passed; it's the only remaining
# static "already enforced" row.
#
# Everything else genuinely runs HERE, against the wizard's own separate, unmerged per-sheet data
# (cache()$wizard_parts) via cd2030.core's run_all_quality_checks(cache()) -- the non-aborting
# counterpart to the aborting run_quality_checks() the load pipeline still uses for its own
# immediate, structural aborts (missing sheets/key columns). This includes checks that used to be
# static "always enforced" rows before this redesign (admin sheet columns, single country, country
# recognized, district consistency, missing/mismatched months) -- they're real, can genuinely fail,
# and are attributed to the specific sheet they came from where possible (district_cross_sheet in
# particular -- the direct fix for merge_data()'s own left-join-anchored-on-admin silently dropping
# rows before any check used to see them). Population/service collision + indicator emptiness stay
# informational (never block); survey/shapefile admin-name matching stays informational too -- Steps 6/7
# (Map Survey/Map Shapefile) are always required regardless of what this finds (step_status.R's
# wizard_step_defs), but still read this to decide what a row in the mapping modal needs flagging.
#
# One accepted, documented gap (see check_country_recognized()'s own comment, cd2030.core): "every
# indicator the selected group needs is present" only runs for real at Finish now (it checks columns
# standardize_data() computes/renames during the merge itself -- a pre-merge version produces false
# positives against columns that exist, just not yet under their final names). Finish's own error
# handling (wizard_panels.R) is the backstop for this one specific check.
#
# cd_spinner() (already used this way throughout the app -- see e.g. modules/1a_overall_score.R)
# around the output gives an honest "this is being computed" moment for the real, if brief, server
# round-trip, rather than inventing a fake progress bar for checks that run in milliseconds once
# cache() exists.
#
# Plain server-rendered text throughout (i18n$t() + str_glue_data()), not cd_text()/tr() -- this
# content goes through renderUI(), which usei18n(i18n)'s own DOM-scanning translator already
# re-translates live, the same convention wizard_landing.R's step_summary() already established.
data_quality_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_card(
    title = i18n$t("title_upload_data_quality"),
    subtitle = i18n$t("sub_upload_data_quality"),
    status = "success",
    solidHeader = TRUE,
    width = 12,
    cd_spinner(uiOutput(ns("checklist")))
  )
}

data_quality_server <- function(id, cache, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {

      # A pass/warn row, shared shape for the dynamic sections below -- mirrors the static rows'
      # own icon-plus-text layout (cd-wizard-dq-row), just with a warning-state modifier and an
      # optional second line of detail instead of always being a plain pass. `info_key` (optional):
      # a translation key with a longer "what this measures and how" explanation. Rather than a
      # separate icon next to the text, the row's OWN pass/fail glyph doubles as the tooltip trigger
      # (cd_tooltip(status=...), Tooltip.tsx) -- hovering (or focusing/clicking, for keyboard and
      # touch) the tick/warning icon a user is already looking at reveals the explanation, instead of
      # adding a second interactive element to each row. Falls back to the plain, non-interactive
      # icon when no info_key is given.
      dq_row <- function(ok, pass_text, warn_text, info_key = NULL) {
        div(
          class = paste("cd-wizard-dq-row", if (!ok) "cd-wizard-dq-row--warn"),
          if (!is.null(info_key)) {
            cd_tooltip(info_key, i18n = i18n, status = if (ok) "pass" else "warn")
          } else {
            icon(if (ok) "circle-check" else "triangle-exclamation",
                 class = paste("cd-wizard-dq-row__icon", if (ok) "cd-wizard-dq-row__icon--pass" else "cd-wizard-dq-row__icon--warn"))
          },
          div(if (ok) pass_text else warn_text)
        )
      }

      # The blocking checks' own `detail` (0_data_quality_checks.R) is already a complete,
      # pre-formatted (English-only -- a real, accepted limitation, same as any R condition message
      # surfaced elsewhere in this app) sentence built server-side via cd_fmt(), not raw data --
      # shown directly, not run through i18n templating the way the other 4 checks' raw detail is.
      # `r` is NULL, not skipped by the caller, whenever run_all_quality_checks() took the OTHER
      # branch than the one this particular row belongs to (e.g. a resumed .rds/edit-mode cache,
      # where only the 3 original post-merge checks exist in `results` -- see this file's own header
      # comment) -- returning NULL here (nothing rendered) rather than a misleading always-red row.
      dq_prose_row <- function(r, pass_key, info_key = NULL) {
        if (is.null(r)) return(NULL)
        dq_row(isTRUE(r$ok), i18n$t(pass_key), paste(r$detail, collapse = " "), info_key)
      }

      # The other 4 checks return raw data (a tibble or a character vector of names) as their own
      # `detail` -- this fills {n}/{fields} into this step's own translated warn template.
      dq_data_row <- function(r, pass_key, warn_key, info_key = NULL) {
        detail <- r$detail
        n <- if (is.data.frame(detail)) nrow(detail) else length(detail)
        fields <- if (is.character(detail)) paste(detail, collapse = ", ") else NA
        dq_row(isTRUE(r$ok), i18n$t(pass_key), str_glue_data(list(n = n, fields = fields), i18n$t(warn_key)), info_key)
      }

      # check_month_language_consistency()'s own `detail` is a 2-column tibble (month, variants) --
      # not a plain data-frame-row-count or a flat character vector the way dq_data_row() above
      # expects, so it gets its own small formatter: one "January (Janvier, January)" style line per
      # affected month, comma-joined.
      dq_month_language_row <- function(r, pass_key, warn_key, info_key = NULL) {
        if (is.null(r)) return(NULL)
        detail <- r$detail
        n <- nrow(detail)
        fields <- if (n > 0) {
          paste(paste0(detail$month, " (", detail$variants, ")"), collapse = "; ")
        } else {
          NA
        }
        dq_row(isTRUE(r$ok), i18n$t(pass_key), str_glue_data(list(n = n, fields = fields), i18n$t(warn_key)), info_key)
      }

      output$checklist <- renderUI({
        req(cache())
        results <- run_all_quality_checks(cache())

        # The one check that's still a genuine, unconditional parse-time abort (see this file's own
        # header comment) -- reaching this screen at all already means it passed.
        passed_keys <- c("chk_dq_files_sheets")
        all_blocking_ok <- all(vapply(results, function(r) !identical(r$severity, "blocking") || isTRUE(r$ok), logical(1)))

        tagList(
          if (all_blocking_ok) {
            div(class = "cd-wizard-dq-banner", icon("circle-check"), i18n$t("msg_dq_all_passed"))
          } else {
            div(class = "cd-wizard-dq-banner cd-wizard-dq-banner--warn", icon("triangle-exclamation"), i18n$t("msg_dq_issues_found"))
          },
          div(
            class = "cd-wizard-dq-list",
            lapply(passed_keys, function(k) {
              div(
                class = "cd-wizard-dq-row",
                cd_tooltip("pop_dq_files_sheets", i18n = i18n, status = "pass"),
                div(i18n$t(k))
              )
            }),
            dq_prose_row(results$admin_columns, "chk_dq_admin_columns", "pop_dq_admin_columns"),
            dq_prose_row(results$single_country, "chk_dq_single_country", "pop_dq_single_country"),
            dq_prose_row(results$country_recognized, "chk_dq_country_match", "pop_dq_country_match"),
            dq_prose_row(results$district_cross_sheet, "chk_dq_district_cross_sheet", "pop_dq_district_cross_sheet"),
            dq_prose_row(results$district_consistency, "chk_dq_district_consistency", "pop_dq_district_consistency"),
            dq_prose_row(results$month_presence, "chk_dq_month_presence", "pop_dq_month_presence"),
            dq_prose_row(results$month_validity, "chk_dq_month_validity", "pop_dq_month_validity")
          ),
          div(
            class = "cd-wizard-dq-upcoming",
            tags$div(class = "cd-wizard-dq-upcoming__label", i18n$t("lbl_dq_informational")),
            div(
              class = "cd-wizard-dq-list",
              # Moved out of the blocking list above (severity is now "informational" in cd2030.core --
              # see check_population_vs_births()'s own call site there): a live population-vs-reported-births
              # gap can be a real problem, but can just as easily be legitimate (migration, cross-boundary
              # catchment areas, a stale population estimate), so it's the user's own call, not something
              # that should stop them finishing the wizard. Still dq_prose_row(), not dq_data_row() -- its
              # `detail` is the same pre-formatted sentence the blocking checks use, not a tibble/character
              # vector dq_data_row()'s {n}/{fields} template expects.
              dq_prose_row(results$population_vs_births, "chk_dq_population_vs_births", "pop_dq_population_vs_births"),
              dq_data_row(results$population_service_collision, "msg_dq_collision_pass", "msg_dq_collision_warn", "pop_dq_collision"),
              dq_data_row(results$indicator_emptiness, "msg_dq_emptiness_pass", "msg_dq_emptiness_warn", "pop_dq_emptiness"),
              dq_month_language_row(results$month_language_consistency, "msg_dq_month_language_pass", "msg_dq_month_language_warn", "pop_dq_month_language")
            )
          ),
          div(
            class = "cd-wizard-dq-upcoming",
            tags$div(class = "cd-wizard-dq-upcoming__label", i18n$t("lbl_dq_mapping")),
            div(
              class = "cd-wizard-dq-list",
              dq_data_row(results$survey_admin_names, "msg_dq_survey_names_pass", "msg_dq_survey_names_warn", "pop_dq_survey_names"),
              dq_data_row(results$shapefile_admin_names, "msg_dq_shapefile_names_pass", "msg_dq_shapefile_names_warn", "pop_dq_shapefile_names")
            )
          )
        )
      })
    }
  )
}
