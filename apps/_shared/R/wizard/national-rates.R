# One field: cd_field_number() (_shared/R/core (and components/) -> FieldNumber.tsx), not shiny::numericInput() -- a React
# input, wired into Shiny the same way cd_chip_number() already is, that validates its own value live against
# min/max (an out-of-range entry gets a red border and an inline error in place of the hint, rather than being
# silently accepted or silently clamped the way a plain numericInput() would be) and only pushes a *valid*
# value to Shiny, debounced. labelKey/hintKey are translation keys, not already-translated text: cd_field_number()
# builds its own per-language LocalText object from the key (cd_text()), the same as every other React chip's
# label, so the field's language follows window.cdLang live instead of being fixed to whatever language the
# page happened to render in server-side.
# required = TRUE by default: every field on this card is needed for the denominator calculation, so an empty
# one gets the amber "Not set. Needed for denominators." warning rather than looking merely optional.
# unit: derived from hintKey, not a separate argument -- every field here already says which it is
# (hint_upload_percent vs hint_upload_proportion) via the same key that drives the hint line below, so this is
# the one place that distinction needs to be spelled out, not a new parameter every call site has to repeat.
# Percent gets the design's own "Number with unit" treatment (a trailing "%" box inside the field, see
# FieldNumber.tsx); proportion fields are left as they were -- the design has no unit-box example for one.
nr_field <- function(ns, i18n, inputId, labelKey, min, max, step, hintKey, required = TRUE) {
  unit <- if (identical(hintKey, "hint_upload_percent")) "%" else NULL
  cd_field_number(
    ns(inputId), labelKey, i18n = i18n, min = min, max = max, step = step, hint = hintKey,
    required = required, requiredLabel = if (required) "hint_upload_required" else NULL, unit = unit
  )
}

nr_group <- function(i18n, titleKey, subtitleKey, ..., cols = 4) {
  div(
    class = "cd-field-group",
    div(
      class = "cd-field-group__head",
      tags$h3(class = "cd-field-group__title", i18n$t(titleKey)),
      tags$span(class = "cd-field-group__subtitle", i18n$t(subtitleKey))
    ),
    div(
      class = "cd-field-grid",
      style = if (cols != 4) sprintf("grid-template-columns: repeat(%d, minmax(0, 1fr));", cols) else NULL,
      ...
    )
  )
}

national_rates_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_card(
    title = i18n$t("title_upload_national_rates_card"),
    subtitle = i18n$t("sub_upload_national_rates_card"),
    status = "success",
    solidHeader = TRUE,
    width = 12,
    uiOutput(ns("prefill_banner")),
    # The field cards are the app's own (cd_wizard_config()$national_rates_groups, wizard-config.R): which survey
    # estimates a group needs (anc4/csection/low_bweight for rmncah, opv1/opv3 for vaccine, ...) is the one thing
    # that differs here.
    tagList(lapply(cd_wizard_config()$national_rates_groups, function(g) {
      do.call(nr_group, c(
        list(i18n = i18n, titleKey = g$title_key, subtitleKey = g$subtitle_key),
        lapply(g$fields, function(f) nr_field(ns, i18n, f$id, f$label_key, f$min, f$max, f$step, f$hint))
      ))
    })),
    nr_group(i18n, "title_upload_group_survey_ref", "sub_upload_group_survey_ref",
      nr_field(ns, i18n, "survey_year", "title_upload_recent_survey_year", 2015, 2030, 1, NULL),
      uiOutput(ns("survey_start_ui"))
    )
  )
}

