# Group-agnostic: the only per-app input is cd_wizard_config() (wizard-config.R).
#
# Plain functions of a CacheConnection object (`cd` -- always cache(), never the reactive wrapper itself),
# answering "is step N of the Load Data wizard complete". Deliberately NOT reactive() closures and NOT new
# CacheConnection active bindings: cd2030.core isn't in this working tree (it's an external package dependency,
# a separate repo/PR), and nothing outside this page needs these flags yet -- that only becomes true once
# cross-page sidebar locking (a later phase) reads them. Kept as pure functions of `cd` so the one flag that
# phase will actually need externally (step_national_rates_complete) can be lifted into a
# check_national_rates_complete-style active binding later (matching the existing check_inequality_params/
# check_coverage_params precedent in CacheConnection-class.R's own "Parameter Flags" section) as a pure move,
# not a rewrite.

# Step 1 -- Upload Data: a dataset has actually loaded (mirrors upload_box.R's own success-state check).
# cd$wizard_parts, not just cd$countdown_data -- Phase 3 of the wizard redesign means a fresh
# Excel/Stata upload only ever gets wizard_parts (separate, unmerged sheets) until Finish; countdown_data
# itself stays NULL the whole walkthrough through. Checking countdown_data alone left this step
# permanently "incomplete" for every fresh upload, confirmed live (the rail never advanced past Upload
# Data at all).
step_upload_complete <- function(cd) {
  if (is.null(cd)) return(FALSE)
  (!is.null(cd$wizard_parts)) || (!is.null(cd$countdown_data) && nrow(cd$countdown_data) > 0)
}

# Step 2 -- Data Quality: the 6 structural checks (file/sheet existence, required columns,
# indicator-group completeness, country match, admin columns, single country) are still enforced
# unconditionally inside cd2030.core's own load pipeline -- reaching this step at all already means
# those passed, same as before. Beyond that, load_cache_data() is now called with validate = FALSE
# (upload_box.R), so the 3 data-quality checks that used to ALSO run at load time (district
# consistency, missing months, mismatched months) no longer block getting here -- they run for
# real now, on demand, via run_all_quality_checks() (cd2030.core), and THIS is where that result
# actually gates progression: complete only once every "blocking"-severity entry has passed.
step_quality_complete <- function(cd) {
  if (!step_upload_complete(cd)) return(FALSE)
  results <- run_all_quality_checks(cd)
  all(vapply(results, function(r) !identical(r$severity, "blocking") || isTRUE(r$ok), logical(1)))
}

# All 5 national_estimates fields, not just the 3 that default to NA outright (nmr/pnmr/sbr) -- twin_rate and
# preg_loss ship with a real package-bundled default (0.015/0.03, CacheConnection's own .data_template), so
# they used to always read as "already set" here even if the user had never looked at the field, which is
# exactly the case explicit user request covers: "make all value required to continue... if one is removed
# disable the button". Now that FieldNumber.tsx can actually tell the server a required field was cleared
# (its own `${id}_cleared` signal, national_rates.R's own clear handlers), a default-then-cleared twin_rate/
# preg_loss really can become NA again, and this needs to catch that the same as any other field.
#
# Functions, not constants: which survey estimates a group needs differs per app (rmncah: anc1/anc4/instlivebirths/
# bcg/penta1/penta3/measles1/low_bweight/csection; vaccine: anc1/instlivebirths/bcg/penta1/penta3/opv1/opv3/
# measles1), and comes from the app's own field list (wizard-config.R), read when called.
national_rates_required_fields <- function() vapply(wizard_fields("rate"), function(f) f$key, character(1))
survey_estimates_required_fields <- function() vapply(wizard_fields("survey"), function(f) f$key, character(1))

# Step 3 -- National Rates: every field the form treats as required (see national_rates.R's own field list) has
# a real value, plus a recent survey year is set (auto-filled once a national survey uploads, or entered by
# hand).
step_national_rates_complete <- function(cd) {
  if (is.null(cd)) return(FALSE)
  all(!is.na(unlist(cd$national_estimates[national_rates_required_fields()]))) &&
    all(!is.na(cd$survey_estimates[survey_estimates_required_fields()])) &&
    !is.null(cd$survey_year)
}

# The five survey-folder fields all fall back to cd2030.core's own bundled default dataset once a country is
# set, exactly like un_estimates/wuenic_estimates/un_mortality_estimates -- their own active bindings are NEVER
# NULL, so is.null() (what file_upload.R's pre-wizard code used) is always FALSE and can't tell "nothing
# uploaded" from "something uploaded". is_default() checks the underlying stored value directly, before that
# fallback applies -- the same fix already applied to the three estimates fields.
survey_fields <- c("national_survey", "regional_survey", "wiq_survey", "area_survey", "education_survey")

