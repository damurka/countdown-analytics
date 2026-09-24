# What the chart customize panel (js/src/components/ChartCustomize.tsx) edits, as data: which tab and group each
# cd2030.core chart option is under, its control, and its choices. The panel draws whatever is listed here, so making
# another chart option editable is one line in CHART_FIELDS plus its translation key (lbl_style_f_<key>; the group and
# tab names are lbl_cc_g_<group> and lbl_cc_t_<tab>). See ?cd2030.core::cd_chart_options for the options themselves.

CHART_FONTS <- c("sans", "serif", "mono", "Arial", "Calibri", "Georgia", "Verdana", "Times New Roman", "Courier New")

# tab -> icon (up to three SVG paths, 24x24, stroked)
CHART_TABS <- list(
  text = c("M5 7V4h14v3", "M12 4v16", "M9 20h6"),
  axes = c("M4 4v16h16", "M8 14l3-4 3 3 4-6", ""),
  legend = c("M5 7h3", "M11 7h8", "M5 13h3M11 13h8M5 19h3M11 19h8"),
  grid = c("M4 4h16v16H4z", "M4 12h16", "M12 4v16"),
  marks = c("M4 18l5-6 4 3 7-9", "M4 21h16", ""),
  layout = c("M4 7h9M17 7h3", "M4 17h3M11 17h9", "M15 5v4M9 15v4")
)

# One field: .cf(key, tab, group, type, choices kind, step/min/max, label = translation key, kw = extra search words)
.cf <- function(key, tab, group, type, choices = NULL, ..., label = NULL, kw = NULL) {
  list(key = key, tab = tab, group = group, type = type, choices = choices, label = label, kw = kw, extra = list(...))
}

