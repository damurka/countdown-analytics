# What the chart customize panel (js/src/components/ChartCustomize.tsx) edits, as data: which tab and group each
# cd2030.core chart option is under, its control, and its choices. The panel draws whatever is listed here, so making
# another chart option editable is one line in CHART_FIELDS plus its translation key (lbl_style_f_<key>; the group and
# tab names are lbl_cc_g_<group> and lbl_cc_t_<tab>). See ?cd2030.core::cd_chart_options for the options themselves.

CHART_FONTS <- c("sans", "serif", "mono", "Arial", "Calibri", "Georgia", "Verdana", "Times New Roman", "Courier New")

# The chart's elements (as PowerPoint's Format pane): each is a section of the panel, with its icon and the option that
# shows or hides it (NULL: it cannot be hidden). Its fields are listed under it, in CHART_FIELDS, with `tab` = the element.
CHART_TABS <- list(
  title = list(icon = c("M5 7V4h14v3", "M12 4v16", "M9 20h6"), show = "show_title"),
  subtitle = list(icon = c("M6 8h12", "M8 12h8", "M9 16h6"), show = "show_subtitle"),
  caption = list(icon = c("M4 18h16", "M4 14h9", ""), show = "show_caption"),
  x_title = list(icon = c("M4 20h16", "M9 16h6", ""), show = "show_x_title"),
  x_axis = list(icon = c("M4 16h16", "M7 16v3M12 16v3M17 16v3", ""), show = "show_x_text"),
  y_title = list(icon = c("M4 4v16", "M8 9v6", ""), show = "show_y_title"),
  y_axis = list(icon = c("M8 4v16", "M5 7h3M5 12h3M5 17h3", ""), show = "show_y_text"),
  legend = list(icon = c("M5 7h3", "M11 7h8", "M5 13h3M11 13h8M5 19h3M11 19h8"), show = "show_legend"),
  legend_title = list(icon = c("M5 5h14", "M5 11h3M11 11h8", "M5 17h3M11 17h8"), show = "show_legend_title"),
  labels = list(icon = c("M5 18h4v-6H5zM11 18h4V8h-4zM17 18h4V4h-4z", "M6 9h2M12 5h2", ""), show = "show_labels"),
  grid = list(icon = c("M4 4h16v16H4z", "M4 12h16", "M12 4v16"), show = NULL),
  marks = list(icon = c("M4 18l5-6 4 3 7-9", "M4 21h16", ""), show = NULL),
  panels = list(icon = c("M3 4h8v7H3z", "M13 4h8v7h-8z", "M3 13h8v7H3zM13 13h8v7h-8z"), show = "show_strips"),
  area = list(icon = c("M4 4h16v16H4z", "M7 7h10v10H7z", ""), show = NULL),
  text = list(icon = c("M6 18l6-13 6 13", "M8.5 13h7", ""), show = NULL)
)

# One field: .cf(key, element, group, type, choices kind, step/min/max, label = translation key, kw = extra search words)
.cf <- function(key, tab, group, type, choices = NULL, ..., label = NULL, kw = NULL) {
  list(key = key, tab = tab, group = group, type = type, choices = choices, label = label, kw = kw, extra = list(...))
}

