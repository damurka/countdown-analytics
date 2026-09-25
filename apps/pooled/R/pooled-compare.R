# Comparing the countries in a pooled file across indicators, sources and years. Plain R plus ggplot: the page
# (pooled-compare-page.R) only decides which of these to draw.
#
# Coverage columns are cov_<indicator> in every country (see coverage_columns()), so countries line up.

POOLED_COVERAGE_LABELS <- c(
  cov_anc_1trimester = "ANC 1st trimester", cov_anc4 = "ANC4+", cov_ideliv = "Institutional delivery",
  cov_instlivebirths = "Institutional live births", cov_pnc48h = "PNC within 48h", cov_penta3 = "DTP3 / Penta3", cov_measles1 = "MCV1 / Measles 1"
)
POOLED_TARGET_COLUMNS <- c("cov_penta3", "cov_measles1")

# The comparison indicators this table has (with some data), in the order above.
pooled_cov_indicators <- function(cov) {
  if (is.null(cov)) return(character())
  have <- intersect(names(POOLED_COVERAGE_LABELS), names(cov))
  have[vapply(have, function(c) any(!is.na(cov[[c]])), logical(1))]
}

pooled_label_for <- function(col) unname(POOLED_COVERAGE_LABELS[col] %|na|% pooled_measure_label(col))
`%|na|%` <- function(x, y) ifelse(is.na(x), y, x)

# The year a "latest" view is about: the latest of the years chosen, else the latest there is. With `cols`, only years that
# have a value in at least one of them (survey-only years have none).
pooled_view_year <- function(df, years = NULL, cols = NULL) {
  has_data <- !is.na(df$year)
  if (length(cols)) has_data <- has_data & Reduce(`|`, lapply(cols, function(c) !is.na(df[[c]])))
  yrs <- sort(unique(as.integer(df$year[has_data])))
  if (length(years)) yrs <- intersect(yrs, as.integer(years))
  if (length(yrs)) max(yrs) else NA_integer_
}

# ---- continuum of care: countries by indicators, latest year -------------------------------------------------------------
pooled_care_data <- function(cov, indicators, year) {
  cov |>
    dplyr::filter(year == !!year) |>
    dplyr::select(country, dplyr::all_of(indicators)) |>
    tidyr::pivot_longer(dplyr::all_of(indicators), names_to = "indicator", values_to = "value") |>
    dplyr::mutate(indicator = factor(pooled_label_for(indicator), levels = pooled_label_for(indicators)))
}

pooled_plot_care <- function(cov, indicators, year) {
  d <- pooled_care_data(cov, indicators, year)
  validate_rows(d)
  d$country <- factor(d$country, levels = names(sort(tapply(d$value, d$country, mean, na.rm = TRUE), na.last = FALSE)))
  ggplot2::ggplot(d, ggplot2::aes(indicator, country, fill = value)) +
    ggplot2::geom_tile(colour = "#ffffff", linewidth = 1) +
    ggplot2::geom_text(ggplot2::aes(label = ifelse(is.na(value), "", round(value)), colour = value > 58), size = 3.6, fontface = "bold", show.legend = FALSE) +
    ggplot2::scale_colour_manual(values = c(`TRUE` = "#ffffff", `FALSE` = "#1f2328")) +
    ggplot2::scale_fill_gradient(low = "#f7fbf9", high = "#0e5a3d", limits = c(0, 100), na.value = "#f2f4f5", name = "Coverage (%)",
                                 guide = ggplot2::guide_colourbar(title.position = "top", title.hjust = 0.5, barheight = ggplot2::unit(9, "lines"))) +
    ggplot2::scale_x_discrete(position = "top") +
    ggplot2::labs(x = NULL, y = NULL, caption = paste0("Facility coverage in ", year, ". Darker is higher; every cell shows its number.")) +
    ggplot2::theme_minimal(base_size = 13) +
    ggplot2::theme(panel.grid = ggplot2::element_blank(), axis.text.x = ggplot2::element_text(face = "bold"), plot.caption = ggplot2::element_text(colour = "#5c6670"))
}

