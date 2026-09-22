denominator_choices <- c(
  "opt_dhis2" = "dhis2",
  "opt_anc1" = "anc1",
  "opt_penta1" = "penta1",
  "opt_penta1derived" = "penta1derived"
)

denominatorInputUI <- function(id, i18n, allow_input = FALSE) {
  ns <- NS(id)
  if (allow_input) {
    # React filter chip (js/src/components/ChipSelect.tsx). It starts empty: the value comes from the
    # cache, and an empty value is ignored by the server below, so mounting never overwrites the cache.
    cdChipSelect(ns("denominator"), "lbl_chip_denom_vacc", denominator_choices, i18n, selected = "", hint = "tt_denom_select_best")
  } else {
    uiOutput(ns("selected_denominator"))
  }
}

denominatorInputServer <- function(id, cache, i18n, label = 'title_denom_select_best', allowInput = FALSE) {
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
          cache()$denominator
        })

        # A message sent to a chip that has not mounted yet is lost, so wait for it to say it has.
        chip_mounted <- cdMounted(input, "denominator")

        # cache -> chip. Runs when the CACHE value changes, or when the chip mounts. It must not depend on
        # input$denominator: when the user picks something, that change reaches the cache through the writer
        # below, and an observer that also reacted to the input could run first, see the old cache value, and
        # push it back over the user's choice. (Even reading the input in the event expression is enough:
        # observeEvent re-runs whenever anything it reads is invalidated, whether or not the value changed.)
        observeEvent(list(denominator(), chip_mounted()), {
          req(denominator(), chip_mounted())

          if (!identical(isolate(input$denominator), denominator())) {
            updateCdChip("denominator", session, value = denominator())
          }
        })

        # dropdown -> cache: the single writer for this value
        observeEvent(input$denominator, {
          req(cache(), input$denominator)
          if (input$denominator == "") return()

          isolate(cache()$set_denominator(input$denominator))
        })
      }

      output$selected_denominator <- renderUI({
        req(cache())

        translate_or <- function(key, fallback) {
          val <- i18n$t(key)
          if (is.null(val) || identical(val, key)) fallback else val
        }

        code_text <- function(code) {
          key <- paste0('opt_', code)
          val <- i18n$t(key)
          if (is.null(val) || identical(val, key)) toupper(code) else val
        }

        tags$div(
          class = 'form-group',
          tags$label(class = 'control-label', translate_or(label, 'Denominator')),
          tags$div(class = 'denominator-readonly-control', code_text(cache()$denominator))
        )
      })
    }
  )
}
