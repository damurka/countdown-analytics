cd_notes_button_ui <- function(id, i18n) {
  ns <- NS(id)
  cd_button(ns('document_page'), "btn_doc_add_notes", i18n, icon = 'pen-to-square', size = 'sm')
}

cd_notes_button_server <- function(id, cache, document_objects, page_id, page_name, i18n) {
  stopifnot(is.reactive(cache))

  moduleServer(id, function(input, output, session) {
    ns <- session$ns

    observeEvent(input$document_page, {
      req(cache(), document_objects)

      objects <- names(document_objects)

      cd_show_dialog(
          title = tagList(i18n$t("title_doc_page"), " ", page_name),
          size = "lg",
          div(class = "cd-stack",
            div(
              class = "cd-cols-2",
              # cd_field_select(), not selectInput() -- app-wide select cleanup. The placeholder option (value
              # "", "Select an object") is prepended by hand since cd_plain_options() only covers `objects`
              # itself, same as the plain character vector every other cd_plain_options() caller passes.
              cd_field_select(
                ns('object_select'), "opt_doc_obj", i18n = i18n, value = "",
                options = c(list(list(key = "", text = cd_text(i18n, "title_doc_select_obj"))), cd_plain_options(objects))
              ),
              uiOutput(ns('checkbox_container'))
            ),
            tags$div(
              id = ns('pointers_display'),
              class = 'parameters-section',
              tags$h5(i18n$t("title_doc_interp")),
              uiOutput(ns('pointers_text'))
            ),
            cd_text_area(ns('documentation_text'), "title_doc_enter_notes", i18n, placeholder = "msg_doc_add", height = 150),
            tags$div(
              id = ns('parameters_display'),
              class = 'parameters-section',
              tags$h5(i18n$t("title_doc_params")),
              uiOutput(ns('parameters_text'))
            )
          ),
          footer = tagList(
            cd_dialog_close_button(i18n$t("btn_global_cancel")),
            cd_button(ns('save_documentation'), "btn_doc_save", i18n, variant = "primary")
          )
      )
    })

    observeEvent(input$object_select, {
      req(cache(), input$object_select)

      selected_object <- document_objects[[input$object_select]]

      params <- map(selected_object$parameters, ~ .x())
      # params <- lapply(selected_object$parameters, function(p) p())

      output$parameters_text <- renderUI({
        tags$div(
          style = 'border: 1px solid #ddd; padding: 10px; background: #f9f9f9; border-radius: 5px;',
          tags$ul(
            map(names(params), ~ {
              tags$li(
                tags$b(.x), ': ', tags$span(style = 'color: #007bff;', params[[.x]])
              )
            })
          )
        )
      })

      output$pointers_text <- renderUI({
        prompts <- selected_object$prompts

        if (length(prompts) == 0) {
          tags$em(i18n$t("msg_global_none"))
        } else {
          tags$div(
            style = 'border: 1px solid #ddd; padding: 10px; background: #fefefe; border-radius: 5px;',
            tags$ul(
              map(prompts, ~ tags$li(style = 'margin-bottom: 6px;', i18n$t(.x)))
            )
          )
        }
      })

      # The saved note (if one matches these parameters) is read BEFORE the checkboxes are drawn and handed to
      # them as their starting values: a message pushed to a React input that has not mounted yet is lost, and
      # these are created by the renderUI() below, so an update sent afterwards would never arrive.
      existing_notes <- cache()$get_notes(page_id, input$object_select, params)
      has_note <- nrow(existing_notes) > 0
      start_include <- if (has_note) isTRUE(existing_notes$include_in_report[1]) else FALSE
      start_plot <- if (has_note) isTRUE(existing_notes$include_plot_table[1]) else FALSE

      output$checkbox_container <- renderUI({
        if (selected_object$always_include) {
          tags$div(
            cd_checkbox(ns('include_always'), "btn_doc_include_page", i18n, value = TRUE, disabled = TRUE)
          )
        } else {
          tagList(
            cd_checkbox(ns('include_in_report'), "btn_doc_include_final", i18n, value = start_include),
            cd_checkbox(ns('include_plot_table'), "btn_doc_include_plot", i18n, value = start_plot)
          )
        }
      })

      # The text area is part of the dialog itself (already mounted), so it can be updated directly.
      cd_update_input('documentation_text', session, value = if (has_note) existing_notes$note[1] else '')
    })

    observeEvent(input$save_documentation, {
      # Validate required inputs
      req(cache(), input$object_select, input$documentation_text)

      # Retrieve the selected object and its parameters
      selected_object <- document_objects[[input$object_select]]

      # Safely evaluate parameters
      params <- tryCatch(
        map(selected_object$parameters, ~ .x()),
        error = function(e) {
          showNotification(i18n$t("err_doc_eval_params"), type = 'error')
          return(NULL)
        }
      )
      req(params)  # Stop execution if parameter evaluation fails

      # Determine whether the note should be included in the report
      include_in_report <- if (selected_object$always_include) {
        TRUE
      } else {
        input$include_in_report
      }

      include_plot_table <- if (!selected_object$always_include) {
        input$include_plot_table
      } else {
        NULL
      }

      # Save the note to the cache
      tryCatch({
        # Use append_page_note with overwrite parameter
        cache()$append_page_note(
          page_id = page_id,
          object_id = input$object_select,
          note = input$documentation_text,
          parameters = params,
          single_entry = selected_object$single_entry,  # Overwrite for single-entry objects
          include_in_report = include_in_report,
          include_plot_table = include_plot_table
        )

        # Close modal and show success notification
        cd_remove_dialog()
        showNotification(i18n$t("msg_doc_saved"), type = 'message')
      }, error = function(e) {
        # Handle errors during the save process
        showNotification(i18n$t("err_doc_save_failed"), type = 'error')
        message('Error saving documentation: ', clean_error_message(e))  # Log error details
      })
    })

  })
}
