# A compact single-choice filter chip: shows "label  value" and opens a small popover with the options.
# `label` and `hint` are translation keys. `options` overrides `choices` when the options are built in code
# (grouped or data-driven lists). Use "" for `selected` when the value comes from the cache. `default` (optional)
# makes the chip show when it has been changed, and offer a Reset.
cd_chip_select <- function(inputId, label, choices = NULL, i18n = cd_i18n(), selected = NULL, hint = NULL,
                         default = NULL, options = NULL, key = NULL, allow_empty = FALSE) {
  options <- options %||% if (is.null(choices)) list() else cd_options(choices, i18n)
  selected <- selected %||% (if (length(options)) options[[1]]$key else "")
  cd_react_element("ChipSelect", do.call(shiny.react::asProps, c(
    list(inputId = inputId, value = selected, options = options, label = cd_text(i18n, cd_key(label))),
    if (!is.null(hint)) list(hint = cd_text(i18n, cd_key(hint))),
    if (!is.null(default)) list(defaultValue = default),
    if (isTRUE(allow_empty)) list(allowEmpty = TRUE),
    # a changed `key` makes React remount the chip, which resets it to `selected`
    if (!is.null(key)) list(key = key),
    cd_chip_texts(i18n)
  )))
}

# A multi-choice chip, e.g. several years. Choosing nothing means "all" and reaches the server as "", which is
# what the "All years" entry it replaces sent.
cd_chip_multi <- function(inputId, label, choices = NULL, i18n = cd_i18n(), selected = NULL, hint = NULL,
                        options = NULL, all_label = "lbl_all_years") {
  options <- options %||% if (is.null(choices)) list() else cd_options(choices, i18n)
  cd_react_element("ChipMulti", do.call(shiny.react::asProps, c(
    list(inputId = inputId, value = if (length(selected)) as.character(selected) else "", options = options,
         label = cd_text(i18n, cd_key(label)), allLabel = cd_text(i18n, all_label)),
    if (!is.null(hint)) list(hint = cd_text(i18n, cd_key(hint))),
    cd_chip_texts(i18n)
  )))
}

# A chip holding one number, e.g. a threshold
cd_chip_number <- function(inputId, label, i18n = cd_i18n(), value = NULL, min = NULL, max = NULL, step = NULL,
                         unit = "", picks = NULL, default = NULL, hint = NULL) {
  cd_react_element("ChipNumber", do.call(shiny.react::asProps, c(
    list(inputId = inputId, value = value, label = cd_text(i18n, cd_key(label)), unit = unit),
    if (!is.null(hint)) list(hint = cd_text(i18n, cd_key(hint))),
    if (!is.null(min)) list(min = min),
    if (!is.null(max)) list(max = max),
    if (!is.null(step)) list(step = step),
    if (!is.null(picks)) list(picks = as.list(picks)),
    if (!is.null(default)) list(defaultValue = default),
    cd_chip_texts(i18n)
  )))
}

# An always-visible labeled numeric field (label above, input, a hint line below -- see .cd-field-stack in
# styles.css), not a popover chip: for a grid of fields shown together (e.g. Load Data's National Rates card),
# not a single filter-bar control. Same live min/max validation as cd_chip_number() (FieldNumber.tsx reuses
# ChipNumber.tsx's own validation logic), which a plain shiny::numericInput() has no way to show inline.
# required/requiredLabel: when TRUE, an empty field shows requiredLabel (amber warning) instead of hint.
# unit: a short trailing addon shown INSIDE the field ("%") -- the design's own "Number with unit" token
# (Patterns.dc.html), distinct from `hint` (which still names the value's range/type below the field, e.g.
# "Percent, 0-100"; the two aren't redundant, unit is the symbol, hint is the range). Plain text, not a
# translation key: "%" is the same symbol in every language this app supports, so there's nothing to resolve.
# No unit for a proportion field -- the design has no example of one (proportions have no single-character
# symbol the way percent has "%"), so those keep the hint-only treatment they already had rather than guessing
# at an unshown pattern.
cd_field_number <- function(inputId, label, i18n = cd_i18n(), value = NULL, min = NULL, max = NULL, step = NULL,
                          hint = NULL, required = FALSE, requiredLabel = NULL, unit = NULL) {
  cd_react_element("FieldNumber", do.call(shiny.react::asProps, c(
    list(inputId = inputId, value = value, label = cd_text(i18n, cd_key(label)), required = required),
    if (!is.null(hint)) list(hint = cd_text(i18n, cd_key(hint))),
    if (!is.null(min)) list(min = min),
    if (!is.null(max)) list(max = max),
    if (!is.null(step)) list(step = step),
    if (required && !is.null(requiredLabel)) list(requiredLabel = cd_text(i18n, cd_key(requiredLabel))),
    if (!is.null(unit)) list(unit = unit)
  )))
}

