# Small pieces of markup the pooled screens are built from. Static React components (cd_*) stay in app.R;
# what is redrawn as the user goes (file rows, results, the dataset list) is plain markup here, with styles in
# www/pooled.css and colours from the shared --cd-* tokens.

pooled_page_header <- function(title, subtitle = NULL, eyebrow = NULL, right = NULL) {
  div(
    class = "cd-page-header",
    div(
      class = "cd-page-heading",
      if (!is.null(eyebrow)) div(class = "cd-page-eyebrow", eyebrow),
      tags$h1(title),
      if (!is.null(subtitle)) p(class = "cd-page-subtitle", subtitle)
    ),
    div(class = "right-buttons", right)
  )
}

# A button that is redrawn with the screen. Shiny counts its clicks as input$<id>.
pooled_btn <- function(id, label, icon = NULL, primary = FALSE, disabled = FALSE, title = NULL) {
  tags$button(
    id = id, type = "button", title = title,
    class = paste("action-button cd-button", if (primary) "cd-button--primary"),
    disabled = if (disabled) NA else NULL,
    if (!is.null(icon)) tags$i(class = paste0("fa fa-", icon)),
    tags$span(label)
  )
}

# A button that sends `value` as input$<input_id> when clicked (one input for every row, not one per row).
pooled_row_btn <- function(input_id, value, label, icon = NULL) {
  tags$button(
    type = "button", class = "cd-button", onclick = pooled_send(input_id, js_string(value)),
    if (!is.null(icon)) tags$i(class = paste0("fa fa-", icon)), tags$span(label)
  )
}

# JavaScript for an element that sends one value to Shiny (no server round trip to build a button per row).
pooled_send <- function(input_id, value_js) {
  sprintf("Shiny.setInputValue('%s', %s, {priority: 'event'})", input_id, value_js)
}
js_string <- function(x) paste0("'", gsub("'", "\\\\'", gsub("\\\\", "\\\\\\\\", x)), "'")

# The same banner as cd_status_banner(), as plain markup for the parts of a screen that are redrawn.
pooled_banner <- function(status, title, description = NULL) {
  icon <- switch(status, success = "circle-check", warning = "triangle-exclamation", error = "circle-xmark", "circle-info")
  div(
    class = paste0("cd-status-banner cd-status-banner--", status), role = if (status == "error") "alert" else "status",
    tags$i(class = paste0("fa fa-", icon)),
    div(class = "cd-status-banner__body", div(class = "cd-status-banner__title", title), if (!is.null(description)) div(class = "cd-status-banner__desc", description))
  )
}

pooled_progress <- function(pct, label, small = FALSE, running = FALSE) {
  pct <- max(0, min(100, round(pct)))
  div(
    class = paste("pooled-progress", if (small) "pooled-progress--small", if (running) "pooled-progress--running"),
    role = "progressbar", `aria-valuenow` = pct, `aria-valuemin` = 0, `aria-valuemax` = 100, `aria-label` = label,
    div(class = "pooled-progress__bar", style = paste0("width:", pct, "%"))
  )
}

pooled_stat <- function(n, label, kind = "ok") {
  icon <- switch(kind, ok = "circle-check", warn = "triangle-exclamation", err = "circle-xmark", wait = "clock")
  div(
    class = paste("pooled-stat", paste0("pooled-stat--", kind)),
    tags$span(class = "pooled-stat__icon", tags$i(class = paste("fa fa-", icon, sep = ""))),
    div(tags$div(class = "pooled-stat__n", n), tags$div(class = "pooled-stat__label", label))
  )
}

pooled_size <- function(bytes) {
  if (is.na(bytes)) return("")
  if (bytes >= 1024^3) sprintf("%.1f GB", bytes / 1024^3) else if (bytes >= 1024^2) sprintf("%.0f MB", bytes / 1024^2) else sprintf("%.0f KB", max(bytes / 1024, 1))
}

# ---- step rail --------------------------------------------------------------------------------------------

POOLED_STEPS <- c(select = "Select", load = "Load", review = "Review", create = "Create")

pooled_step_list <- function(current) {
  keys <- names(POOLED_STEPS)
  cur <- match(current, keys)
  lapply(seq_along(keys), function(i) {
    list(key = keys[[i]], title_key = unname(POOLED_STEPS[[i]]), status = if (i < cur) "complete" else if (i == cur) "current" else "locked")
  })
}

# ---- select step: the list of chosen files ---------------------------------------------------------------

pooled_file_pick_row <- function(name, size, included) {
  tags$li(
    class = "pooled-row",
    tags$input(
      type = "checkbox", class = "pooled-check", checked = if (included) NA else NULL, `aria-label` = paste("Include", name),
      onchange = pooled_send("file_toggle", sprintf("{name: %s, on: this.checked}", js_string(name)))
    ),
    tags$i(class = "fa fa-file pooled-row__icon"),
    div(class = "pooled-row__main", tags$span(class = "pooled-mono", name), tags$span(class = "pooled-row__sub", pooled_size(size))),
    tags$button(
      type = "button", class = "pooled-icon-btn", `aria-label` = paste("Remove", name),
      onclick = pooled_send("file_remove", js_string(name)), tags$i(class = "fa fa-xmark")
    )
  )
}