CHART_FIELDS <- list(
  # ---- the chart's title
  .cf("title", "title", "titles", "text", label = "lbl_chart_f_title", kw = "heading name"),
  .cf("title_size", "title", "title_style", "number"),
  .cf("title_face", "title", "title_style", "select", "face", kw = "bold italic"),
  .cf("title_color", "title", "title_style", "color", kw = "colour"),
  .cf("title_align", "title", "title_style", "select", "align", kw = "left center right position"),
  .cf("title_position", "title", "title_style", "select", "position", kw = "align"),
  .cf("title_wrap", "title", "title_style", "number", min = 1, kw = "wrap break long lines"),
  .cf("tag", "title", "title_style", "text", kw = "label panel letter"),
  # ---- its subtitle
  .cf("subtitle", "subtitle", "titles", "text", label = "lbl_chart_f_subtitle"),
  .cf("subtitle_size", "subtitle", "subtitle_style", "number"),
  .cf("subtitle_face", "subtitle", "subtitle_style", "select", "face", kw = "bold italic"),
  .cf("subtitle_color", "subtitle", "subtitle_style", "color", kw = "colour"),
  .cf("subtitle_align", "subtitle", "subtitle_style", "select", "align", kw = "left center right position"),
  # ---- the source note under it
  .cf("caption", "caption", "titles", "text", label = "lbl_chart_f_caption", kw = "note footnote source"),
  .cf("caption_size", "caption", "caption_style", "number"),
  .cf("caption_face", "caption", "caption_style", "select", "face", kw = "bold italic"),
  .cf("caption_color", "caption", "caption_style", "color", kw = "colour"),
  .cf("caption_align", "caption", "caption_style", "select", "align", kw = "left center right position"),
  .cf("caption_position", "caption", "caption_style", "select", "position", kw = "align"),

  # ---- the horizontal axis: its title, then its labels and range
  .cf("x_title", "x_title", "axis_titles", "text", label = "lbl_chart_f_x", kw = "horizontal"),
  .cf("x_title_size", "x_title", "axis_titles", "number"),
  .cf("x_text_size", "x_axis", "tick_labels", "number"),
  .cf("x_text_angle", "x_axis", "tick_labels", "number", step = 15, kw = "rotate tilt slant years"),
  .cf("x_labels", "x_axis", "tick_labels", "select", "format", kw = "numbers percent comma format"),
  .cf("category_label_wrap", "x_axis", "tick_labels", "number", min = 1, kw = "wrap names regions"),
  .cf("x_limits", "x_axis", "range", "limits", kw = "zoom minimum maximum"),
  # ---- the vertical axis
  .cf("y_title", "y_title", "axis_titles", "text", label = "lbl_chart_f_y", kw = "vertical"),
  .cf("y_title_size", "y_title", "axis_titles", "number"),
  .cf("y_text_size", "y_axis", "tick_labels", "number"),
  .cf("y_text_angle", "y_axis", "tick_labels", "number", step = 15, kw = "rotate tilt slant"),
  .cf("y_labels", "y_axis", "tick_labels", "select", "format", kw = "numbers percent comma format"),
  .cf("y_limits", "y_axis", "range", "limits", kw = "zoom minimum maximum"),

  # ---- the legend: where and how, its entries; its title on its own
  .cf("legend_position", "legend", "legend_layout", "select", "legend_position", kw = "show hide top bottom right"),
  .cf("legend_direction", "legend", "legend_layout", "select", "legend_direction", kw = "horizontal vertical"),
  .cf("legend_justification", "legend", "legend_layout", "select", "legend_justification", kw = "align"),
  .cf("legend_ncol", "legend", "legend_layout", "number", min = 1, kw = "columns"),
  .cf("legend_nrow", "legend", "legend_layout", "number", min = 1, kw = "rows"),
  .cf("legend_reverse", "legend", "legend_layout", "boolean", kw = "order"),
  .cf("legend_key_size", "legend", "legend_layout", "number", min = 1, kw = "keys"),
  .cf("legend_background", "legend", "legend_layout", "color", kw = "colour fill"),
  .cf("legend_label_wrap", "legend", "legend_text", "number", min = 1, kw = "wrap"),
  .cf("legend_text_size", "legend", "legend_text", "number"),
  .cf("legend_text_face", "legend", "legend_text", "select", "face", kw = "bold italic"),
  .cf("legend_text_color", "legend", "legend_text", "color", kw = "colour"),
  .cf("entries", "legend", "entries", "entries", kw = "rename recolour colour text categories names"),
  .cf("legend_title", "legend_title", "legend_text", "text", label = "lbl_chart_f_legend"),
  .cf("legend_title_size", "legend_title", "legend_text", "number"),
  .cf("legend_title_face", "legend_title", "legend_text", "select", "face", kw = "bold italic"),
  .cf("legend_title_color", "legend_title", "legend_text", "color", kw = "colour"),

  # ---- the values written on the chart
  .cf("label_size", "labels", "data_labels", "number", kw = "values numbers"),
  .cf("label_angle", "labels", "data_labels", "number", step = 15, kw = "values numbers rotate"),
  .cf("label_color", "labels", "data_labels", "color", kw = "values numbers colour"),

  # ---- gridlines
  .cf("grid", "grid", "grid_lines", "select", "grid", kw = "horizontal vertical lines"),
  .cf("grid_minor", "grid", "grid_lines", "boolean"),
  .cf("grid_color", "grid", "grid_lines", "color", kw = "colour"),
  .cf("grid_linewidth", "grid", "grid_lines", "number", step = 0.1, min = 0.1, kw = "thickness"),
  .cf("grid_linetype", "grid", "grid_lines", "select", "linetype", kw = "dashed dotted"),

  # ---- lines, points and bars
  .cf("line_scale", "marks", "lines_points", "number", step = 0.1, min = 0.1, kw = "width thickness"),
  .cf("point_scale", "marks", "lines_points", "number", step = 0.1, min = 0.1, kw = "size dots markers"),
  .cf("alpha", "marks", "lines_points", "number", step = 0.1, min = 0.1, max = 1, kw = "transparency opacity"),
  .cf("bar_width", "marks", "lines_points", "number", step = 0.05, min = 0.05, max = 1, kw = "bars columns thickness gap"),
  .cf("flip", "marks", "orientation", "select", "flip", kw = "swap axes horizontal vertical rotate"),

  # ---- the panels of a chart drawn as several
  .cf("strip_text_size", "panels", "facets", "number"),
  .cf("strip_text_face", "panels", "facets", "select", "face", kw = "bold italic"),
  .cf("strip_text_color", "panels", "facets", "color", kw = "colour"),
  .cf("strip_background", "panels", "facets", "color", kw = "colour fill"),

  # ---- the chart area: its look, its frame, the axis lines, its space
  .cf("theme_preset", "area", "panel", "select", "theme_preset", kw = "look style minimal classic"),
  .cf("background_color", "area", "panel", "color", kw = "colour page fill"),
  .cf("panel_color", "area", "panel", "color", kw = "colour plot area fill"),
  .cf("panel_border", "area", "panel", "boolean", kw = "frame box"),
  .cf("panel_border_color", "area", "panel", "color", kw = "colour frame"),
  .cf("axis_line", "area", "lines", "boolean"),
  .cf("axis_line_color", "area", "lines", "color", kw = "colour"),
  .cf("axis_ticks", "area", "lines", "boolean", kw = "tick marks"),
  .cf("plot_margin", "area", "spacing", "margin", min = 0, kw = "space padding"),

  # ---- all the text at once
  .cf("font_family", "text", "font", "select", "font", kw = "typeface family"),
  .cf("text_scale", "text", "font", "select", "text_scale", kw = "size bigger smaller scale"),
  .cf("line_height", "text", "font", "number", step = 0.1, min = 0.1, kw = "spacing leading"),
  .cf("text_color", "text", "font", "color", kw = "colour"),
  .cf("axis_title_size", "text", "axis_titles", "number"),
  .cf("axis_title_face", "text", "axis_titles", "select", "face", kw = "bold italic"),
  .cf("axis_title_color", "text", "axis_titles", "color", kw = "colour"),
  .cf("axis_text_size", "text", "tick_labels", "number"),
  .cf("axis_text_face", "text", "tick_labels", "select", "face", kw = "bold italic"),
  .cf("axis_text_color", "text", "tick_labels", "color", kw = "colour")
)

