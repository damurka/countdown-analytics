# The landing view a resumed, previously-validated .rds gets instead of the walkthrough (see wizard_panels.R's
# own comment on why this is a distinct page, not the rail with everything unlocked). A "ready for analysis"
# banner with a CTA back into the app, and a status row per wizard step with an inline Edit link that hands off
# to wizard_panels.R's jump_to_step() (passed in as `on_edit`) to open that step's own panel in edit mode.
#
# Plain i18n$t()/renderUI() text throughout, not cd_text()/tr()+useLang() -- this is regular server-rendered
# markup (usei18n(i18n)'s own DOM-scanning translator already re-translates it live on a language switch, the
# same as every other box title/label in this app), not a React-pushed custom message, which is the ONLY case
# that actually needed the heavier {en,fr,pt}-object treatment (see cd_message_server()'s own history this
# session).
wizard_landing_ui <- function(id) {
  ns <- NS(id)
  tagList(
    uiOutput(ns("banner")),
    div(class = "cd-wizard-landing-card", uiOutput(ns("rows")))
  )
}

# on_edit: function(step_key) -- wizard_panels.R's jump_to_step(), switching the wizard into edit mode on that
# step. Not wired here as a reactive return value: this module's whole reason to exist is triggering that one
# side effect, so a plain callback is simpler than round-tripping a value through the caller.
# just_finished: reactive(logical) -- TRUE when this page is showing because the wizard's own Finish action was
# just clicked (wizard_panels.R), FALSE when it's showing because a previously-saved .rds was resumed. Only
# changes the banner's own subtitle (below); everything else here is already generic to "whatever's in cache()
# now", not resume-specific.
wizard_landing_server <- function(id, cache, step_defs, i18n, on_edit, just_finished) {
  stopifnot(is.reactive(cache))
  stopifnot(is.function(on_edit))
  stopifnot(is.reactive(just_finished))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      # One short, parameterized line per step describing its CURRENT state -- deliberately separate from
      # step_status.R's complete/locked booleans (those answer "can I proceed", this answers "what's actually
      # here right now"), and only meaningful for a resumed .rds, where by definition every step already has
      # something to describe.
      step_summary <- function(step_key, cd) {
        switch(step_key,
          upload = if (!is.null(cd$countdown_data)) {
            str_glue_data(list(rows = format(nrow(cd$countdown_data), big.mark = ",")), i18n$t("msg_wizard_summary_rows"))
          },
          quality = i18n$t("msg_wizard_summary_quality_ok"),
          national_rates = {
            total <- length(national_rates_required_fields()) + length(survey_estimates_required_fields()) + 1
            missing <- sum(is.na(unlist(cd$national_estimates[national_rates_required_fields()]))) +
              sum(is.na(cd$survey_estimates[survey_estimates_required_fields()])) +
              as.integer(is.null(cd$survey_year))
            str_glue_data(list(set = total - missing, total = total), i18n$t("msg_wizard_summary_fields"))
          },
          survey_files = {
            n <- sum(vapply(survey_fields, function(f) !isTRUE(cd$is_default(f)), logical(1)))
            # "0 of 5 files uploaded" (n == 0, nothing uploaded, purely optional) reads like the user failed
            # to do something they were supposed to -- explicit user request: say what's actually happening
            # instead ("Using built-in reference data"), same framing shapefile's own default case already
            # uses below. The {n} of {total} count stays for a genuine partial upload (n > 0), where it's a
            # real, meaningful state worth surfacing precisely, not just "some vs. none".
            if (n == 0) i18n$t("msg_wizard_summary_survey_files_default") else str_glue_data(list(n = n, total = length(survey_fields)), i18n$t("msg_wizard_summary_files"))
          },
          # Was unconditionally "Using the built-in shapefile" regardless of whether a custom one was
          # actually uploaded -- a real bug (claimed default even with a real upload set), found and fixed
          # alongside the survey_files wording above.
          shapefile = if (isTRUE(cd$is_default("shapefile"))) i18n$t("msg_wizard_summary_shapefile_default") else i18n$t("title_upload_shapefile_custom"),
          survey_mapping = if (!is.null(cd$survey_mapping)) {
            str_glue_data(list(n = nrow(cd$survey_mapping)), i18n$t("msg_wizard_summary_mapped"))
          } else {
            i18n$t("msg_wizard_summary_not_mapped")
          },
          map_mapping = if (!is.null(cd$map_mapping)) {
            str_glue_data(list(n = nrow(cd$map_mapping)), i18n$t("msg_wizard_summary_mapped"))
          } else {
            i18n$t("msg_wizard_summary_not_mapped")
          },
          NULL
        )
      }

      output$banner <- renderUI({
        req(cache())
        div(
          class = "cd-wizard-landing-banner",
          div(class = "cd-wizard-landing-banner__icon", icon("check")),
          div(
            class = "cd-wizard-landing-banner__text",
            div(class = "cd-wizard-landing-banner__title", i18n$t("title_wizard_ready")),
            div(
              class = "cd-wizard-landing-banner__desc",
              i18n$t(if (isTRUE(just_finished())) "sub_wizard_finished" else "sub_wizard_ready")
            )
          ),
          cd_button(ns("continue"), "btn_wizard_continue", i18n, variant = "bare", class = "cd-wizard-landing-banner__cta")
        )
      })

      # reporting_rate: the first Data Quality Assessment page in this app's own nav order (app.R's own
      # cd_nav_sections -- "Data Quality Assessment"'s first child) -- explicit user request, a validated
      # dataset's natural next stop is reviewing data quality before analysis, not analysis itself.
      observeEvent(input$continue, {
        cd_navigate_to(session, "reporting_rate")
      })

      output$rows <- renderUI({
        req(cache())
        cd <- cache()
        # requires_walkthrough = FALSE: this landing page only ever shows for an already-unlocked, resumed
        # session (see this file's own header comment) -- matches how the real wizard rail itself resolves
        # `required` for these exact same steps, so nothing here disagrees with it. current = NULL: this
        # page has no "current step" concept of its own; unused by anything read below (status, locked).
        states <- compute_step_states(cd, current = NULL, requires_walkthrough = FALSE, step_defs = step_defs)
        tagList(Map(function(def, state) {
          summary_text <- step_summary(def$key, cd)
          div(
            class = "cd-wizard-landing-row",
            div(
              class = "cd-wizard-landing-row__text",
              div(
                class = "cd-wizard-landing-row__label",
                i18n$t(def$title_key),
                # state$required, NOT def$required -- the static def value is FALSE for survey_mapping/
                # map_mapping unconditionally (they resolve theirs dynamically via required_fn instead, see
                # step_status.R), so reading it directly here meant the "optional" badge showed even once a
                # real name mismatch had made a mapping step genuinely mandatory. Explicit user request:
                # "optional" for every other optional step, but never for a mapping step that's actually
                # required right now -- compute_step_states() has already done this exact resolution.
                if (!isTRUE(state$required)) span(class = "cd-wizard-landing-row__optional", i18n$t("lbl_wizard_optional"))
              ),
              if (!is.null(summary_text)) div(class = "cd-wizard-landing-row__summary", summary_text)
            ),
            cd_button(ns(paste0("edit_", def$key)), "btn_wizard_edit", i18n, variant = "bare", class = "cd-wizard-landing-row__edit")
          )
        }, step_defs, states))
      })

      # One observeEvent per step, matching file_upload.R's own restore_default_control() pattern for a
      # dynamically-id'd actionLink built inside renderUI(): the handler has to be registered once, at the
      # module's top level, not inside the renderUI that (re)creates the link itself.
      lapply(step_defs, function(def) {
        local({
          step_key <- def$key
          observeEvent(input[[paste0("edit_", step_key)]], {
            on_edit(step_key)
          })
        })
      })
    }
  )
}