CHART_FIELDS <- list(
  # ---- text
  .cf("title", "text", "titles", "text", label = "lbl_chart_f_title", kw = "heading name"),
  .cf("subtitle", "text", "titles", "text", label = "lbl_chart_f_subtitle"),
  .cf("caption", "text", "titles", "text", label = "lbl_chart_f_caption", kw = "note footnote source"),
  .cf("tag", "text", "titles", "text", kw = "label panel letter"),
  .cf("title_wrap", "text", "titles", "number", min = 1, kw = "wrap break long lines"),
  .cf("title_position", "text", "titles", "select", "position", kw = "align"),
  .cf("caption_position", "text", "titles", "select", "position", kw = "align"),
  .cf("font_family", "text", "font", "select", "font", kw = "typeface family"),
  .cf("text_scale", "text", "font", "select", "text_scale", kw = "size bigger smaller scale"),
  .cf("line_height", "text", "font", "number", step = 0.1, min = 0.1, kw = "spacing leading"),
  .cf("text_color", "text", "font", "color", kw = "colour"),
  .cf("title_size", "text", "title_style", "number"),
  .cf("title_face", "text", "title_style", "select", "face", kw = "bold italic"),
  .cf("title_color", "text", "title_style", "color", kw = "colour"),
  .cf("title_align", "text", "title_style", "select", "align", kw = "left center right position"),
  .cf("subtitle_size", "text", "subtitle_style", "number"),
  .cf("subtitle_face", "text", "subtitle_style", "select", "face", kw = "bold italic"),
  .cf("subtitle_color", "text", "subtitle_style", "color", kw = "colour"),
  .cf("subtitle_align", "text", "subtitle_style", "select", "align", kw = "left center right position"),
  .cf("caption_size", "text", "caption_style", "number"),
  .cf("caption_face", "text", "caption_style", "select", "face", kw = "bold italic"),
  .cf("caption_color", "text", "caption_style", "color", kw = "colour"),
  .cf("caption_align", "text", "caption_style", "select", "align", kw = "left center right position"),

  # ---- axes
  .cf("x_title", "axes", "axis_titles", "text", label = "lbl_chart_f_x", kw = "horizontal"),
  .cf("y_title", "axes", "axis_titles", "text", label = "lbl_chart_f_y", kw = "vertical"),
  .cf("axis_title_size", "axes", "axis_titles", "number"),
  .cf("x_title_size", "axes", "axis_titles", "number"),
  .cf("y_title_size", "axes", "axis_titles", "number"),
  .cf("axis_title_face", "axes", "axis_titles", "select", "face", kw = "bold italic"),
  .cf("axis_title_color", "axes", "axis_titles", "color", kw = "colour"),
  .cf("axis_text_size", "axes", "tick_labels", "number"),
  .cf("x_text_size", "axes", "tick_labels", "number"),
  .cf("y_text_size", "axes", "tick_labels", "number"),
  .cf("axis_text_face", "axes", "tick_labels", "select", "face", kw = "bold italic"),
  .cf("axis_text_color", "axes", "tick_labels", "color", kw = "colour"),
  .cf("x_text_angle", "axes", "tick_labels", "number", step = 15, kw = "rotate tilt slant years"),
  .cf("y_text_angle", "axes", "tick_labels", "number", step = 15, kw = "rotate tilt slant"),
  .cf("x_labels", "axes", "tick_labels", "select", "format", kw = "numbers percent comma format"),
  .cf("y_labels", "axes", "tick_labels", "select", "format", kw = "numbers percent comma format"),
  .cf("category_label_wrap", "axes", "tick_labels", "number", min = 1, kw = "wrap names regions"),
  .cf("x_limits", "axes", "range", "limits", kw = "zoom minimum maximum"),
  .cf("y_limits", "axes", "range", "limits", kw = "zoom minimum maximum"),
  .cf("axis_line", "axes", "lines", "boolean"),
  .cf("axis_line_color", "axes", "lines", "color", kw = "colour"),
  .cf("axis_ticks", "axes", "lines", "boolean", kw = "tick marks"),

  # ---- legend
  .cf("legend_position", "legend", "legend_layout", "select", "legend_position", kw = "show hide top bottom right"),
  .cf("legend_direction", "legend", "legend_layout", "select", "legend_direction", kw = "horizontal vertical"),
  .cf("legend_justification", "legend", "legend_layout", "select", "legend_justification", kw = "align"),
  .cf("legend_ncol", "legend", "legend_layout", "number", min = 1, kw = "columns"),
  .cf("legend_nrow", "legend", "legend_layout", "number", min = 1, kw = "rows"),
  .cf("legend_reverse", "legend", "legend_layout", "boolean", kw = "order"),
  .cf("legend_key_size", "legend", "legend_layout", "number", min = 1, kw = "keys"),
  .cf("legend_background", "legend", "legend_layout", "color", kw = "colour fill"),
  .cf("legend_label_wrap", "legend", "legend_layout", "number", min = 1, kw = "wrap"),
  .cf("legend_title", "legend", "legend_text", "text", label = "lbl_chart_f_legend"),
  .cf("legend_title_size", "legend", "legend_text", "number"),
  .cf("legend_title_face", "legend", "legend_text", "select", "face", kw = "bold italic"),
  .cf("legend_title_color", "legend", "legend_text", "color", kw = "colour"),
  .cf("legend_text_size", "legend", "legend_text", "number"),
  .cf("legend_text_face", "legend", "legend_text", "select", "face", kw = "bold italic"),
  .cf("legend_text_color", "legend", "legend_text", "color", kw = "colour"),
  .cf("entries", "legend", "entries", "entries", kw = "rename recolour colour text categories names"),

  # ---- grid, panel and background
  .cf("grid", "grid", "grid_lines", "select", "grid", kw = "horizontal vertical lines"),
  .cf("grid_minor", "grid", "grid_lines", "boolean"),
  .cf("grid_color", "grid", "grid_lines", "color", kw = "colour"),
  .cf("grid_linewidth", "grid", "grid_lines", "number", step = 0.1, min = 0.1, kw = "thickness"),
  .cf("grid_linetype", "grid", "grid_lines", "select", "linetype", kw = "dashed dotted"),
  .cf("panel_color", "grid", "panel", "color", kw = "colour plot area fill"),
  .cf("panel_border", "grid", "panel", "boolean", kw = "frame box"),
  .cf("panel_border_color", "grid", "panel", "color", kw = "colour frame"),
  .cf("background_color", "grid", "panel", "color", kw = "colour page fill"),
  .cf("theme_preset", "grid", "panel", "select", "theme_preset", kw = "look style minimal classic"),
  .cf("strip_text_size", "grid", "facets", "number"),
  .cf("strip_text_face", "grid", "facets", "select", "face", kw = "bold italic"),
  .cf("strip_text_color", "grid", "facets", "color", kw = "colour"),
  .cf("strip_background", "grid", "facets", "color", kw = "colour fill"),

  # ---- marks
  .cf("line_scale", "marks", "lines_points", "number", step = 0.1, min = 0.1, kw = "width thickness"),
  .cf("point_scale", "marks", "lines_points", "number", step = 0.1, min = 0.1, kw = "size dots markers"),
  .cf("alpha", "marks", "lines_points", "number", step = 0.1, min = 0.1, max = 1, kw = "transparency opacity"),
  .cf("label_size", "marks", "data_labels", "number", kw = "values numbers"),
  .cf("label_angle", "marks", "data_labels", "number", step = 15, kw = "values numbers rotate"),
  .cf("label_color", "marks", "data_labels", "color", kw = "values numbers colour"),

  # ---- layout
  .cf("flip", "layout", "orientation", "select", "flip", kw = "swap axes horizontal vertical rotate"),
  .cf("plot_margin", "layout", "spacing", "margin", min = 0, kw = "space padding")
)

# the chart options the panel edits ("entries" is three of them)
CHART_PANEL_FIELDS <- c(
  setdiff(vapply(CHART_FIELDS, function(f) f$key, character(1)), "entries"),
  "legend_labels", "colors", "category_labels"
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
    list(key = key, label = cd_text(i18n, paste0("lbl_cc_t_", key)), icon = as.list(CHART_TABS[[key]]))
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
