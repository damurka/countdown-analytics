# The icon+label(+spinner) content of a shiny::downloadButton()'s own <a> (cd_download_button_server(), ui/download/
# download_button.R): the <a> itself, its real href and Shiny's own client-side output binding all stay exactly
# as Shiny renders them -- this only owns what's INSIDE it. Not an InputAdapter component: it has no value to
# sync back to Shiny (nothing here is input$<id>), just icon/label/busy-spinner state, so it's mounted the same
# plain way Sidebar/HeaderBreadcrumb/HeaderActions are (cd-shell.R), not the InputAdapter pattern cd_field_number/
# cd_field_select above use.
# icon: an already-resolved Font Awesome class ("fas fa-download"), not a bare icon name -- callers that only
# have a name (most of them) resolve it with cd_icon_class() themselves first. Unlike cd_field_number()/
# cd_field_select() (which always take a raw label/hint/icon *name* and resolve it internally), cd_download_button_server()
# already has to support a caller passing a pre-built shiny.tag() icon too (rare, but part of its existing
# signature) and needs its own resolution step regardless -- accepting the resolved class here avoids resolving
# it twice, once there and once again inside this function, through two different paths for the two cases.
cd_download_status <- function(id, icon, label, busyLabel = NULL, i18n = cd_i18n(), icon_only = FALSE) {
  cd_react_element("DownloadButtonStatus", do.call(shiny.react::asProps, c(
    list(id = id, icon = icon, label = cd_text(i18n, cd_key(label)), iconOnly = icon_only),
    if (!is.null(busyLabel)) list(busyLabel = cd_text(i18n, cd_key(busyLabel)))
  )))
}

# Was attaching www/downloadbtn/download-button.js here (a plain htmlDependency) for its jQuery spinner-swap
# logic -- replaced by DownloadButtonStatus.tsx (js/src/components), mounted as part of the button's own
# `label` in cd_download_button_server() below, so there's no separate script dependency to wire up here any more;
# cd_react_dependency() (already loaded on every page for the rest of this app's React components) covers it.
cd_download_button_ui <- function(id) {
  ns <- NS(id)
  div(class = "cd-download-wrap", uiOutput(ns("download_ui")))
}

cd_download_button_server <- function(
    id,
    filename,
    extension,
    content,
    data,
    i18n,
    label = "btn_global_download",
    message = "msg_downloading",
    icon = "download",
    icon_only = TRUE,
    tooltip = NULL,
    button_class = NULL,
    show_when_no_data = FALSE) {
  stopifnot(is.reactive(data), is.reactive(filename), is.reactive(extension))

  moduleServer(id, function(input, output, session) {
    ns <- session$ns

    # Debounced: during startup the cache's fields can settle over several quick updates, and each one
    # invalidates this. Rendering the button on every tick sends the client "recalculating" faster than it can
    # finish the previous cycle (a Shiny output expects idle -> running -> idle, in order); settling first keeps
    # that in order.
    checked <- shiny::debounce(reactive({
      tryCatch(data(), error = function(e) NULL)
    }), millis = 300)

    # The icon *name* this button was given, resolved to a real class once here rather than inside
    # DownloadButtonStatus.tsx's props on every render -- a pre-built shiny.tag (rare; no current caller passes
    # one, but the old icon_tag() reactive supported it, so this keeps that) has its class read straight off
    # the tag instead of going through cd_icon_class(), which only resolves icon *names*.
    icon_class <- reactive({
      if (inherits(icon, "shiny.tag")) return(htmltools::tagGetAttribute(icon, "class"))
      if (is.character(icon) && length(icon) == 1) return(cd_icon_class(icon))
      cd_icon_class("download")
    })

    output$download_ui <- renderUI({
      ok <- !is.null(checked())

      tip <- if (!is.null(tooltip)) tooltip else i18n$t(label)

      tags$a(
        id = ns("download_button"),
        class = paste(c("shiny-download-link", "cd-button", if (icon_only) "cd-button--icon", button_class, if (!ok) "disabled"),
                      collapse = " "),
        href = "", target = "_blank", download = NA,
        `aria-disabled` = if (!ok) "true" else NULL,
        title = tip,
        cd_download_status(
          ns("download_button"), icon = icon_class(), label = label, busyLabel = message, i18n = i18n,
          icon_only = icon_only
        )
      )
    })

    output$download_button <- downloadHandler(
      filename = function() {
        paste0(filename(), "_", format(Sys.time(), "%Y%m%d%H%M"), ".", extension())
      },
      content = function(file) {
        plot_data <- checked()
        # validate(need(!is.null(plot_data), "No data available to download."))

        session$sendCustomMessage(
          "starting_download",
          list(
            id = ns("download_button"),
            message = i18n$t(message),
            label = i18n$t(label)
          )
        )

        # ensure UI resets even on error
        on.exit(
          {
            session$sendCustomMessage(
              "end_download",
              list(id = ns("download_button"), label = i18n$t(label))
            )
          },
          add = TRUE
        )

        content(file, plot_data)
      }
    )
  })
}