# Step 4 -- Survey Files (optional): complete once every one of the five files has been uploaded (a user could
# upload some but not all -- e.g. from a partial folder -- so this requires all five, matching the "all 5
# present" snapshot file_upload.R's own status message already computes).
step_survey_files_complete <- function(cd) {
  if (is.null(cd)) return(FALSE)
  all(vapply(survey_fields, function(f) !isTRUE(cd$is_default(f)), logical(1)))
}

# Step 5 -- Shapefile (optional): step_status.R's own `relevant`/`required` distinction (see
# compute_step_states()) means this can be "complete" (nothing blocks progression) while still having a
# real upload sitting there -- the app always has a usable shapefile (the package-bundled default, or a
# user-uploaded override once Phase 3 of the wizard redesign added real upload support, see
# shapefile_step.R) whether or not the user has picked their own, so this never blocks anything by
# itself. The one thing that DOES make it incomplete: an upload sitting there with no admin-1
# name-field chosen yet (cd$shapefile_name_field unset) -- half-finished, not "nothing to do here."
step_shapefile_complete <- function(cd) {
  if (is.null(cd) || isTRUE(cd$is_default("shapefile"))) return(TRUE)
  !is.null(cd$shapefile_name_field)
}

# Whether the user has actually DONE anything on this step yet -- distinct from step_shapefile_complete()
# above, which is TRUE the moment a usable (even entirely default) shapefile exists, precisely so the
# built-in default never blocks anything. That conflates "nothing to do" with "genuinely finished" for the
# wizard footer's own Continue/Skip button label (wizard_panels.R): explicit user request, "show skip if
# the user does not load[,] and this should happen to all optional tabs" -- an optional step the user
# hasn't touched should read "Skip to X", not "Continue to X", even though it's already `complete` in the
# blocking sense. See compute_step_states()'s own `touched` field below for how this plugs in generically.
step_shapefile_touched <- function(cd) !is.null(cd) && !isTRUE(cd$is_default("shapefile"))

# Steps 6/7 -- Map Survey Files / Map Shapefile Names: always required (explicit user request -- "map
# survey and map shapefile should not skip[,] user must review before moving to the next step... the only
# optional part are file uploads"), unlike the actual survey/shapefile FILE uploads (steps 3/5 above, which
# stay optional -- the app always has something usable to map against, the bundled default if nothing else,
# so "review it" is never blocked on having uploaded your own file first). survey_mapping/map_mapping have
# no package-bundled fallback (plain getters), so is.null() is the correct "has anything been saved" check
# here, unlike the five survey_fields above -- this is also exactly what makes `required` here mean "must
# have actually opened Match Region Names and pressed Save at least once", not just "must have uploaded a
# file": a review with nothing to change still needs a Save to become `complete`.
step_survey_mapping_complete <- function(cd) !is.null(cd) && !is.null(cd$survey_mapping)
step_map_mapping_complete <- function(cd) !is.null(cd) && !is.null(cd$map_mapping)

# The 7 steps in wizard order. Survey Files sits BEFORE National Rates (not after, as Phase 1 originally
# had it): most of National Rates' own required fields are already auto-derived from an uploaded
# national survey file the moment it's set (CacheConnection$set_national_survey() ->
# extract_national_estimates_from_survey(), cd2030.core) -- that auto-fill only has something to fill in
# by the time the user reaches National Rates if Survey Files came first. Survey Files itself stays
# optional either way; a user with no survey data still fills National Rates by hand exactly as before.
#
# `required`: steps 1-3 are hard-gated sequentially; survey_mapping/map_mapping (6/7) are ALSO always
# required (explicit user request, see those steps' own complete_fn comment above) -- only the actual FILE
# uploads (survey_files/shapefile, 3/5) stay optional. `relevant_fn` (steps 6/7 only): whether there's
# actually anything to show yet -- unrelated to locking, purely a content condition (see
# compute_step_states()'s own comment).
wizard_step_defs <- list(
  list(key = "upload", title_key = "step_upload_title", required = TRUE, complete_fn = step_upload_complete),
  list(key = "quality", title_key = "step_quality_title", required = TRUE, complete_fn = step_quality_complete),
  list(key = "survey_files", title_key = "step_survey_files_title", required = FALSE, complete_fn = step_survey_files_complete),
  list(key = "national_rates", title_key = "step_national_rates_title", required = TRUE, complete_fn = step_national_rates_complete),
  list(key = "shapefile", title_key = "step_shapefile_title", required = FALSE, complete_fn = step_shapefile_complete, touched_fn = step_shapefile_touched),
  list(key = "survey_mapping", title_key = "step_survey_mapping_title", required = TRUE, complete_fn = step_survey_mapping_complete, relevant_fn = step_survey_files_complete),
  list(key = "map_mapping", title_key = "step_map_mapping_title", required = TRUE, complete_fn = step_map_mapping_complete, relevant_fn = step_shapefile_complete)
)