# What R actually said, under a failed file, so the reason can be checked and not just trusted.
pooled_tech <- function(r) {
  if (!identical(r$status, "error") || is.null(r$detail) || !nzchar(r$detail)) return(NULL)
  txt <- gsub("[[:space:]]+", " ", r$detail)
  tags$span(class = "pooled-tech", paste0("R said: ", if (nchar(txt) > 220) paste0(substr(txt, 1, 220), "...") else txt))
}

# ---- load step: one row per file ---------------------------------------------------------------------------

POOLED_STATUS_TEXT <- c(ok = "Loaded", warn = "Loaded with a warning", error = "Failed", skipped = "Left out", loading = "Loading", waiting = "Waiting")

pooled_load_row <- function(r, running) {
  icon <- switch(r$status, ok = "circle-check", warn = "triangle-exclamation", error = "circle-xmark", skipped = "ban", loading = "spinner fa-spin", waiting = "clock")
  detail <- if (r$status %in% c("ok")) {
    paste0(r$country, " · ", length(r$tables), " tables")
  } else if (r$status == "loading") {
    "Reading tables..."
  } else if (r$status == "waiting") NULL else paste0(if (!is.na(r$country)) paste0(r$country, " · "), r$message)
  tags$li(
    class = paste("pooled-load", paste0("pooled-load--", r$status)),
    tags$i(class = paste0("fa fa-", icon, " pooled-load__icon")),
    div(class = "pooled-load__main", tags$span(class = "pooled-mono", r$name), if (!is.null(detail)) tags$span(class = "pooled-load__detail", detail), pooled_tech(r)),
    div(
      class = "pooled-load__state",
      tags$span(class = "pooled-load__status", POOLED_STATUS_TEXT[[r$status]]),
      if (r$status == "loading") pooled_progress(60, paste("Loading", r$name), small = TRUE, running = TRUE)
    ),
    tags$span(class = "pooled-load__size", pooled_size(r$size)),
    div(
      class = "pooled-load__actions",
      if (r$status == "error" && !running) pooled_row_btn("retry_file", r$name, "Retry", "rotate-right") else NULL
    )
  )
}

# ---- review step: things that need a decision --------------------------------------------------------------

pooled_issue_row <- function(r) {
  err <- identical(r$status, "error")
  tags$li(
    class = "pooled-issue",
    tags$i(class = paste("fa", if (err) "fa-circle-xmark pooled-issue__icon--err" else "fa-triangle-exclamation pooled-issue__icon--warn", "pooled-issue__icon")),
    div(
      class = "pooled-issue__main",
      tags$span(class = "pooled-issue__title", if (!is.na(r$country)) r$country else "Unknown country"),
      tags$span(class = "pooled-mono pooled-row__sub", r$name),
      tags$span(class = "pooled-issue__reason", r$message), pooled_tech(r)
    ),
    div(
      class = "pooled-issue__actions",
      if (err) pooled_row_btn("retry_file", r$name, "Retry", "rotate-right"),
      if (!err) pooled_row_btn("leave_out", r$name, "Leave out", "xmark")
    )
  )
}

# ---- explore: the dataset list --------------------------------------------------------------------------------

pooled_dataset_list <- function(datasets, view, selected) {
  groups <- pooled_dataset_groups(names(datasets))
  tagList(
    lapply(names(groups), function(g) {
      div(
        class = "pooled-dsgroup",
        div(class = "pooled-dsgroup__title", g),
        lapply(groups[[g]], function(nm) {
          div(
            class = paste("pooled-ds", if (identical(nm, view)) "pooled-ds--active"),
            tags$input(
              type = "checkbox", class = "pooled-check pooled-ds-check", value = nm, checked = if (nm %in% selected) NA else NULL,
              `aria-label` = paste("Select", nm, "for export"),
              onchange = pooled_send("explore_selected", "Array.from(document.querySelectorAll('.pooled-ds-check:checked')).map(function(e){return e.value;})")
            ),
            tags$a(
              href = "#", class = "pooled-ds__name", `data-dataset` = nm,
              onclick = paste0(
                "document.querySelectorAll('.pooled-ds').forEach(function(e){e.classList.remove('pooled-ds--active');});",
                "this.closest('.pooled-ds').classList.add('pooled-ds--active');",
                pooled_send("explore_view", js_string(nm)), "; return false;"
              ),
              tags$span(class = "pooled-ds__label", nm),
              tags$span(class = "pooled-ds__rows", paste(format(nrow(datasets[[nm]]), big.mark = ","), "rows"))
            )
          )
        })
      )
    })
  )
}

pooled_select_all_js <- function() {
  paste0(
    "document.querySelectorAll('.pooled-ds-check').forEach(function(e){e.checked=true;});",
    pooled_send("explore_selected", "Array.from(document.querySelectorAll('.pooled-ds-check')).map(function(e){return e.value;})"),
    "; return false;"
  )
}
pooled_select_none_js <- function() {
  paste0(
    "document.querySelectorAll('.pooled-ds-check').forEach(function(e){e.checked=false;});",
    pooled_send("explore_selected", "[]"), "; return false;"
  )
}