# the chart options the panel edits ("entries" is three of them)
CHART_PANEL_FIELDS <- c(
  setdiff(vapply(CHART_FIELDS, function(f) f$key, character(1)), "entries"),
  "legend_labels", "colors", "category_labels",
  # the elements' Show switches
  unlist(lapply(CHART_TABS, function(el) el$show), use.names = FALSE)
)

# choices of a select, from the values cd2030.core accepts
.chart_choices <- function(kind, i18n) {
  text <- function(key) cd_text(i18n, key)
  values <- switch(
    kind,
    face = c("plain", "bold", "italic", "bold.italic"),
    align = c("left", "center", "right"),
    position = c("panel", "plot"),
    legend_direction = c("horizontal", "vertical"),
    legend_justification = c("center", "top", "bottom", "left", "right"),
    grid = c("both", "horizontal", "vertical", "none"),
    linetype = c("solid", "dashed", "dotted", "dotdash", "longdash", "twodash"),
    format = c("number", "comma", "percent", "percent_points", "scientific", "compact"),
    theme_preset = c("grey", "minimal", "classic", "bw", "light", "linedraw", "dark", "void"),
    font = CHART_FONTS,
    legend_position = c("right", "bottom", "top", "hidden"),
    text_scale = c("0.85", "1", "1.25"),
    flip = c("swap", "keep")
  )
  lapply(values, function(v) {
    switch(
      kind,
      font = list(value = v, label = v),
      text_scale = list(value = as.numeric(v), label = c("0.85" = "S", "1" = "M", "1.25" = "L")[[v]]),
      legend_position = list(
        value = if (v == "hidden") "none" else v,
        label = text(switch(v, top = "lbl_style_c_top", hidden = "lbl_chart_hidden", right = "lbl_chart_right", bottom = "lbl_chart_bottom"))
      ),
      flip = list(value = identical(v, "swap"), label = text(paste0("lbl_chart_", v))),
      list(value = v, label = text(paste0("lbl_style_c_", v)))
    )
  })
}