# Turns wizard_step_defs into the per-step {key, title_key, status, locked, relevant, required} list the
# rail (and the landing page's status rows) both render from. `requires_walkthrough` FALSE (a resumed
# .rds -- see upload_box.R's own capture of this) short-circuits every lock: "rds will already have done
# all these" is an explicit rule here, not an inference from field values, so a resumed session with a
# field left blank for a legitimate reason still shows fully unlocked rather than snapping back into a
# walkthrough it never asked for.
#
# `acknowledged`: character vector of step keys the user has actually navigated past (via Continue/Skip
# -- see wizard_panels.R's own `acknowledged_steps` reactiveVal). Purely a DISPLAY concern: a step whose
# data already happens to satisfy complete_fn() (a resumed field, a value carried over from a previous
# edit) shouldn't show as done on the rail before the user has actually walked through it -- "do not show
# a completed check on the next tab if the next or skip button not pressed." The real `complete` field
# below is never touched by this -- blocking/can_advance logic always sees the true, live value, whether
# or not the step's been visited yet.
compute_step_states <- function(cd, current, requires_walkthrough = TRUE, step_defs = wizard_step_defs, acknowledged = character(0)) {
  blocked <- FALSE
  lapply(seq_along(step_defs), function(i) {
    def <- step_defs[[i]]
    complete <- isTRUE(def$complete_fn(cd))
    # touched: has the user actually DONE anything here, as opposed to merely "nothing blocks progression"
    # (complete). Only shapefile needs its own touched_fn today (step_shapefile_touched, above) -- every
    # other step's complete_fn is already "did the user provide this" with no default-counts-as-done
    # wrinkle, so falling back to `complete` is correct for them without needing a touched_fn of their own.
    touched <- if (!is.null(def$touched_fn)) isTRUE(def$touched_fn(cd)) else complete
    required <- if (!is.null(def$required_fn)) isTRUE(def$required_fn(cd)) else isTRUE(def$required)
    # On a fresh walkthrough a step opens only once the user has moved on from the one before it (Continue or
    # Skip) -- not merely because that step's data happens to be complete -- so the rail can't be used to jump
    # ahead of the walkthrough. Editing a finished dataset is not a walkthrough: nothing is locked.
    locked <- if (!requires_walkthrough) FALSE else blocked || (i > 1 && !(step_defs[[i - 1]]$key %in% acknowledged))
    if (requires_walkthrough && required && !complete) blocked <<- TRUE
    relevant <- if (!is.null(def$relevant_fn)) isTRUE(def$relevant_fn(cd)) else TRUE
    # status: DISPLAY only (what the rail's icon shows) -- "current" wins over "complete" there so the step
    # you're actively looking at doesn't switch to a checkmark out from under you, and a complete-but-not-yet-
    # acknowledged step shows as merely "available" rather than already done (see this function's own
    # `acknowledged` param comment above). complete: the actual, always-accurate "is this step's data done"
    # boolean, independent of whether it's also the current step or has been visited -- callers that need to
    # know completion (the footer's can_advance, in particular) must use THIS field, never infer it from
    # status. Confirmed live bug otherwise: viewing a step you'd just finished (still "current") made its own
    # Continue button permanently read as disabled, since identical(status, "complete") is never true for the
    # step you're actually on.
    #
    # `touched`, NOT `complete`, gates the checkmark here -- explicit user report: Shapefile showed a
    # checkmark ("completed shading") having never been uploaded, purely because it was `complete` (a usable
    # default shapefile always exists) and acknowledged (the user had passed it going forward). `complete`
    # alone can't tell "the user genuinely did this" apart from "there was nothing to do" for any step that
    # has its own touched_fn (only Shapefile today) -- exactly the same distinction the footer's Skip/Continue
    # label already uses `touched` for, just never applied to the rail's own icon until now. No behavior
    # change for every other step, where touched falls back to complete.
    status <- if (locked) {
      "locked"
    } else if (identical(def$key, current)) {
      "current"
    } else if (touched && complete && def$key %in% acknowledged) {
      "complete"
    } else {
      "available"
    }
    list(key = def$key, title_key = def$title_key, status = status, complete = complete, touched = touched, locked = locked, relevant = relevant, required = required)
  })
}
