# The chart's customize tool: one panel for its text, axes, legend, grid, background, marks and layout
# (js/src/components/ChartCustomize.tsx). What it edits is CHART_FIELDS (charts/chart-schema.R); its values are
# cd2030.core chart options (charts/chart-state.R). The tabs and fields are the same for every chart, so they are built once.
.chart_schema_cache <- new.env(parent = emptyenv())

cd_chart_customize <- function(inputId, i18n = cd_i18n()) {
  if (is.null(.chart_schema_cache$schema)) .chart_schema_cache$schema <- cd_chart_schema(i18n)
  keys <- c(
    tool = "lbl_cc_tool", title = "lbl_cc_title", applyTo = "lbl_cc_apply_to", targetScreen = "lbl_cc_target_screen",
    targetReport = "lbl_cc_target_report", targetBoth = "lbl_cc_target_both", reportNote = "lbl_cc_report_note", bothNote = "lbl_cc_both_note", chartId = "lbl_cc_chart_id", chartIdHint = "lbl_cc_chart_id_hint", search = "lbl_cc_search", noResults = "lbl_cc_no_results",
    reset = "lbl_chart_reset", resetGroup = "lbl_cc_reset_group", resetAll = "lbl_cc_reset_all",
    changed = "lbl_cc_changed", asDrawn = "lbl_chart_style_as_drawn", yes = "lbl_chart_style_yes", no = "lbl_chart_style_no",
    min = "lbl_chart_style_min", max = "lbl_chart_style_max", entriesLegend = "lbl_chart_style_legend_entries",
    entriesCategories = "lbl_chart_style_category_entries", entryText = "lbl_chart_style_entry_text",
    entryColor = "lbl_chart_style_entry_color", autoNote = "lbl_chart_auto_down", show = "lbl_cc_show", hidden = "lbl_cc_hidden"
  )
  cd_react_element("ChartCustomize", shiny.react::asProps(
    inputId = inputId,
    tabs = .chart_schema_cache$schema$tabs,
    fields = .chart_schema_cache$schema$fields,
    entries = list(),
    defaults = list(),
    texts = lapply(keys, function(k) cd_text(i18n, k))
  ))
}
