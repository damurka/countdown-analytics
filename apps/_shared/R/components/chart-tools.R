cd_chart_labels <- function(inputId, i18n = cd_i18n()) {
  fields <- c(title = "lbl_chart_f_title", caption = "lbl_chart_f_caption", x = "lbl_chart_f_x", y = "lbl_chart_f_y", legend = "lbl_chart_f_legend")
  cd_react_element("ChartLabels", shiny.react::asProps(
    inputId = inputId,
    editable = TRUE,
    defaults = list(),
    texts = list(
      tool = cd_text(i18n, "lbl_chart_tool_labels"),
      title = cd_text(i18n, "lbl_chart_labels_title"),
      hint = cd_text(i18n, "lbl_chart_labels_hint"),
      reset = cd_text(i18n, "lbl_chart_reset"),
      resetAll = cd_text(i18n, "lbl_chart_reset_all"),
      note = cd_text(i18n, "lbl_chart_labels_note"),
      unavailable = cd_text(i18n, "lbl_chart_labels_unavailable"),
      fields = lapply(fields, function(k) cd_text(i18n, k))
    )
  ))
}

cd_chart_view <- function(inputId, i18n = cd_i18n()) {
  keys <- c(tool = "lbl_chart_tool_view", title = "lbl_chart_view_title", hint = "lbl_chart_view_hint", reset = "lbl_chart_reset",
            orientation = "lbl_chart_orientation", auto = "lbl_chart_auto", swap = "lbl_chart_swap", keep = "lbl_chart_keep",
            size = "lbl_chart_size", legend = "lbl_chart_legend", right = "lbl_chart_right", bottom = "lbl_chart_bottom",
            hidden = "lbl_chart_hidden")
  cd_react_element("ChartView", shiny.react::asProps(
    inputId = inputId,
    texts = lapply(keys, function(k) cd_text(i18n, k))
  ))
}
