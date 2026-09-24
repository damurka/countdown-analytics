mapping_modal_ui <- function(id) {
  ns <- NS(id)
  uiOutput(ns("modal"))
}

# label: the trigger button's own text (used to be mapping_modal_ui()'s separate `name` argument -- now needed
# here instead, since the button is part of what output$modal renders).
#
# show_col: which column of survey_data() holds the raw name being matched against -- either a plain string
# (survey mapping's own "adminlevel_1", fixed for the life of the app) or a zero-arg function/reactive
# (map_mapping's own case, Phase 3 of the wizard redesign: the bundled shapefile always uses "NAME_1", but a
# user-uploaded one's admin-1 column can be anything, only known once CacheConnection$shapefile_name_field is
# set -- a plain value captured once at module setup could never reflect that). Resolved fresh at each use site
# below via show_col_now(), never captured once, so a reactive show_col stays live across the whole module's
# life the same way cache()/survey_data()/survey_map() already do.
mapping_modal_server <- function(id, cache, survey_data, survey_map, label, title, show_col, type, i18n) {
  stopifnot(is.reactive(cache))
  stopifnot(is.reactive(survey_data))
  stopifnot(is.reactive(survey_map))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      show_col_now <- function() if (is.function(show_col)) show_col() else show_col

      # The canonical list every entry must be matched against -- unchanged from before. req()'s
      # first argument alone isn't enough any more (Phase 3 of the wizard redesign):
      # subnational_regions can now genuinely be NULL mid-wizard, before merge (its own pre-merge
      # fallback needs the admin sheet's first_admin_level/district columns specifically -- absent
      # or mid-read, it stays NULL rather than erroring) -- req() both, so this reactive simply
      # doesn't fire yet instead of crashing on a NULL %>% distinct() call.
      gregion_levels <- reactive({
        req(cache(), cache()$subnational_regions)

        cache()$subnational_regions %>%
          distinct(adminlevel_1) %>%
          arrange(adminlevel_1) %>%
          pull(adminlevel_1)
      })

      output$modal <- renderUI({
        req(gregion_levels(), survey_data())
        col <- show_col_now()

        choices <- survey_data() %>%
          distinct(!!rlang::sym(col)) %>%
          arrange(!!rlang::sym(col)) %>%
          pull(!!rlang::sym(col))

        # A named character vector (region -> its previously-saved match), the shape cd_mapping_modal()'s
        # `existing` prop expects -- NULL when nothing's been mapped yet, so MappingModal.tsx's auto-match runs
        # unconstrained on every region rather than treating an empty tibble as "everything already mapped to
        # nothing."
        existing_map <- survey_map()
        existing <- if (!is.null(existing_map) && nrow(existing_map) > 0 && col %in% colnames(existing_map)) {
          stats::setNames(as.character(existing_map[[col]]), existing_map$admin_level_1)
        } else {
          NULL
        }

        cd_mapping_modal(
          ns("mapping"), label = label, title = title,
          regions = gregion_levels(), choices = choices, existing = existing, i18n = i18n
        )
      })

      # One consolidated value on Save (a named list, region -> matched value) instead of looping over
      # gregion_levels() to read N separate selectize inputs -- req(input$mapping) also filters out
      # InputAdapter's own mount-time echo (shiny.react's useValue() sends the current -- here, always
      # NULL/undefined, since cd_mapping_modal() never passes an initial `value` -- prop back on every mount, and
      # output$modal above remounts this component each time gregion_levels()/survey_data()/survey_map()
      # change, including right after this very observer's own cache write; req() stops that echo from ever
      # reaching the body below, so it can't loop).
      observeEvent(input$mapping, {
        req(cache(), input$mapping)
        col <- show_col_now()

        # Each entry is now {value, source} (MappingModal.tsx's save()), not a bare string -- source is "auto"
        # when that row is still exactly autoMatch()'s own untouched suggestion, "user" otherwise (picked,
        # edited, or carried over from a previous save with no suggestion at all). Kept as its own `source`
        # column on the saved tibble, not a separate CacheConnection field, so it round-trips through
        # set_survey_mapping()/set_map_mapping() and a resumed .rds exactly like every other column here --
        # mapping_steps.R's mapping_provenance_banner() reads it back to tell the user how much of what's saved
        # was actually auto-matched vs their own review (explicit user request).
        mapping_list <- input$mapping
        mapping_result <- tibble(
          admin_level_1 = names(mapping_list),
          !!sym(col) := vapply(mapping_list, function(x) x$value, character(1)),
          source = vapply(mapping_list, function(x) x$source, character(1))
        ) %>%
          filter(!!sym(col) != "") # a row the user left unmapped (blank) despite the confirm step -- drop
                                    # it rather than save a blank match, same as no mapping existing at all

        if (type == 'map_mapping') {
          cache()$set_map_mapping(mapping_result)
        } else if (type == 'survey_mapping') {
          cache()$set_survey_mapping(mapping_result)
        }
      })
    }
  )
}