# ---- source triangulation: facility, survey and WUENIC side by side -------------------------------------------------------
# One indicator: cov_col (Coverage - National), param_col (Parameters, the survey value), wuenic_col (WUENIC Estimates).
pooled_triangulation_data <- function(datasets, cov_col, param_col, wuenic_col, years = NULL) {
  latest <- function(df, col) {
    if (is.null(df) || !all(c("country", "year", col) %in% names(df))) return(NULL)
    d <- df[!is.na(df[[col]]), c("country", "year", col)]
    if (length(years)) d <- d[d$year <= max(as.integer(years)), , drop = FALSE]
    d |> dplyr::group_by(country) |> dplyr::filter(year == max(year)) |> dplyr::ungroup() |>
      dplyr::transmute(country, value = .data[[col]])
  }
  parts <- list(
    Facility = latest(datasets[["Coverage - National"]], cov_col),
    Survey = if (!is.null(datasets[["Parameters"]]) && param_col %in% names(datasets[["Parameters"]])) {
      datasets[["Parameters"]] |> dplyr::transmute(country, value = .data[[param_col]])
    },
    WUENIC = latest(datasets[["WUENIC Estimates"]], wuenic_col)
  )
  parts <- Filter(function(p) !is.null(p) && nrow(p) > 0, parts)
  if (!length(parts)) return(NULL)
  dplyr::bind_rows(parts, .id = "source") |> dplyr::filter(!is.na(value))
}

POOLED_SOURCE_COLOURS <- c(Facility = "#1f8a5f", Survey = "#2f6db5", WUENIC = "#b57f0c")
POOLED_SOURCE_SHAPES <- c(Facility = 16, Survey = 15, WUENIC = 17)

pooled_plot_triangulation <- function(d, title) {
  validate_rows(if (is.null(d)) data.frame() else d)
  order_by <- d |> dplyr::filter(source == "Facility") |> dplyr::arrange(value)
  lv <- unique(c(setdiff(unique(d$country), order_by$country), order_by$country))
  d$country <- factor(d$country, levels = lv)
  span <- d |> dplyr::group_by(country) |> dplyr::summarise(lo = min(value), hi = max(value), .groups = "drop")
  ggplot2::ggplot(d, ggplot2::aes(value, country)) +
    ggplot2::geom_vline(xintercept = 90, linetype = "dotted", colour = "#5c6670", linewidth = 0.7) +
    ggplot2::geom_segment(data = span, ggplot2::aes(x = lo, xend = hi, y = country, yend = country), colour = "#c7ced4", linewidth = 1) +
    ggplot2::geom_point(ggplot2::aes(colour = source, shape = source), size = 3.2) +
    ggplot2::scale_colour_manual(values = POOLED_SOURCE_COLOURS, name = NULL) +
    ggplot2::scale_shape_manual(values = POOLED_SOURCE_SHAPES, name = NULL) +
    ggplot2::scale_x_continuous(limits = c(0, 105), breaks = seq(0, 100, 20)) +
    ggplot2::labs(x = "Coverage (%)", y = NULL, title = title, caption = "Dotted line: 90% target") +
    ggplot2::theme_minimal(base_size = 12) +
    ggplot2::theme(legend.position = "top", panel.grid.minor = ggplot2::element_blank(), panel.grid.major.y = ggplot2::element_line(colour = "#eceef0"),
                   plot.title = ggplot2::element_text(face = "bold"), plot.caption = ggplot2::element_text(colour = "#5c6670"))
}

# ---- level and change ---------------------------------------------------------------------------------------------------
# For each country: coverage in the end year, and how far it moved since the start year of the period.
pooled_quadrant_data <- function(cov, col, years = NULL) {
  d <- cov[!is.na(cov[[col]]), c("country", "year", col)]
  names(d) <- c("country", "year", "value")
  yrs <- sort(unique(d$year))
  if (length(years) >= 2) yrs <- yrs[yrs >= min(as.integer(years)) & yrs <= max(as.integer(years))] else yrs <- utils::tail(yrs, 5)
  if (length(yrs) < 2) return(NULL)
  d <- d[d$year %in% c(min(yrs), max(yrs)), , drop = FALSE]
  wide <- tidyr::pivot_wider(d, names_from = year, values_from = value, names_prefix = "y")
  a <- paste0("y", min(yrs)); b <- paste0("y", max(yrs))
  if (!all(c(a, b) %in% names(wide))) return(NULL)
  out <- tibble::tibble(country = wide$country, level = wide[[b]], change = wide[[b]] - wide[[a]]) |> dplyr::filter(!is.na(level), !is.na(change))
  attr(out, "period") <- c(min(yrs), max(yrs))
  out
}

