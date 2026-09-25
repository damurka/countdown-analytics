# Charts that compare the countries in a pooled table. ggplot only; the app puts them in cards.

POOLED_COLOURS <- c("#1f8a5f", "#2f6db5", "#b57f0c", "#9b5758", "#6b5bb5", "#3d444b", "#0e7c86", "#c2571a", "#7a8a1f", "#a13a76")

# One colour per country, in the order they are in the file, so a country keeps its colour in every chart.
pooled_palette <- function(countries) {
  stats::setNames(rep_len(POOLED_COLOURS, length(countries)), countries)
}

pooled_measure_label <- function(x) gsub("_", " ", x)

pooled_theme <- function() {
  ggplot2::theme_minimal(base_size = 13) +
    ggplot2::theme(
      panel.grid.minor = ggplot2::element_blank(), panel.grid.major.x = ggplot2::element_blank(),
      legend.position = "none", plot.margin = ggplot2::margin(8, 8, 8, 8),
      plot.title = ggplot2::element_text(face = "bold"), plot.caption = ggplot2::element_text(colour = "#5c6670")
    )
}

# Tables by area (admin 1 or district) have many rows per country and year: charts show the median across areas.
pooled_is_by_area <- function(df) any(c("adminlevel_1", "district") %in% names(df))

pooled_per_country_year <- function(df, measure) {
  df |>
    dplyr::filter(!is.na(.data[[measure]])) |>
    dplyr::group_by(country, year) |>
    dplyr::summarise(value = stats::median(.data[[measure]], na.rm = TRUE), .groups = "drop")
}

pooled_can_trend <- function(df, measure) {
  "year" %in% names(df) && "country" %in% names(df) && measure %in% names(df) &&
    dplyr::n_distinct(df$year[!is.na(df[[measure]])]) > 1
}

# Where to put each end-of-line label so close values do not print on top of each other: sorted, at least `gap` apart.
pooled_spread_labels <- function(y, gap) {
  if (!length(y) || !is.finite(gap) || gap <= 0) return(y)
  o <- order(y)
  out <- y[o]
  for (i in seq_along(out)[-1]) out[[i]] <- max(out[[i]], out[[i - 1]] + gap)
  out <- out - (mean(out) - mean(y[o]))
  out[order(o)]
}

pooled_plot_trend <- function(df, measure, palette) {
  d <- pooled_per_country_year(df, measure)
  validate_rows(d)
  last <- d |> dplyr::group_by(country) |> dplyr::slice_max(year, n = 1, with_ties = FALSE) |> dplyr::ungroup()
  last$label_y <- pooled_spread_labels(last$value, diff(range(d$value, na.rm = TRUE)) * 0.055)
  ggplot2::ggplot(d, ggplot2::aes(year, value, colour = country, group = country)) +
    ggplot2::geom_line(linewidth = 1) +
    ggplot2::geom_point(size = 1.8) +
    ggplot2::geom_text(data = last, ggplot2::aes(y = label_y, label = country), hjust = -0.15, size = 3.8, fontface = "bold", show.legend = FALSE) +
    ggplot2::scale_colour_manual(values = palette) +
    ggplot2::scale_x_continuous(breaks = scales::breaks_pretty(), expand = ggplot2::expansion(mult = c(0.02, 0.22))) +
    ggplot2::labs(x = NULL, y = pooled_measure_label(measure), caption = if (pooled_is_by_area(df)) "Median across areas" else NULL) +
    ggplot2::coord_cartesian(clip = "off") +
    pooled_theme()
}

