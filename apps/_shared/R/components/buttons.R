# A per-card "fill the screen" toggle (ExpandButton.tsx) -- not an InputAdapter component (no `inputId`, unlike
# every other chart tool above): purely a client-side visual toggle, nothing server-side needs to know about.
cd_expand_button <- function(i18n = cd_i18n()) {
  cd_react_element("ExpandButton", shiny.react::asProps(
    expandLabel = cd_text(i18n, "lbl_chart_expand"),
    collapseLabel = cd_text(i18n, "lbl_chart_collapse")
  ))
}

# The app's own button (CdButton.tsx). `inputId`: already ns()'d by the caller, like cd_empty_state()'s `id`. A click
# is a one-shot event: input$<id> has no value until the first click, so observeEvent() needs no ignoreInit.
# `variant`: "default" | "primary" | "link" | "bare" (no look of its own; `class` styles it).
cd_button <- function(inputId, label = NULL, i18n = cd_i18n(), icon = NULL, variant = "default", size = "md",
                     class = NULL, disabled = FALSE, block = FALSE, title = NULL) {
  cd_react_element("CdButton", do.call(shiny.react::asProps, c(
    list(id = inputId, variant = variant, size = size),
    if (!is.null(label)) list(label = cd_label(i18n, label)),
    if (!is.null(icon)) list(icon = cd_icon_class(icon)),
    if (!is.null(class)) list(className = class),
    if (isTRUE(disabled)) list(disabled = TRUE),
    if (isTRUE(block)) list(block = TRUE),
    if (!is.null(title)) list(title = cd_label(i18n, title))
  )))
}

# The per-card "Ask AI" trigger (project/ReportingRate.dc.html's own card-header toolbar) -- a stub, same
# "coming soon" state HeaderActions.tsx's own global Ask AI button already is (that one hardcodes its label
# untranslated; this one doesn't repeat that gap). No React component of its own: a plain, static button needs
# no client-side state to manage.
cd_ask_ai_button <- function(i18n = cd_i18n()) {
  tags$button(
    type = "button", class = "cd-card__askai", title = i18n$t("lbl_ask_ai_soon"),
    tagList(
      tags$svg(
        width = "16", height = "16", viewBox = "0 0 24 24", fill = "none", stroke = "currentColor",
        `stroke-width` = "1.75", `stroke-linecap` = "round", `stroke-linejoin` = "round", `aria-hidden` = "true",
        tags$path(d = "M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z")
      ),
      tags$span(i18n$t("btn_global_ask_ai"))
    )
  )
}
