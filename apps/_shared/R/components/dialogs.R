# ---- Dialogs: the app's own replacement for shiny::modalDialog()/showModal()/removeModal()/modalButton() -------
# The dialog is ordinary server-rendered markup put on the page with insertUI(), so Shiny binds the inputs inside
# it exactly as it did inside showModal(); dialog.ts (js/src) only closes it (close buttons, Escape, backdrop when
# `easy_close`). One dialog at a time, id "cd-dialog" -- showing another replaces it, as showModal() does.
cd_dialog <- function(title, ..., footer = NULL, easy_close = FALSE, size = c("md", "lg")) {
  size <- match.arg(size)
  div(
    id = "cd-dialog", class = "cd-dialog-backdrop", `data-easy-close` = if (isTRUE(easy_close)) "true" else "false",
    div(
      class = paste0("cd-dialog cd-dialog--", size), role = "dialog", `aria-modal` = "true",
      div(class = "cd-dialog__header", tags$h2(class = "cd-dialog__title", title)),
      div(class = "cd-dialog__body", ...),
      if (!is.null(footer)) div(class = "cd-dialog__footer", footer)
    )
  )
}

cd_show_dialog <- function(title, ..., footer = NULL, easy_close = FALSE, size = c("md", "lg"),
                           session = shiny::getDefaultReactiveDomain()) {
  cd_remove_dialog(session)
  shiny::insertUI(
    selector = "body", where = "beforeEnd", immediate = TRUE, session = session,
    ui = cd_dialog(title, ..., footer = footer, easy_close = easy_close, size = size)
  )
}

cd_remove_dialog <- function(session = shiny::getDefaultReactiveDomain()) {
  shiny::removeUI(selector = "#cd-dialog", immediate = TRUE, session = session)
}

# A footer button that just closes the dialog (modalButton()'s replacement) -- closed client-side by dialog.ts.
cd_dialog_close_button <- function(label, primary = FALSE) {
  tags$button(
    type = "button", `data-cd-dialog-close` = NA,
    class = paste("cd-button", if (primary) "cd-button--primary"),
    label
  )
}