# The tabs and fields, translated, as the component expects them
cd_chart_schema <- function(i18n = cd_i18n()) {
  tabs <- unname(lapply(names(CHART_TABS), function(key) {
    el <- CHART_TABS[[key]]
    tab <- list(key = key, label = cd_text(i18n, paste0("lbl_cc_t_", key)), icon = as.list(el$icon))
    # the option that shows or hides the element (the switch in its header)
    if (!is.null(el$show)) tab$show <- el$show
    tab
  }))
  fields <- lapply(CHART_FIELDS, function(f) {
    choices <- if (!is.null(f$choices)) .chart_choices(f$choices, i18n) else NULL
    # a short list reads better as buttons than as a menu
    type <- if (f$type == "select" && length(choices) <= 4 && !identical(f$choices, "font")) "seg" else f$type
    field <- list(
      key = f$key, tab = f$tab, group = cd_text(i18n, paste0("lbl_cc_g_", f$group)),
      label = cd_text(i18n, f$label %||% paste0("lbl_style_f_", f$key)), type = type
    )
    if (f$key == "entries") field$label <- field$group
    if (!is.null(choices)) field$choices <- choices
    if (!is.null(f$kw)) field$keywords <- f$kw
    for (n in intersect(names(f$extra), c("step", "min", "max"))) field[[n]] <- f$extra[[n]]
    field
  })
  list(tabs = tabs, fields = fields)
}

# Legend entries and the categories of a discrete axis, to relabel or recolour. Capped so a very large legend cannot make
# the panel unusable.
cd_chart_entries <- function(p, max_entries = 30) {
  if (!inherits(p, "ggplot")) return(list())
  built <- tryCatch(ggplot2::ggplot_build(p), error = function(e) NULL)
  if (is.null(built)) return(list())

  legend <- list()
  for (scale in built$plot$scales$scales) {
    if (!any(c("colour", "fill") %in% scale$aesthetics) || !isTRUE(scale$is_discrete())) next
    limits <- scale$get_limits()
    limits <- limits[!is.na(limits)]
    if (!length(limits) || length(limits) > max_entries) next
    shown <- as.character(scale$get_labels(limits))
    colours <- tryCatch(as.character(scale$map(limits)), error = function(e) rep(NA_character_, length(limits)))
    legend <- lapply(seq_along(limits), function(i) list(
      key = as.character(limits[[i]]), shown = shown[[i]],
      color = tryCatch(grDevices::rgb(t(grDevices::col2rgb(colours[[i]])), maxColorValue = 255), error = function(e) NULL)
    ))
    break
  }

  categories <- list()
  for (axis in c("x", "y")) {
    scale <- built$layout[[paste0("panel_scales_", axis)]][[1]]
    if (is.null(scale) || !isTRUE(scale$is_discrete())) next
    limits <- scale$get_limits()
    limits <- limits[!is.na(limits)]
    if (!length(limits) || length(limits) > max_entries) next
    shown <- as.character(scale$get_labels(limits))
    categories <- lapply(seq_along(limits), function(i) list(key = as.character(limits[[i]]), shown = shown[[i]]))
    break
  }
  list(legend = legend, categories = categories)
}
