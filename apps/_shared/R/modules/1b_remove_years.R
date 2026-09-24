remove_years_ui <- function(id, i18n) {
  ns <- NS(id)

  cd_page_ui(id, i18n,
    div(
      class = "cd-form-centered",
      cd_card(
        title = i18n$t("title_adjust_remove_years"),
        status = 'danger',
        width = 12,
        solidHeader = TRUE,
        div(
          class = "cd-stack",
          tags$p(
            i18n$t("msg_adjust_removal_info"),
            style = "color: red; font-weight: bold; margin-bottom: 15px;"
          ),
          # cd_chip_multi(), not selectizeInput(multiple = TRUE) -- the one genuinely multi-select case in the
          # app's selectInput()/selectizeInput() cleanup (cd_field_select() is single-value only). Options/
          # selection are pushed from the server once mounted (cd_years_sync(), server below), same
          # established pattern years-select.R already uses for every other "pick years" chip in the app.
          cd_chip_multi(ns('year_to_remove'), "title_adjust_select_years", i18n = i18n),
          cd_button(ns('remove_year'), "btn_adjust_confirm_remove", i18n, icon = "wrench", variant = "primary", block = TRUE, class = "cd-action-block"),
          cd_message_ui(ns('remove_feedback'))
        )
      )
    )
  )
}

remove_years_server <- function(id, cache, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {

      messageBox <- cd_message_server('remove_feedback',
                                     i18n = i18n,
                                     default_message = 'msg_adjust_no_years_removed',
                                     default_title = 'title_msg_none_removed')

      data <- reactive({
        req(cache())
        cache()$countdown_data
      })

      excluded_years <- reactive({
        req(cache())
        cache()$excluded_years
      })

      # cache -> chip (options + current selection), same helper/convention as every other "pick years" chip
      # (years-select.R) -- replaces the two updateSelectInput() calls above.
      cd_years_sync(input, session, "year_to_remove",
        years = reactive({ req(cache()); cache()$data_years }),
        selected = excluded_years
      )

      observeEvent(excluded_years(), {
        req(cache(), data())

        if (length(excluded_years()) > 0) {
          list_years <- paste(excluded_years(), collapse = ', ')
          messageBox$update_message('msg_adjust_removed_year',  'success', list(years = list_years), title = 'title_msg_years_removed')
        } else {
          messageBox$update_message('msg_adjust_no_years_removed', 'info', title = 'title_msg_none_removed')
        }
      })

      observeEvent(input$remove_year, {
        req(cache())
        # cd_chip_multi() reports "nothing chosen" as "" (ChipMulti.tsx's own convention, matching "All years"
        # elsewhere), not NULL the way selectizeInput(multiple = TRUE) did -- as.numeric("") would silently
        # become NA (still is.numeric(), so set_excluded_years()'s own validator wouldn't catch it), so this
        # is guarded explicitly rather than reusing the other years-chip call sites' unguarded as.integer().
        years <- input$year_to_remove
        cache()$set_excluded_years(if (length(years) && !identical(years, "")) as.numeric(years) else numeric(0))
      })

    }
  )
}