# The latest year each country has (or every country's only value), highest first.
pooled_plot_rank <- function(df, measure, palette) {
  if ("year" %in% names(df)) {
    d <- pooled_per_country_year(df, measure) |>
      dplyr::group_by(country) |> dplyr::slice_max(year, n = 1, with_ties = FALSE) |> dplyr::ungroup()
    sub <- paste("Latest year for each country")
  } else {
    d <- df |>
      dplyr::filter(!is.na(.data[[measure]])) |>
      dplyr::group_by(country) |> dplyr::summarise(value = mean(.data[[measure]], na.rm = TRUE), .groups = "drop")
    sub <- NULL
  }
  validate_rows(d)
  d$country <- factor(d$country, levels = d$country[order(d$value)])
  ggplot2::ggplot(d, ggplot2::aes(value, country, fill = country)) +
    ggplot2::geom_col(width = 0.65) +
    ggplot2::geom_text(ggplot2::aes(label = format(round(value, 2), big.mark = ",")), hjust = -0.15, size = 3.8) +
    ggplot2::scale_fill_manual(values = palette) +
    ggplot2::scale_x_continuous(expand = ggplot2::expansion(mult = c(0, 0.15))) +
    ggplot2::labs(x = pooled_measure_label(measure), y = NULL, subtitle = sub) +
    pooled_theme() + ggplot2::theme(panel.grid.major.y = ggplot2::element_blank(), panel.grid.major.x = ggplot2::element_line(colour = "#eceef0"))
}

validate_rows <- function(d) {
  shiny::validate(shiny::need(nrow(d) > 0, "There is nothing to draw for this selection."))
}

# ---- graphs for the pages that are not a time series ---------------------------------------------------------------

# Survey values as one dot per country on a shared scale (Parameters).
pooled_plot_dots <- function(df, palette, cols = c("anc1", "penta1", "penta3", "measles1", "bcg")) {
  cols <- intersect(cols, names(df))
  validate_rows(data.frame(x = cols))
  long <- tidyr::pivot_longer(df[, c("country", cols)], dplyr::all_of(cols), names_to = "value_name", values_to = "value")
  long$value_name <- factor(long$value_name, levels = rev(cols))
  ggplot2::ggplot(long, ggplot2::aes(value, value_name, colour = country)) +
    ggplot2::stat_summary(ggplot2::aes(group = value_name), fun.min = min, fun.max = max, geom = "linerange", colour = "#c7ced4", linewidth = 1.2, na.rm = TRUE) +
    ggplot2::geom_point(size = 3.6, na.rm = TRUE) +
    ggplot2::scale_colour_manual(values = palette, name = NULL) +
    ggplot2::labs(x = "Survey coverage (%)", y = NULL) +
    pooled_theme() + ggplot2::theme(legend.position = "top", panel.grid.major.y = ggplot2::element_blank(), panel.grid.major.x = ggplot2::element_line(colour = "#eceef0"))
}

# One number per country as bars, e.g. neonatal mortality or the survey year (Parameters).
pooled_plot_col <- function(df, col, palette, label = NULL) {
  validate_rows(if (col %in% names(df)) df else df[0, ])
  d <- df[!is.na(df[[col]]), c("country", col)]
  names(d) <- c("country", "value")
  validate_rows(d)
  d$country <- factor(d$country, levels = d$country[order(d$value)])
  ggplot2::ggplot(d, ggplot2::aes(value, country, fill = country)) +
    ggplot2::geom_col(width = 0.65) +
    ggplot2::geom_text(ggplot2::aes(label = format(round(value, 3), big.mark = "", scientific = FALSE)), hjust = -0.15, size = 3.8) +
    ggplot2::scale_fill_manual(values = palette) +
    ggplot2::scale_x_continuous(expand = ggplot2::expansion(mult = c(0, 0.18))) +
    ggplot2::labs(x = label %||% pooled_measure_label(col), y = NULL) +
    pooled_theme() + ggplot2::theme(panel.grid.major.y = ggplot2::element_blank(), panel.grid.major.x = ggplot2::element_line(colour = "#eceef0"))
}

