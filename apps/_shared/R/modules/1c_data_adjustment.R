data_adjustment_ui <- function(id, i18n) {
  ns <- NS(id)

  k_factor_options <- c(0, 0.25, 0.5, 0.75, 1)

  cd_page_ui(id, i18n,
    div(
      class = "cd-form-centered",
      cd_card(
        title = i18n$t("title_adjust_factors"),
        status = 'success',
        solidHeader = TRUE,
        width = 12,
        div(
          class = "cd-field-grid",
          # cd_field_select(), not selectizeInput() -- same app-wide cleanup as national_rates.R's own selects.
          # `value`: selectizeInput() with no `selected` defaulted to its first choice (0); matched here rather
          # than left NULL, since cd_field_select() (unlike selectizeInput) doesn't pick a default on its own.
          # one select per adjustment factor the app's indicator group has (cd_cfg("k_factors"))
          lapply(cd_cfg("k_factors"), function(f) {
            cd_field_select(ns(f$id), f$label, i18n = i18n, value = "0", options = cd_plain_options(k_factor_options))
          })
        )
      ),
      cd_card(
        title = 'Adjust',
        status = 'danger',
        width = 12,
        solidHeader = TRUE,
        div(
          class = "cd-stack",
          tags$p(
            i18n$t("msg_adjust_info"),
            style = 'color: red; font-weight: bold; margin-bottom: 15px;'
          ),
          cd_button(ns('adjust_data'), "btn_adjust_execute", i18n, icon = "wrench", variant = "primary", block = TRUE, class = "cd-action-block"),
          cd_message_ui(ns('feedback')),
          cd_download_button_ui(ns('download_data'))
        )
      )
    )
  )
}

# active: accepted (unused) so the registry can pass it like every other page.
data_adjustment_server <- function(id, cache, i18n, active = reactive(TRUE)) {
  stopifnot(is.reactive(cache))

  moduleServer(
    id = id,
    module = function(input, output, session) {

      state <- reactiveValues(loaded = FALSE)
      messageBox <- cd_message_server('feedback', i18n = i18n, default_message = 'msg_adjust_dataset_not_adjusted', default_title = 'title_msg_not_adjusted')

      # cache()$adjust_data() can fail on data that lacks columns the adjustment needs (cd2030.core's own
      # required-column check runs earlier and does not cover all of them). Say so in the message box instead of
      # leaving an uncaught error in the R console and "adjustment in progress" on screen.
      run_adjustment <- function() {
        tryCatch(
          {
            cache()$adjust_data()
            TRUE
          },
          error = function(e) {
            messageBox$update_message('msg_adjust_failed', 'error', parameters = list(details = clean_error_message(e)), title = 'title_msg_error')
            FALSE
          }
        )
      }

      data <- reactive({
        req(cache())
        cache()$data_with_excluded_years
      })

      modified_data <- reactive({
        req(cache(), cache()$adjusted_flag)
        cache()$adjusted_data
      })

      k_factors <- reactive({
        req(cache())
        cache()$k_factors
      })

      observeEvent(data(), {
        req(data())
        state$loaded <- FALSE
      })

      k_fields <- cd_cfg("k_factors")

      observeEvent(lapply(k_fields, function(f) input[[f$id]]), {
        req(cache())

        # A field that has not mounted / been filled yet reads NULL (or NA while being typed): as.numeric(NULL) is
        # numeric(0), and `k['anc'] <- numeric(0)` is an error ("replacement has length zero"). Only take a real
        # number; a missing one keeps the cache's current factor.
        k <- k_factors()
        set_k <- function(name, value) {
          v <- suppressWarnings(as.numeric(value))
          if (length(v) == 1 && !is.na(v)) k[name] <<- v
        }
        for (name in names(k_fields)) set_k(name, input[[k_fields[[name]]$id]])

        cache()$set_k_factors(k)
      }, ignoreInit  = TRUE)

      # A push to a field that hasn't mounted yet is silently lost client-side (shiny.react's own
      # updateReactInput(), no retry) -- national_rates.R hit this live for its own cd_field_select()/
      # cd_field_number() fields and documents it at length; same gate applied here. cd_remounted(), not
      # cd_mounted(): matches national_rates.R's own reasoning (a torn-down-and-rebuilt panel, e.g. a
      # landing-page Edit link back into this step, would otherwise never push again after the first mount).
      k_field_mounted <- lapply(k_fields, function(f) cd_remounted(input, f$id))
      k_fields_mounted <- reactive(all(vapply(k_field_mounted, function(m) !is.null(m()), logical(1))))

      observe({
        req(cache(), !state$loaded, k_fields_mounted())

        k <- k_factors()
        for (name in names(k_fields)) {
          if (name %in% names(k)) cd_update_input(k_fields[[name]]$id, session, value = as.character(unname(k[name])))
        }

        if (cache()$adjusted_flag) {
          run_adjustment()
        }

        state$loaded <- TRUE
      })

      observeEvent(input$adjust_data, {
        req(data())
        messageBox$update_message('msg_adjust_in_progress', 'info', title = 'title_msg_in_progress')
        run_adjustment()
      })

      observe({
        req(cache())
        if (cache()$adjusted_flag) {
          messageBox$update_message('msg_adjust_success', 'success', title = 'title_msg_adjusted')
        } else {
          messageBox$update_message('msg_adjust_dataset_not_adjusted', 'info', title = 'title_msg_not_adjusted')
        }
      })

      cd_download_button_server(
        id = 'download_data',
        filename = reactive('master_adj_dataset'),
        extension = reactive('dta'),
        i18n = i18n,
        content = function(file, data) {
          haven::write_dta(data, file)
        },
        data = modified_data,
        label = "btn_adjust_download"
      )

    }
  )
}
