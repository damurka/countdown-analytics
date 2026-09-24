# The customize panel's values <-> cd2030.core chart options, and applying them to a plot. The panel reports
# list(chart = <fields>, dataset = <fields>) (see ChartCustomize.tsx); CacheConnection stores the chart's own options under
# the chart's id and the dataset-wide ones under "default" (cache$set_chart_options()).

# JSON from the panel -> cd_chart_options(); NULL when empty or invalid. Numbers arrive as numbers, an open end of a range as
# NULL, the entry maps (legend_labels, colors, category_labels) as named lists, flip as TRUE / FALSE.
cd_panel_to_options <- function(x) {
  if (is.null(x) || !length(x)) return(NULL)
  fields <- lapply(x[intersect(names(x), CHART_PANEL_FIELDS)], function(v) {
    if (is.list(v) && !is.null(names(v))) return(unlist(v))
    if (is.list(v)) return(vapply(v, function(z) if (is.null(z)) NA_real_ else as.numeric(z), numeric(1)))
    v
  })
  tryCatch(do.call(cd2030.core::cd_chart_options, fields), error = function(e) NULL)
}

# ... and back: stored options -> what the panel shows
cd_options_to_panel <- function(options) {
  if (is.null(options) || !length(options)) return(NULL)
  keep <- unclass(options)[intersect(names(options), CHART_PANEL_FIELDS)]
  if (!length(keep)) return(NULL)
  lapply(keep, function(v) {
    if (!is.null(names(v))) {
      as.list(v)
    } else if (length(v) > 1) {
      lapply(v, function(z) if (is.na(z)) NULL else z)
    } else {
      v
    }
  })
}

# Apply chart options to a plot. `layout` is cd_chart_layout(p, options$flip): which way round the chart is drawn is decided
# there (an automatic turn for a chart with many categories); everything else is cd2030.core's apply_chart_options().
cd_apply_chart_options <- function(p, options = NULL, layout = cd_chart_layout(p, options$flip)) {
  if (!inherits(p, "ggplot")) return(p)
  flip <- if (!is.null(layout$flip)) cd2030.core::cd_chart_options(flip = layout$flip)
  cd2030.core::apply_chart_options(p, cd2030.core::merge_chart_options(options, flip))
}
