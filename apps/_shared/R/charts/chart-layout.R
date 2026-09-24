# How one chart is laid out: which way round it is drawn and how tall it is, and the chart's own text (used as placeholders
# in the customize panel). Works on the ggplot a plot function returns, so it applies to every chart without the chart
# knowing. A plot that is not a ggplot (drawn with base graphics) gets defaults.

# Charts with more categories than this on the horizontal axis are turned so the categories run down the side, where
# their names stay readable, and the chart grows taller to give each one room.
MANY_CATEGORIES <- 12
ROW_HEIGHT_PX <- 26

# The number of categories on each axis of the plot as data (0 for a continuous axis)
cd_chart_axes <- function(p) {
  built <- ggplot2::ggplot_build(p)
  count <- function(scale) {
    if (!is.null(scale) && isTRUE(scale$is_discrete())) length(scale$get_limits()) else 0L
  }
  list(x = count(built$layout$panel_scales_x[[1]]), y = count(built$layout$panel_scales_y[[1]]))
}

# Orientation and height.
#   flip:           what the user chose (the `flip` chart option): TRUE / FALSE, or NULL for automatic
#   result$flip:    what to apply: TRUE / FALSE, or NULL to leave the chart as its plot function drew it
#   result$flipped: TRUE when the data's x ends up down the side once drawn
#   result$auto:    TRUE when `flip` was not chosen by the user
#   result$rows:    categories down the side once drawn (for the height)
cd_chart_layout <- function(p, flip = NULL) {
  default <- list(flip = NULL, flipped = FALSE, auto = is.null(flip), rows = 0L, height = 400)
  if (!inherits(p, "ggplot")) return(default)

  axes <- tryCatch(cd_chart_axes(p), error = function(e) NULL)
  if (is.null(axes)) return(default)

  already_flipped <- inherits(p$coordinates, "CoordFlip")
  plain <- inherits(p$facet, "FacetNull")
  auto <- is.null(flip)
  apply <- if (!auto) flip else if (!already_flipped && plain && axes$x > MANY_CATEGORIES) TRUE else NULL

  flipped <- if (is.null(apply)) already_flipped else apply
  rows <- if (flipped) axes$x else axes$y
  height <- if (rows > MANY_CATEGORIES) rows * ROW_HEIGHT_PX + 170 else 400
  list(flip = apply, flipped = flipped, auto = auto, rows = rows, height = height)
}

# The chart's own text, keyed like the chart options, used as placeholders: an empty field means "as drawn".
cd_chart_label_defaults <- function(p) {
  if (!inherits(p, "ggplot")) return(list())
  labs <- ggplot2::get_labs(p)
  text <- function(x) if (is.character(x) && length(x) == 1 && !is.na(x)) x else NULL
  legend_key <- intersect(c("fill", "colour", "color", "shape", "linetype", "size", "alpha"), names(labs))
  out <- list(
    title = text(labs$title), subtitle = text(labs$subtitle), caption = text(labs$caption), tag = text(labs$tag),
    x_title = text(labs$x), y_title = text(labs$y),
    legend_title = if (length(legend_key)) text(labs[[legend_key[[1]]]]) else NULL
  )
  Filter(Negate(is.null), out)
}