national_rates_server <- function(id, cache, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      # Phase 5 (Load Data wizard plan): a plain note that these fields didn't come from nowhere -- Survey
      # Files sits BEFORE National Rates in the wizard order specifically so extract_national_estimates_from_survey()
      # (cd2030.core, called from CacheConnection$set_national_survey()) has already run by the time the user
      # reaches this step, auto-filling every field it covers. Without this banner, a returning user could
      # easily read pre-filled, correct-looking values as something they're expected to type in from scratch,
      # or not realize they should double-check them against their own knowledge of the country's real rates.
      # is_default("national_survey"), not is.null() -- national_survey's own active binding always has a
      # package-bundled fallback once a country is known (same override-with-fallback pattern every other
      # survey field uses), so is.null() would never be TRUE and this would never show.
      output$prefill_banner <- renderUI({
        req(cache())
        if (!isTRUE(cache()$is_default("national_survey"))) {
          cd_status_banner("info", "title_msg_national_rates_prefilled", "msg_national_rates_prefilled", i18n = i18n)
        }
      })

      # Every React field (FieldNumber.tsx, via InputAdapter) echoes any value it's given straight back to
      # Shiny as an input-changed event -- not only on mount, but every time cd_update_input() pushes a new value
      # too (shiny.react's own useValue() hook: its effect calls Shiny.setInputValue(inputId, value) whenever
      # `value` changes, regardless of whether the change came from the user or from us). With up to 9 fields
      # pushed together below, those echoes land back on the server at different times -- so a combined
      # observeEvent() further down can fire on the *first* echo to arrive while the other fields' input$
      # values are still whatever they'd last been (often still NA, on the very first sync of a freshly loaded
      # dataset), and write that stale mix over the cache, corrupting fields that had just loaded correctly.
      # That write re-invalidates the observe() block below, which re-pushes (and re-echoes) the now-wrong
      # values, and the fields visibly cycle between their real value and empty with no user involved.
      # Comparing the *whole* group against what's already cached (an earlier fix) only catches the case where
      # every field in the group is unchanged; it doesn't catch one field in the group still being stale while
      # its neighbors have caught up. last_pushed records exactly what we last told each field to show;
      # resolve_field() then treats an input$ value that still matches it as an echo, not a real edit, and the
      # caller falls back to that field's own existing cache value instead of overwriting it with a stale read.
      last_pushed <- new.env(parent = emptyenv())

      push_field <- function(field, value) {
        assign(field, value, envir = last_pushed)
        cd_update_input(field, session, value = value)
      }

      # Field lists come from the app's own config (wizard-config.R): survey_specs are cache()$survey_estimates
      # entries (percent), rate_specs are cache()$national_estimates entries (proportion).
      survey_specs <- wizard_fields("survey")
      rate_specs <- wizard_fields("rate")
      field_ids <- c(vapply(c(survey_specs, rate_specs), function(f) f$id, character(1)), "survey_year")
      field_mounted <- stats::setNames(lapply(field_ids, function(f) cd_remounted(input, f)), field_ids)
      all_fields_mounted <- reactive({
        all(vapply(field_mounted, function(m) !is.null(m()), logical(1)))
      })

      # NULL means "treat as an echo, not a real edit" -- the caller keeps the field's existing cache value.
      # all.equal() rather than ==/identical() for the numeric comparison itself: also tolerant of the kind of
      # harmless floating-point drift an R <-> JSON <-> JS round-trip on a non-integer value can introduce.
      resolve_field <- function(field, input_value) {
        # Not echoed at all yet -- input$<field> hasn't received anything (still literally NULL/zero-length in
        # R, before any client message has arrived for it), so this is definitely not something the user just
        # typed. as.numeric(NULL) is numeric(0), not NA -- easy to get wrong here, and this is exactly the
        # "hasn't caught up yet" case the whole function exists to handle, so it's checked explicitly first
        # rather than falling into the same is.na() logic used for a field that HAS echoed an empty value.
        if (is.null(input_value) || length(input_value) == 0) return(NULL)

        incoming <- suppressWarnings(as.numeric(input_value))
        incoming_na <- length(incoming) == 0 || is.na(incoming)

        pushed <- if (exists(field, envir = last_pushed, inherits = FALSE)) get(field, envir = last_pushed) else NA_real_
        pushed_na <- length(pushed) == 0 || is.na(pushed)

        same <- (incoming_na && pushed_na) || (!incoming_na && !pushed_na && isTRUE(all.equal(incoming, pushed)))
        if (same) NULL else if (incoming_na) NA_real_ else incoming
      }

      # rnd(): every value pushed below goes through this first -- confirmed live to be the actual root cause
      # of a genuine, reproducible infinite loop (13,800+ DOM mutations in ~12s, tab unresponsive, cascading
      # all the way out to output$rail and dozens of unrelated outputs across the whole app, all stuck
      # "recalculating" together). A decimal like 97.4 has no exact binary floating-point representation --
      # R's own internal double for it, jsonlite's serialization of that double into the update message, and
      # the value JS parses back out of it can each land on a very slightly different bit pattern, well within
      # normal floating-point behavior but JUST far enough apart that resolve_field()'s own all.equal() (its
      # default tolerance is about 1.5e-8) sees the round-tripped echo as a genuine edit, writes it back,
      # re-triggers this very push, and repeats -- confirmed live to specifically hit whichever fields a
      # replacement survey provided NEW values for (bcg/penta3/measles1 here), never the ones that fell back
      # unchanged to their existing cached value, because it's the fresh round trip each time that's the
      # opportunity for drift, not the field's own magnitude or precision-in-principle. Rounding to a precision
      # no one needs anyway -- a coverage PERCENTAGE to 1 decimal place, a PROPORTION (already constrained to
      # 0-0.05, and stepped by 0.001 in nr_field()'s own UI) to 3 -- means the number R sends is one jsonlite/JS
      # can both represent exactly, so there's no drift left for a round trip to introduce in the first place --
      # fixing the actual source, not just widening the tolerance that has to catch it afterward. Explicit user
      # request settled the exact digit counts (was 2/6, coarser than either field's own display needs).
      rnd <- function(x, digits) if (is.null(x) || length(x) == 0 || is.na(x)) x else round(x, digits)

      observe({
          req(cache(), all_fields_mounted())

          national_estimates <- cache()$national_estimates
          estimates <- cache()$survey_estimates
          survey_year <- cache()$survey_year

          for (f in rate_specs) push_field(f$id, rnd(national_estimates[[f$key]], 3))
          for (f in survey_specs) push_field(f$id, rnd(unname(estimates[f$key]), 1))

          push_field("survey_year", survey_year)
        }
      )

      # Debounced, not a plain observeEvent(c(input$a, input$b, ...), ...) watching all 9 raw inputs directly
      # (what used to be here). This file's own header comment already named the exact failure mode: with up
      # to 9 fields pushed together, their echoes land back on the server at DIFFERENT times (separate
      # websocket messages, separate reactive flushes) -- a combined observeEvent() fires on the very FIRST
      # echo to arrive, while sibling fields' input$ values are still whatever they were BEFORE this push, not
      # yet caught up. resolve_field()'s own last_pushed comparison cannot tell "hasn't caught up yet" apart
      # from "genuinely different" for those still-stale siblings -- it sees input$penta3_prop still reading
      # the OLD value against a last_pushed of the NEW one and concludes the user just edited it, writes the
      # OLD value back over the NEW one, which re-triggers the push block above, which re-pushes and
      # re-echoes -- a genuine, reproducible, sustained oscillation, not just a race in theory: confirmed live
      # via direct tracing of CacheConnection's own update_field(), watching bcg/penta3/measles1 alternate
      # forever between a replacement survey's real values and the previous survey's stale ones. debounce()
      # (shiny's own) fixes this at the actual source instead of trying to out-guess it field by field: it
      # only lets this reactive fire once ALL of these inputs have gone quiet for a moment, i.e. once every
      # echo in the batch has actually arrived and the client has genuinely settled -- by the time it runs,
      # there's no "hasn't caught up yet" field left to misread as an edit.
      proportion_inputs <- reactive({
        lapply(survey_specs, function(f) input[[f$id]])
      })
      proportion_inputs_d <- debounce(proportion_inputs, 500)

      observeEvent(proportion_inputs_d(), {
        req(cache())

        existing <- cache()$survey_estimates
        any_changed <- FALSE
        pick <- function(field, key) {
          resolved <- resolve_field(field, input[[field]])
          if (is.null(resolved)) return(unname(existing[key]))
          any_changed <<- TRUE
          rnd(resolved, 1)
        }
        estimates <- stats::setNames(
          vapply(survey_specs, function(f) pick(f$id, f$key), numeric(1)),
          vapply(survey_specs, function(f) f$key, character(1))
        )

        if (any_changed) {
          isolate(cache()$set_survey_estimates(estimates))
        }
      })

      # Same fix, same reason -- see proportion_inputs_d's own comment above.
      rate_inputs <- reactive({
        lapply(rate_specs, function(f) input[[f$id]])
      })
      rate_inputs_d <- debounce(rate_inputs, 500)

      observeEvent(rate_inputs_d(), {
        req(cache())

        existing <- cache()$national_estimates
        any_changed <- FALSE
        pick <- function(field, key) {
          resolved <- resolve_field(field, input[[field]])
          if (is.null(resolved)) return(existing[[key]])
          any_changed <<- TRUE
          rnd(resolved, 3)
        }
        estimates <- stats::setNames(
          lapply(rate_specs, function(f) pick(f$id, f$key)),
          vapply(rate_specs, function(f) f$key, character(1))
        )
        if (any_changed) {
          isolate(cache()$set_national_estimates(estimates))
        }
      })

      # Guarded the same way as every FieldNumber field above (see resolve_field()): cd_field_select() is built on
      # InputAdapter too, so it echoes its value back to Shiny on every mount -- and output$survey_start_ui
      # below remounts it whenever cache()$survey_years changes. Without this guard, that mount-echo would call
      # set_start_survey_year() with the *same* value every time, which (per CacheConnection's unconditional
      # trigger()) re-invalidates cache()$survey_years and remounts the field again -- the exact infinite loop
      # already root-caused for the numeric fields, just for this select.
      observeEvent(input$survey_start_year, {
        req(cache(), input$survey_start_year)
        new_start_year <- as.numeric(input$survey_start_year)
        if (!isTRUE(all.equal(new_start_year, cache()$start_survey_year))) {
          isolate(cache()$set_start_survey_year(new_start_year))
        }
      })

      observeEvent(input$survey_year, {
        req(cache())
        resolved <- resolve_field("survey_year", input$survey_year)
        req(resolved)
        isolate(cache()$set_survey_year(resolved))
      })

      # One observer per field, firing on FieldNumber.tsx's own `${id}_cleared` signal (its own comment there
      # explains why it's a separate event, not just an empty onChange) -- explicit user request: "make all
      # value required to continue... if one is removed disable the button". Deliberately not routed through
      # resolve_field()/pick()/the debounced group observers above: those exist to reconcile a *value* echo
      # against what was last pushed, which is the wrong tool here -- a clear isn't an echo of anything, it's
      # an unambiguous "this field is unset now" the server needs to just apply, immediately, to the one field
      # named. Written every field's own value against `existing` (the CURRENT cache, not last_pushed) so nothing
      # else in the same estimates vector/list gets touched. cache()$set_survey_estimates()/set_national_estimates()
      # already null-guard on their own -- req(cache()) is the only guard needed here.
      survey_clear_fields <- stats::setNames(
        vapply(survey_specs, function(f) f$key, character(1)),
        vapply(survey_specs, function(f) f$id, character(1))
      )
      for (nr_field_id in names(survey_clear_fields)) {
        local({
          field_id <- nr_field_id
          key <- survey_clear_fields[[field_id]]
          observeEvent(input[[paste0(field_id, "_cleared")]], {
            req(cache())
            existing <- cache()$survey_estimates
            existing[key] <- NA_real_
            isolate(cache()$set_survey_estimates(existing))
          })
        })
      }

      national_clear_fields <- stats::setNames(
        vapply(rate_specs, function(f) f$key, character(1)),
        vapply(rate_specs, function(f) f$id, character(1))
      )
      for (nr_field_id in names(national_clear_fields)) {
        local({
          field_id <- nr_field_id
          key <- national_clear_fields[[field_id]]
          observeEvent(input[[paste0(field_id, "_cleared")]], {
            req(cache())
            existing <- cache()$national_estimates
            existing[[key]] <- NA_real_
            isolate(cache()$set_national_estimates(existing))
          })
        })
      }

      observeEvent(input$survey_year_cleared, {
        req(cache())
        isolate(cache()$clear_survey_year())
      })

      observe({
        req(cache(), all_fields_mounted())
        survey_year <- cache()$survey_year
        push_field("survey_year", survey_year)
      })

      output$survey_start_ui <- renderUI({
        req(cache())
        years <- cache()$survey_years

        if (is.null(years) || length(years) == 0) {
          return(NULL)
        }

        # Clamp BEFORE rendering, not just guard the echo afterward: replacing the national survey with a
        # different file (a different set of years -- confirmed live, e.g. Benin's 2011/2014/2017/2021 swapped
        # for another file's own 2006...2024 range) can leave cache()$start_survey_year pointing at a year the
        # NEW `years` list no longer contains, or still NULL if nothing's ever been picked. Rendering that
        # straight into cd_field_select()'s own `value` used to hand the client something its <select> can't
        # actually select -- a real HTML <select> silently falls back to showing its own first <option>
        # instead, which is NOT what the server thinks is set, so the very first mount-echo below disagreed
        # with cache()$start_survey_year and triggered a genuine set -> re-render -> remount -> echo cycle,
        # not just the single corrective step the observeEvent's own guard was written to allow. Confirmed
        # live: an entire-page freeze (13,800+ DOM mutations in ~12s, tab unresponsive) reproduced once this
        # way, from replacing an already-displayed national survey with one covering a different year range.
        # Fixing cache()$start_survey_year here, before the client ever sees a mismatched value, means the
        # very first echo always agrees with the server -- there's no mismatch window left for a loop to run in.
        current_start <- cache()$start_survey_year
        if (is.null(current_start) || !(current_start %in% years)) {
          current_start <- min(years)
          isolate(cache()$set_start_survey_year(current_start))
        }

        # cd_field_select(), not selectInput()/selectizeInput(): the design's own "Select" token (Patterns.dc.html)
        # is a bare, appearance:none <select> with a background-image chevron, not a search-box widget.
        # shiny::selectInput() looked right in isolation but still silently initializes selectize client-side
        # unless selectize=FALSE is passed (Shiny's own default) -- confirmed via testServer(), its rendered
        # <select> carried a `{"plugins":["selectize-plugin-a11y"]}` config script exactly like the
        # selectizeInput() this replaced, which is what needed the dropdownParent:"body" hack to escape
        # .cd-card's own overflow:hidden clipping its open list. cd_field_select() (FieldSelect.tsx) sidesteps
        # selectize entirely -- a native <select>'s own dropdown is drawn by the browser outside normal document
        # flow, so it can't be clipped -- and gets the same .cd-field-stack label weight/spacing/i18n handling
        # as every FieldNumber neighbor in the grid for free, instead of needing a tagQuery() class hack.
        cd_field_select(
          ns("survey_start_year"), "title_upload_survey_start_year", i18n = i18n,
          value = as.character(current_start), options = cd_plain_options(years)
        )
      })
    }
  )
}