pooled_plot_quadrant <- function(d, title) {
  validate_rows(if (is.null(d)) data.frame() else d)
  per <- attr(d, "period")
  med <- stats::median(d$level)
  far <- d |> dplyr::mutate(dist = abs(change - stats::median(change)) / (stats::mad(change) + 1) + abs(level - med) / (stats::mad(level) + 1)) |> dplyr::slice_max(dist, n = min(5, nrow(d)))
  ggplot2::ggplot(d, ggplot2::aes(level, change)) +
    ggplot2::geom_hline(yintercept = 0, colour = "#5c6670") +
    ggplot2::geom_vline(xintercept = med, linetype = "dashed", colour = "#5c6670") +
    ggplot2::geom_point(colour = "#1f8a5f", size = 3, alpha = 0.85) +
    ggplot2::geom_text(data = far, ggplot2::aes(label = country), hjust = -0.1, vjust = -0.6, size = 3.5, fontface = "bold", check_overlap = TRUE) +
    ggplot2::scale_x_continuous(limits = c(0, 110), breaks = seq(0, 100, 20)) +
    ggplot2::labs(x = paste0("Coverage ", per[2], " (%)"), y = paste0("Change ", per[1], " to ", per[2], " (points)"), title = title) +
    ggplot2::theme_minimal(base_size = 12) +
    ggplot2::theme(panel.grid.minor = ggplot2::element_blank(), plot.title = ggplot2::element_text(face = "bold"))
}

# ---- trends: median and the middle half of countries, by year -------------------------------------------------------------
pooled_band_data <- function(cov, indicators, years = NULL) {
  d <- cov
  if (length(years)) d <- d[d$year %in% as.integer(years), , drop = FALSE]
  d |>
    tidyr::pivot_longer(dplyr::all_of(indicators), names_to = "indicator", values_to = "value") |>
    dplyr::filter(!is.na(value)) |>
    dplyr::group_by(indicator, year) |>
    dplyr::summarise(q1 = stats::quantile(value, 0.25), med = stats::median(value), q3 = stats::quantile(value, 0.75), n = dplyr::n(), .groups = "drop") |>
    dplyr::mutate(indicator = factor(pooled_label_for(indicator), levels = pooled_label_for(indicators)))
}

pooled_plot_band <- function(cov, indicators, years = NULL) {
  d <- pooled_band_data(cov, indicators, years)
  validate_rows(d)
  target <- data.frame(indicator = factor(pooled_label_for(intersect(indicators, POOLED_TARGET_COLUMNS)), levels = levels(d$indicator)))
  ggplot2::ggplot(d, ggplot2::aes(year, med)) +
    ggplot2::geom_ribbon(ggplot2::aes(ymin = q1, ymax = q3), fill = "#1f8a5f", alpha = 0.16) +
    ggplot2::geom_hline(data = target, ggplot2::aes(yintercept = 90), linetype = "dotted", colour = "#5c6670") +
    ggplot2::geom_line(colour = "#1f8a5f", linewidth = 1) +
    ggplot2::geom_point(colour = "#1f8a5f", size = 2.4) +
    ggplot2::facet_wrap(~indicator, ncol = 2) +
    ggplot2::scale_x_continuous(breaks = scales::breaks_pretty()) +
    ggplot2::scale_y_continuous(limits = c(0, 100)) +
    ggplot2::labs(x = NULL, y = "Coverage (%)", caption = "Line: median of countries. Band: the middle half of countries. Dotted: 90% target.") +
    ggplot2::theme_minimal(base_size = 12) +
    ggplot2::theme(panel.grid.minor = ggplot2::element_blank(), strip.text = ggplot2::element_text(face = "bold", hjust = 0), plot.caption = ggplot2::element_text(colour = "#5c6670"))
}
