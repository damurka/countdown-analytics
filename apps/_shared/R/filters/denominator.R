cd_denominator_choices <- c(
  "opt_dhis2" = "dhis2",
  "opt_anc1" = "anc1",
  "opt_penta1" = "penta1",
  "opt_penta1derived" = "penta1derived",
  "opt_anc1derived" = "anc1derived"
)

# The choices the chip offers. The rmncah set by default; an app whose indicator group has fewer denominators
# (vaxx has no maternal "anc1derived") sets options(cd2030.denominator_choices = c(...)).
cd_denominator_options <- function() getOption("cd2030.denominator_choices", cd_denominator_choices)

# Does this app's indicator group have a maternal denominator at all? (vaccine does not.)
cd_has_maternal <- function() isTRUE(cd_cfg("has_maternal", !identical(getOption("cd2030.selected_group"), "vaccine")))

# Keep only the entries of a named list/vector that are denominators this app offers (plus the "un" projection): legend and
# category labels list every denominator, and one an app does not offer (vaxx has no "anc1derived") must not appear.
cd_only_denominators <- function(x) x[names(x) %in% c("un", cd_denominator_options())]

# The chip's label and hint are translation keys
cd_denominator_chip_keys <- function(is_maternal) {
  list(
    label = if (is_maternal) "lbl_chip_denom_mat" else "lbl_chip_denom_vacc",
    hint = if (is_maternal) "tt_denom_select_best_mat" else "tt_denom_select_best_vacc"
  )
}

cd_denominator_ui <- function(id, i18n, allow_input = FALSE, is_maternal = FALSE) {
  ns <- NS(id)
  if (allow_input) {
    keys <- cd_denominator_chip_keys(is_maternal)
    # React filter chip (js/src/components/ChipSelect.tsx). It starts empty: the value comes from the
    # cache, and an empty value is ignored by the server below, so mounting never overwrites the cache.
    cd_chip_select(ns("denominator"), keys$label, cd_denominator_options(), i18n, selected = "", hint = keys$hint, allow_empty = TRUE)
  } else {
    NULL
  }
}

cd_denominator_server <- function(id, cache, i18n, label = 'title_denom_select_best', allowInput = FALSE, is_maternal = FALSE, display_mode = 'combined') {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      # Only an instance that renders a dropdown has anything to keep in sync with the cache.
      # Read-only instances are just the renderUI below: no observers, and no messages sent to
      # an element that does not exist.
      if (allowInput) {
        denominator <- reactive({
          req(cache())
          if (is_maternal) {
            cache()$maternal_denominator
          } else {
            cache()$denominator
          }
        })

        # A message sent to a chip that has not mounted yet is lost, so wait for it to say it has.
        chip_mounted <- cd_mounted(input, "denominator")

        # cache -> chip. Runs when the CACHE value changes, or when the chip mounts. It must not depend on
        # input$denominator: when the user picks something, that change reaches the cache through the writer
        # below, and an observer that also reacted to the input could run first, see the old cache value, and
        # push it back over the user's choice. (Even reading the input in the event expression is enough:
        # observeEvent re-runs whenever anything it reads is invalidated, whether or not the value changed.)
        observeEvent(list(denominator(), chip_mounted()), {
          req(denominator(), chip_mounted())

          if (!identical(isolate(input$denominator), denominator())) {
            cd_update_input("denominator", session, value = denominator())
          }
        })

        # dropdown -> cache: the single writer for this value
        observeEvent(input$denominator, {
          req(cache(), input$denominator)
          if (input$denominator == "") return()

          if (is_maternal) {
            isolate(cache()$set_maternal_denominator(input$denominator))
          } else {
            isolate(cache()$set_denominator(input$denominator))
          }
        })
      }
    }
  )
}