# An always-visible labeled <select> (label above, dropdown, a hint line below -- see .cd-field-stack in
# styles.css), the cd_field_number() counterpart for a fixed set of choices instead of a free-typed number.
# choices: a named vector (names = translation keys, values = option values) built through cd_options(), same as
# cd_chip_select(); pass `options` directly instead when the list is data, not translations (cd_plain_options()).
cd_field_select <- function(inputId, label, choices = NULL, i18n = cd_i18n(), value = NULL, hint = NULL, options = NULL) {
  options <- options %||% if (is.null(choices)) list() else cd_options(choices, i18n)
  cd_react_element("FieldSelect", do.call(shiny.react::asProps, c(
    list(inputId = inputId, value = value, options = options, label = cd_text(i18n, cd_key(label))),
    if (!is.null(hint)) list(hint = cd_text(i18n, cd_key(hint)))
  )))
}

# The options for a page's maps (years, palette): an inline bar placed directly above the map charts, not the page-wide
# sticky bar (whose label says "All charts on this page", which they are not).
cd_map_options <- function(..., i18n = cd_i18n()) {
  cd_filter_bar(..., i18n = i18n, lead = "lbl_filter_scope_maps", class = "cd-filterbar--inline")
}

# The one-line, sticky bar that holds a page's filter chips
cd_filter_bar <- function(..., i18n = cd_i18n(), lead = "lbl_filter_scope_page", class = NULL) {
  div(
    class = paste(c("cd-filterbar", class), collapse = " "),
    role = "group",
    tags$span(class = "cd-filterbar__lead i18n", `data-key` = lead, cd_plain_text(i18n, lead)),
    ...
  )
}

# ---- chart tools -------------------------------------------------------------------------------------------
# Label editor and "this chart only" view for one chart. Their values are Shiny inputs (input$<id>); see
# cd_apply_chart_options() in _shared/R/charts/chart-options.R for what the server does with them.

# A labelled checkbox (CdCheckbox.tsx) -- replaces shiny::checkboxInput(). Its value is input$<inputId> (TRUE/FALSE);
# push a new one with cd_update_input(inputId, session, value = ...).
cd_checkbox <- function(inputId, label, i18n = cd_i18n(), value = FALSE, disabled = FALSE) {
  cd_react_element("CdCheckbox", do.call(shiny.react::asProps, c(
    list(inputId = inputId, label = cd_label(i18n, label), value = isTRUE(value)),
    if (isTRUE(disabled)) list(disabled = TRUE)
  )))
}

# A labelled multi-line text field (CdTextArea.tsx) -- replaces shiny::textAreaInput(). Its text is input$<inputId>;
# push new text with cd_update_input(inputId, session, value = ...). `height` in px.
cd_text_area <- function(inputId, label = NULL, i18n = cd_i18n(), value = "", placeholder = NULL, height = 150) {
  cd_react_element("CdTextArea", do.call(shiny.react::asProps, c(
    list(inputId = inputId, value = value, height = height),
    if (!is.null(label)) list(label = cd_label(i18n, label)),
    if (!is.null(placeholder)) list(placeholder = cd_label(i18n, placeholder))
  )))
}
