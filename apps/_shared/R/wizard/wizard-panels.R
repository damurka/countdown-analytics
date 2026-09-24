wizard_steps_ui <- function(id) {
  ns <- NS(id)
  uiOutput(ns("body"))
}

# panels: list(list(key = <chr>, ui = <tagList>), ...), one per wizard_step_defs entry (step_status.R), same
# order. requires_walkthrough: reactive(logical) from upload_box_server() -- TRUE for a fresh Excel/Stata upload
# (the rail's sequential locking applies), FALSE for a resumed .rds (the landing view applies instead).
# source_path: reactive(character|NULL) from upload_box_server() -- the original uploaded file's path, needed
# only by the Finish action below to compute where the .rds should finally be written. active:
# reactive(logical) from app.R (identical(input$tabs, "upload_data")) -- TRUE exactly when Load Data is the
# currently-shown top-level page; used below to snap a finished cache back to its summary every time the user
# returns to this page, not just the one time Finish itself sets it (explicit user request, "when editing and
# i navigate away and come back to load if no changes it should refer back to summary").
wizard_steps_server <- function(id, i18n, cache, requires_walkthrough, panels, source_path, active, step_defs = wizard_step_defs) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(requires_walkthrough))
  stopifnot(is.reactive(source_path))
  stopifnot(is.reactive(active))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      # "steps" is the right default even before anything has loaded -- there's nothing to land on yet, and
      # step 1's own empty upload zone IS the wizard's natural starting point. Only switches to "landing" once
      # a load actually completes and turns out to have been a resumed .rds; an Excel/Stata upload leaves this
      # alone and the rail's own gating (compute_step_states()) takes it from there -- until Finish (see
      # input$footer_continue below) explicitly switches it once the walkthrough is actually done.
      view_mode <- reactiveVal("steps")
      # Distinguishes "landing because of a resumed .rds" from "landing because Finish was just clicked" --
      # wizard_landing.R needs this to show the right subtitle (sub_wizard_ready vs sub_wizard_finished); every
      # other part of that page (status rows, Edit links) is already generic to "whatever's in cache() now".
      just_finished <- reactiveVal(FALSE)
      observeEvent(cache(), {
        req(cache())
        if (!isTRUE(requires_walkthrough())) view_mode("landing")
      }, once = TRUE)

      # Confirmed live, a real bug: clicking a landing-page "Edit" link (jump_to_step(), below) leaves
      # view_mode() on "steps" -- a plain reactiveVal, so it stays there even after navigating away to a
      # different top-level page and back, landing the user back on a semi-broken step view instead of the
      # summary they'd expect (edit_mode() below used to read FALSE there too, on top of it, hiding the one
      # link -- "Back to overview" -- that would have gotten them out). Explicit user request: returning to
      # Load Data from anywhere else should always show the summary again unless there's something genuinely
      # unsaved to protect (there never is here -- every field on every step already autosaves on change, the
      # same "no separate Save/Discard state exists in this app's data model" fact edit_mode's own footer
      # comment below already relies on). Gated on `active()` actually CHANGING (input$tabs transitioning back
      # to "upload_data"), not merely on cache() -- so genuinely staying on this page while editing a step is
      # completely undisturbed; only leaving and coming back resets it. ignoreInit = TRUE: this page is the
      # app's own initial tab, so active() already reads TRUE at the very moment this observer is first
      # created, before any real navigation has happened -- nothing to reset yet, and cache() is NULL then too.
      observeEvent(active(), {
        req(isTRUE(active()))
        if (!is.null(cache()) && isTRUE(cache()$quality_confirmed)) view_mode("landing")
      }, ignoreInit = TRUE)

      current_step <- reactiveVal(step_defs[[1]]$key)

      # Which step keys the user has actually navigated past via Continue/Skip (footer_continue,
      # below) -- purely a display concern for compute_step_states()'s own `status` field: a step
      # whose data already happens to satisfy complete_fn() (a resumed field, a value carried over
      # from editing) shouldn't show as done on the rail before the user has actually walked through
      # it. Never read by anything that gates progression -- see step_status.R's own comment on the
      # `acknowledged` param for why `complete` itself is untouched by this.
      acknowledged_steps <- reactiveVal(character(0))

      # No req(cache()) here -- compute_step_states()/each step_*_complete() function is already null-safe on
      # `cd`, and step 1's own rail entry (current, unlocked) has to render correctly before any file has
      # loaded at all, same as its panel content does.
      step_states <- reactive({
        # Editing a finished dataset: the user has already been through every step, so a step whose data is
        # done shows as done (filled, with the connecting line) without having to press Continue on it again.
        acknowledged <- if (isTRUE(edit_mode())) vapply(step_defs, function(d) d$key, character(1)) else acknowledged_steps()
        compute_step_states(cache(), current_step(), requires_walkthrough = isTRUE(requires_walkthrough()), step_defs = step_defs, acknowledged = acknowledged)
      })

      # Moves to `target_key` -- current_step() updates immediately, in this same reactive flush, so
      # output$footer (which reads it directly, not isolated) always reflects the step actually about to show.
      # The PANE itself still needs cd_update_tab_panes() (a custom message, tabswitch.ts) to actually become
      # visible client-side: from the rail (the panel already exists, so a direct push) or from the landing
      # page's own Edit links (the FIRST such click also has to create the panel in this very reactive flush --
      # session$onFlushed() defers the push until after that new markup has actually reached the client, the
      # same "wait for the target to exist" requirement every other push to a just-mounted thing in this app
      # needs -- tabswitch.ts's own handler no-ops silently on a container that isn't in the DOM yet otherwise).
      jump_to_step <- function(target_key) {
        first_transition <- identical(isolate(view_mode()), "landing")
        current_step(target_key)
        if (first_transition) {
          view_mode("steps")
          session$onFlushed(function() {
            cd_update_tab_panes(session, "step_tabs", selected = target_key)
          }, once = TRUE)
        } else {
          cd_update_tab_panes(session, "step_tabs", selected = target_key)
        }
      }

      attempt_move <- function(target_key) {
        states <- isolate(step_states())
        target <- purrr::keep(states, ~ identical(.x$key, target_key))
        if (length(target) == 0) return(invisible(NULL))
        if (isTRUE(target[[1]]$locked)) {
          showNotification(i18n$t("err_wizard_step_locked"), type = "warning")
          return(invisible(NULL))
        }
        jump_to_step(target_key)
      }

      observeEvent(input$nav_click, {
        req(input$nav_click)
        attempt_move(input$nav_click)
      })


      output$rail <- renderUI({
        div(class = "cd-wizard-rail-card", cd_wizard_steps(ns("nav_click"), steps = step_states(), i18n = i18n))
      })

      output$body <- renderUI({
        if (identical(view_mode(), "landing")) {
          wizard_landing_ui(ns("landing"))
        } else {
          tab_panels <- set_names(purrr::map(panels, "ui"), purrr::map_chr(panels, "key"))
          this_step <- isolate(current_step())
          tabset_id <- ns("step_tabs")
          tagList(
            uiOutput(ns("rail")),
            div(
              class = "cd-wizard__panel",
              cd_tab_panes(tabset_id, tab_panels, active = this_step)
            ),
            uiOutput(ns("footer"))
          )
        }
      })
      outputOptions(output, "body", suspendWhenHidden = FALSE)

      # !requires_walkthrough(): a genuinely resumed .rds, edit mode from the start. cache()$quality_confirmed:
      # a FRESH Excel/Stata walkthrough that has ALREADY finished (Finish sets this, wizard_panels.R's own
      # footer_continue observer below) -- confirmed live this second case was missing entirely: revisiting any
      # step via a landing-page "Edit" link after Finish read edit_mode() as FALSE (requires_walkthrough() never
      # flips back once TRUE), so the footer below showed the ordinary forward-only "Continue to X" bar instead
      # of edit mode's "Back to overview" escape hatch -- explicit user request, "there should be a way to exit
      # edit mode." Both conditions describe the exact same real thing (this cache has already been through a
      # genuine Finish, editing it now is inherently "touching already-saved data"), just reached two different
      # ways.
      edit_mode <- reactive(!isTRUE(requires_walkthrough()) || (!is.null(cache()) && isTRUE(cache()$quality_confirmed)))

      # Back to the landing summary (edit mode's own footer only) -- unlike jump_to_step(), this never needs
      # onFlushed(): wizard_landing_server()'s own outputs are already registered (it's instantiated
      # unconditionally, below) and just re-bind to their uiOutput() placeholders the moment those exist again,
      # the normal way any renderUI()/uiOutput() pair behaves -- the onFlushed race in jump_to_step() is
      # specific to cd_update_tab_panes() targeting a container DOM element by id (tabswitch.ts no-ops
      # silently if it isn't there yet), which a plain output was never subject to.
      return_to_landing <- function() view_mode("landing")

      # The shared Back/Continue bar under every panel -- one implementation instead of each relocated step file
      # (reference_estimates.R, survey_upload.R, shapefile_step.R, mapping_steps.R, national_rates.R) rolling
      # its own, since the enabled/disabled state and the "Continue to <next step>" label both depend on
      # step_states(), which only this module already computes. Edit mode's own footer is deliberately much
      # simpler: every panel already auto-saves on change (file drop, field edit) exactly like it always has,
      # there's no separate "unsaved changes" state anywhere in this app's data model to add a Save/Discard
      # pair for -- so this is just a way back to the landing summary or on into the app, not a form submit.
      output$footer <- renderUI({
        states <- step_states()
        idx <- which(vapply(step_defs, function(d) identical(d$key, current_step()), logical(1)))
        if (length(idx) == 0) return(NULL)

        if (isTRUE(edit_mode())) {
          return(div(
            class = "cd-wizard-footer",
            cd_button(ns("footer_back"), "btn_wizard_back_overview", i18n, variant = "bare", class = "cd-wizard-footer__back"),
            cd_button(ns("footer_continue"), "btn_wizard_continue", i18n, variant = "bare", class = "cd-wizard-footer__cta")
          ))
        }

        this_def <- step_defs[[idx]]
        this_state <- states[[idx]]
        prev_def <- if (idx > 1) step_defs[[idx - 1]] else NULL
        next_def <- if (idx < length(step_defs)) step_defs[[idx + 1]] else NULL
        # this_state$complete, NOT status == "complete" -- status is display-only and always reads "current"
        # for whichever step you're actively on, even once it's genuinely done (see compute_step_states()'s own
        # comment). Using status here meant the Continue button was permanently disabled for the very step you
        # just finished, until you navigated away and back.
        complete <- isTRUE(this_state$complete)
        # this_state$touched, NOT complete, for the CTA label below -- complete only means "nothing blocks
        # progression" (e.g. Shapefile is always `complete` the moment ANY usable shapefile exists, including
        # the untouched, package-bundled default), while touched means the user actually did something on this
        # step (step_status.R's own touched_fn, falling back to complete for every step that doesn't need the
        # distinction). Explicit user request: an optional step the user hasn't touched should read "Skip to
        # X", not "Continue to X", even though it's already `complete` in the blocking sense -- applies to
        # every optional step uniformly, not just Shapefile.
        touched <- isTRUE(this_state$touched)
        # this_state$required, NOT this_def$required directly -- reading the resolved state is what lets a
        # step's required-ness be computed dynamically instead of a fixed literal, for any step that ever
        # needs that (none currently do; survey_mapping/map_mapping used to, based on whether a real name
        # mismatch was found, before that was reverted to always-required -- kept indirect here regardless,
        # since compute_step_states() is the one place that should ever need to know how a step resolves it).
        required <- isTRUE(this_state$required)
        can_advance <- complete || !required

        # "Skip to X" only describes an OPTIONAL, not-yet-touched current step being bypassed (an enabled
        # button the user can actually click through). A REQUIRED, incomplete step's button is disabled via
        # `can_advance` below regardless of label -- it still reads "Continue to X", just grayed out, since
        # there's nothing to "skip" when the gate is what's blocking them.
        # Text in every language (cd_label_glue()): CdButton.tsx picks the current one and re-picks on a language
        # switch, so this no longer needs the str_glue_data()-over-an-i18n-tag the old actionButton() label was.
        cta_label <- if (is.null(next_def)) {
          "btn_wizard_finish"
        } else if (!touched && !required) {
          cd_label_glue(i18n, "btn_wizard_skip_to", step = next_def$title_key)
        } else {
          cd_label_glue(i18n, "btn_wizard_continue_to", step = next_def$title_key)
        }

        div(
          class = "cd-wizard-footer",
          if (!is.null(prev_def)) cd_button(ns("footer_back"), "btn_wizard_back", i18n, variant = "bare", class = "cd-wizard-footer__back"),
          div(
            class = "cd-wizard-footer__right",
            if (!can_advance) span(class = "cd-wizard-footer__hint", i18n$t("hint_wizard_required_remaining")),
            cd_button(ns("footer_continue"), cta_label, i18n, variant = "bare", class = "cd-wizard-footer__cta", disabled = !can_advance)
          )
        )
      })

      observeEvent(input$footer_back, {
        if (isTRUE(edit_mode())) {
          return_to_landing()
          return(invisible(NULL))
        }
        idx <- which(vapply(step_defs, function(d) identical(d$key, isolate(current_step())), logical(1)))
        if (length(idx) > 0 && idx > 1) jump_to_step(step_defs[[idx - 1]]$key)
      })

      observeEvent(input$footer_continue, {
        idx <- which(vapply(step_defs, function(d) identical(d$key, isolate(current_step())), logical(1)))

        if (isTRUE(edit_mode()) || length(idx) == 0) {
          # Editing an already-resumed .rds: its own rds_path was already set at resume time
          # (init_CacheConnection(rds_path = ...) sets it directly, unlike a fresh Excel/Stata
          # upload -- see upload_box.R's own comment), so every field edit here already autosaves
          # the normal way. Nothing new to persist; just go back into the app -- "reporting_rate",
          # matching wizard_landing.R's own "Continue to analysis" CTA (the same wording, the same
          # destination, explicit user request: the first Data Quality Assessment page, not analysis).
          cd_navigate_to(session, "reporting_rate")
          return(invisible(NULL))
        }

        # Navigating away from this step via Continue/Skip -- see acknowledged_steps' own comment
        # above for why this only fires here, not from jump_to_step() in general (a rail click or a
        # landing-page Edit link isn't "pressing Next/Skip").
        acknowledged_steps(union(isolate(acknowledged_steps()), step_defs[[idx]]$key))

        if (idx == length(step_defs)) {
          # Finish, on a fresh walkthrough -- the one point the wizard's own separate, unmerged
          # sheets (cache()$wizard_parts, held since upload_box.R's load_file()) finally get merged
          # into real countdown_data, and the ONLY point this cache gets written to disk at all (see
          # upload_box.R's own comment on create_cache = FALSE/source_path for why nothing did until
          # now). step_quality_complete() is re-checked here too, as a defensive backstop -- the
          # footer's own can_advance below already prevents reaching this branch with a blocking
          # check unresolved, but this is the last line of defense before anything gets persisted,
          # matching merge_and_standardize()'s own Tier A abort as a backstop for the same reason.
          cd <- isolate(cache())
          path <- isolate(source_path())
          if (!is.null(cd) && !is.null(cd$wizard_parts) && step_quality_complete(cd)) {
            # merge_and_standardize() can still abort here -- one specific check ("every indicator
            # the selected group needs is present") only ever runs for real at this point, a
            # deliberate, documented gap (check_country_recognized()'s own comment, cd2030.core) --
            # so this is a genuine possible failure, not just defensive paranoia, and gets a real
            # error notification instead of crashing the reactive context.
            merge_ok <- tryCatch(
              {
                merged <- merge_and_standardize(cd$wizard_parts, indicator_group = cd_wizard_indicator_group(), validate = TRUE)

                # A shared, internally-consistent synthetic key per admin-1 region (cd2030.core's
                # own generate_admin1_keys() -- no real ISO-3166-2 code exists for sub-national
                # regions in general), joined onto ALL THREE of the merged data and either mapping
                # table that exists -- one canonical source, applied by join, so consistency across
                # every table that carries an admin-1 name is structural. Computed and joined onto
                # `merged` BEFORE set_countdown_data() below, not after -- confirmed live this was
                # previously only joined onto survey_mapping/map_mapping, never onto merged itself
                # (set_countdown_data() ran first, and nothing went back to re-set it with the key
                # added), leaving countdown_data as the one table of the three missing it. Confirmed
                # separately (a small live test) that a plain dplyr::left_join() here safely
                # preserves merged's own cd_data class and its country/iso3/indicator_group/profile
                # attributes (new_countdown()'s own new_tibble() call) -- dplyr's default
                # reconstruction keeps a tibble subclass's existing attributes when the package
                # defines no dplyr_reconstruct method of its own, which cd2030.core doesn't here.
                admin1_keys <- generate_admin1_keys(merged$adminlevel_1)
                merged <- dplyr::left_join(merged, admin1_keys, by = "adminlevel_1")
                cd$set_countdown_data(merged)

                if (!is.null(cd$survey_mapping)) {
                  cd$set_survey_mapping(dplyr::left_join(cd$survey_mapping, admin1_keys, by = c(admin_level_1 = "adminlevel_1")))
                }
                if (!is.null(cd$map_mapping)) {
                  cd$set_map_mapping(dplyr::left_join(cd$map_mapping, admin1_keys, by = c(admin_level_1 = "adminlevel_1")))
                }

                # The durable, persisted record that this cache finished the wizard with its
                # quality checks passed -- survives the .rds round-trip, and is all Phase 9's
                # sidebar-locking condition needs to read.
                cd$set_quality_confirmed(TRUE)

                if (!is.null(path)) {
                  cache_path <- file.path(dirname(path), cd_saved_copy_name(tools::file_path_sans_ext(basename(path))))
                  cd$set_cache_path(cache_path)
                }

                # A frozen snapshot of what the pre-merge checks found, taken here -- the LAST point
                # cd$wizard_parts is still set, so run_all_quality_checks(cd) still takes its
                # pre-merge branch one final time -- and saved permanently (cd2030.core's own
                # set_wizard_quality_results(); see its own comment for the bug this fixes: without
                # it, revisiting Data Quality after clear_wizard_parts() below silently switches to a
                # different, post-merge set of checks with different numbers than what was actually
                # shown during the walkthrough).
                cd$set_wizard_quality_results(run_all_quality_checks(cd))

                # wizard_parts only gets cleared once BOTH the real countdown_data exists AND the
                # .rds has actually been written -- never used as the cache's own storage past this
                # point. Clearing it still updates the .rds a second time (CacheConnection's own
                # update_field() auto-saves again once rds_path is already set, same mechanism every
                # other post-Finish field edit already relies on) -- the file on disk ends up without
                # the now-redundant wizard_parts blob either way, this just guarantees the sequence
                # is genuinely rds-first, not merely equivalent to it.
                cd$clear_wizard_parts()
                TRUE
              },
              error = function(e) {
                showNotification(clean_error_message(e), type = "error", duration = NULL)
                FALSE
              }
            )
            if (!merge_ok) return(invisible(NULL)) # stay put -- don't claim Finish succeeded
          }
          just_finished(TRUE)
          view_mode("landing")
          return(invisible(NULL))
        }

        states <- isolate(step_states())
        this_def <- step_defs[[idx]]
        can_advance <- isTRUE(states[[idx]]$complete) || !isTRUE(states[[idx]]$required)
        if (can_advance) jump_to_step(step_defs[[idx + 1]]$key)
      })

      wizard_landing_server(
        "landing", cache = cache, step_defs = step_defs, i18n = i18n, on_edit = jump_to_step,
        just_finished = just_finished
      )

      list(
        edit_mode = edit_mode,
        current_step = current_step
      )
    }
  )
}
