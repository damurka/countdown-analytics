# The stacked feedback list cd_message_ui()/cd_message_server() (_shared/R/components/message-box.R) shows under an upload control
# or similar -- was a plain jQuery-appended <div> stack (www/messagebox/messagebox.js). cd_message_server()'s own
# public API (add_message()/update_message()/clear_messages()) is unchanged: it still sends the exact same
# "messagebox" custom message ({rootId, action, text, status, usePre}); only what renders it client-side moved
# to MessageBoxStatus.tsx. `id` must equal cd_message_server()'s own `rootId` (ns("body")) so this instance
# reacts to its own messages, not some other message box's.
cd_message_box <- function(id) {
  cd_react_element("MessageBoxStatus", shiny.react::asProps(id = id))
}

# One always-visible status banner (icon + bold title + description, filename in monospace if given) -- the
# single-banner counterpart to cd_message_box()'s stacked list; both render through the same StatusBanner.tsx/
# StatusIcon.tsx, so there's one icon+banner implementation shared across the app, not two. Replaces what used
# to be plain R-rendered SVG+div markup built directly in upload_box.R (cd_icon_check_circle()/
# cd_icon_alert_circle(), now removed).
# title/description: translation keys (or the markup i18n$t() returns for one), same convention as every other
# cd*() helper -- EXCEPT description also accepts already-resolved text (e.g. a dynamic error message built at
# one point in time, upload_box.R's own st$message): cd_text() falls back to showing an unrecognized "key"
# verbatim in every language when it isn't found in the translation table, which is exactly the right behavior
# for text that was never going to be properly multi-language reactive to begin with.
cd_status_banner <- function(status, title, description = NULL, file = NULL, i18n = cd_i18n(), use_pre = FALSE) {
  cd_react_element("StatusBanner", do.call(shiny.react::asProps, c(
    list(status = status, title = cd_text(i18n, cd_key(title))),
    if (!is.null(description)) list(description = cd_text(i18n, cd_key(description))),
    if (!is.null(file)) list(file = file),
    if (isTRUE(use_pre)) list(usePre = TRUE)
  )))
}

cd_tooltip <- function(text, label = NULL, status = NULL, i18n = cd_i18n()) {
  cd_react_element("Tooltip", do.call(shiny.react::asProps, c(
    list(text = cd_text(i18n, cd_key(text))),
    if (!is.null(label)) list(label = cd_text(i18n, cd_key(label))),
    if (!is.null(status)) list(status = status)
  )))
}

# The bar-skeleton "loading" placeholder (LoadingSkeleton.tsx) -- project/Patterns.dc.html's own "Empty and
# loading" pattern card, second example. Not an InputAdapter component: purely presentational, cd_spinner()
# (below) is what decides WHEN to show it.
cd_loading_skeleton <- function(i18n = cd_i18n()) {
  cd_react_element("LoadingSkeleton", shiny.react::asProps(
    label = cd_text(i18n, "lbl_loading_calculating")
  ))
}

# The custom-code replacement for shinycssloaders::withSpinner() -- explicit user request ("replace all
# withSpinner ... use react component"). Wraps `ui` in a plain container (.cd-spinner-wrap, styles.css) that
# spinner.ts (js/src) toggles a "cd-spinner-wrap--busy" class on, in response to the SAME per-output Shiny
# lifecycle events (shiny:recalculating / shiny:value / shiny:error) shinycssloaders' own JS listened for --
# cd_loading_skeleton() (above) is the overlay shown while that class is present; styles.css hides `ui` and
# shows the overlay only while the class is there, so the normal (idle) case renders exactly as if this
# wrapper weren't here at all. Every existing withSpinner(x) call site becomes cd_spinner(x) -- same position,
# same single argument, no caller-side signature change beyond the name.
# Starts in an "init" state (the skeleton is what the very first paint shows), not idle: an output that hasn't
# computed yet is an empty box, and painting that -- "No data available", or nothing -- for the moment before Shiny reports
# "recalculating" made every card flash empty, then swap to the skeleton, then swap again to the real content,
# resizing three times. Init overlays the skeleton and hides the output with visibility (NOT display:none --
# Shiny doesn't compute an output it believes is hidden, so display:none here would never load); spinner.ts
# clears it on the output's first recalculating/value/error. `min_height`: the height the
# finished content will roughly occupy (a chart's 400px, say), applied to the skeleton and to the wrapper so
# that swap doesn't change the card's size.
cd_spinner <- function(ui, i18n = cd_i18n(), min_height = NULL) {
  div(
    class = "cd-spinner-wrap cd-spinner-wrap--init",
    style = if (!is.null(min_height)) paste0("--cd-skel-h: ", htmltools::validateCssUnit(min_height), ";"),
    ui,
    div(class = "cd-spinner-overlay", cd_loading_skeleton(i18n = i18n))
  )
}

# project/Patterns.dc.html's own "Empty and loading" pattern card, first example -- an icon, a title, a muted
# message, and an optional single action button (EmptyState.tsx). `id`: already ns()'d by the caller, same
# convention as cd_field_number()'s own `inputId` -- used to build the one-shot `<id>_action` Shiny input the
# action button fires (EmptyState.tsx's own comment), which the caller observes with
# observeEvent(input$<local-id>_action, ..., ignoreInit = TRUE) and answers however makes sense for that
# particular empty state (cd_navigate_to(), most often -- see _shared/R/core (and components/)'s own cd_navigate_to()).
# `title`/`message`/`action_label`: translation KEYS (cd_text() resolves them), not raw text, same convention
# every other text-carrying argument in this file follows.
cd_empty_state <- function(id, title, message, i18n = cd_i18n(), action_label = NULL) {
  cd_react_element("EmptyState", do.call(shiny.react::asProps, c(
    list(id = id, title = cd_text(i18n, title), message = cd_text(i18n, message)),
    if (!is.null(action_label)) list(actionLabel = cd_text(i18n, action_label))
  )))
}