# Overall score: one score per country, and what it is made of. The table may be long (one row per part) or wide.
pooled_score_parts <- function(df) {
  num <- names(df)[vapply(df, is.numeric, logical(1))]
  txt <- setdiff(names(df)[!vapply(df, is.numeric, logical(1))], c("country", "iso3"))
  if (length(txt) && length(num)) {
    list(long = dplyr::transmute(df, country, part = as.character(.data[[txt[[1]]]]), value = .data[[num[[1]]]]))
  } else {
    list(long = tidyr::pivot_longer(df[, c("country", num)], dplyr::all_of(num), names_to = "part", values_to = "value"))
  }
}
pooled_plot_score_rank <- function(df, palette) {
  long <- pooled_score_parts(df)$long
  d <- long |> dplyr::group_by(country) |> dplyr::summarise(value = mean(value, na.rm = TRUE), .groups = "drop")
  validate_rows(d)
  d$country <- factor(d$country, levels = d$country[order(d$value)])
  ggplot2::ggplot(d, ggplot2::aes(value, country, fill = country)) +
    ggplot2::geom_col(width = 0.65) +
    ggplot2::geom_text(ggplot2::aes(label = round(value)), hjust = -0.2, size = 3.8) +
    ggplot2::scale_fill_manual(values = palette) +
    ggplot2::scale_x_continuous(expand = ggplot2::expansion(mult = c(0, 0.15))) +
    ggplot2::labs(x = "Average score", y = NULL, subtitle = "Average of the parts, highest at the top") +
    pooled_theme() + ggplot2::theme(panel.grid.major.y = ggplot2::element_blank(), panel.grid.major.x = ggplot2::element_line(colour = "#eceef0"))
}
pooled_plot_heat <- function(df) {
  long <- pooled_score_parts(df)$long
  validate_rows(long)
  ggplot2::ggplot(long, ggplot2::aes(part, country, fill = value)) +
    ggplot2::geom_tile(colour = "#ffffff", linewidth = 1.2) +
    ggplot2::geom_text(ggplot2::aes(label = round(value)), size = 3.8, colour = "#1f2328") +
    ggplot2::scale_fill_gradient(low = "#ffffff", high = "#5fbe96", na.value = "#f2f4f5", guide = "none") +
    ggplot2::labs(x = NULL, y = NULL, caption = "Darker is higher. Every cell shows its number.") +
    ggplot2::theme_minimal(base_size = 13) + ggplot2::theme(panel.grid = ggplot2::element_blank(), axis.text.x = ggplot2::element_text(angle = 25, hjust = 1))
}

# The lowest, median and highest area in the latest year, for each country (District / Admin 1 tables).
pooled_plot_spread <- function(df, measure, palette) {
  validate_rows(if (all(c("year", measure) %in% names(df))) df else df[0, ])
  d <- df |>
    dplyr::filter(!is.na(.data[[measure]])) |>
    dplyr::group_by(country) |> dplyr::filter(year == max(year)) |>
    dplyr::summarise(lo = min(.data[[measure]]), mid = stats::median(.data[[measure]]), hi = max(.data[[measure]]), yr = max(year), .groups = "drop")
  validate_rows(d)
  d$country <- factor(d$country, levels = d$country[order(d$mid)])
  ggplot2::ggplot(d, ggplot2::aes(y = country, colour = country)) +
    ggplot2::geom_linerange(ggplot2::aes(xmin = lo, xmax = hi), linewidth = 3, alpha = 0.35, lineend = "round") +
    ggplot2::geom_point(ggplot2::aes(x = mid), size = 3.6) +
    ggplot2::scale_colour_manual(values = palette) +
    ggplot2::labs(x = pooled_measure_label(measure), y = NULL, subtitle = "Lowest, median and highest area in each country's latest year") +
    pooled_theme() + ggplot2::theme(panel.grid.major.y = ggplot2::element_blank(), panel.grid.major.x = ggplot2::element_line(colour = "#eceef0"))
}

# First year, latest year and the change, per country.
pooled_change_table <- function(df, measure) {
  if (!all(c("country", "year", measure) %in% names(df))) return(NULL)
  d <- pooled_per_country_year(df, measure)
  if (!nrow(d)) return(NULL)
  d |>
    dplyr::group_by(country) |> dplyr::arrange(year, .by_group = TRUE) |>
    dplyr::summarise(First_year = dplyr::first(year), First = dplyr::first(value), Latest_year = dplyr::last(year), Latest = dplyr::last(value), .groups = "drop") |>
    dplyr::mutate(Change = Latest - First) |> dplyr::arrange(dplyr::desc(abs(Change)))
}
