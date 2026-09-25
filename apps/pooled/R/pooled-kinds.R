# The kinds of dataset Explore pooled data has a page for. Plain R: no Shiny, no UI.
#
# A kind groups the pooled tables that belong together (e.g. Coverage: National and Admin 1) and says which graphs
# its page shows. `datasets` is named by variant key (national / admin1 / district / score...); the names are what
# the page's tabs switch between. A kind whose tables are not in the file (vaccine data has no mortality) has no page
# content, only a note.

POOLED_VARIANT_LABELS <- c(national = "National", admin1 = "Admin 1", district = "District", single = "")

POOLED_KINDS <- list(
  params = list(
    tab = "explore_params", title = "Parameters", nav = "Parameters", icon = "gear",
    sub = "The settings and survey values each country brings, side by side.",
    datasets = c(single = "Parameters"), graphs = c("dots", "col_a", "col_b"), measures = FALSE
  ),
  score = list(
    tab = "explore_score", title = "Overall score", nav = "Overall score", icon = "gauge-high",
    sub = "How good each country's data is, and what pulls the score up or down.",
    datasets = c(single = "Overall Score"), graphs = c("score_rank", "score_heat"), measures = FALSE
  ),
  indicators = list(
    tab = "explore_indicators", title = "Indicator coverage", nav = "Indicator coverage", icon = "city",
    sub = "Coverage of each indicator from routine data, nationally, by region and by district.",
    datasets = c(national = "Indicator Coverage - National", admin1 = "Indicator Coverage - Admin 1", district = "Indicator Coverage - District"),
    graphs = c("trend", "rank", "spread"), measures = TRUE, prefer = "penta3"
  ),
  coverage = list(
    tab = "explore_coverage", title = "Coverage", nav = "Coverage", icon = "chart-line",
    sub = "Coverage from routine data, with the denominators chosen in each country.",
    datasets = c(national = "Coverage - National", admin1 = "Coverage - Admin 1"),
    graphs = c("trend", "rank", "change"), measures = TRUE, prefer = "penta3"
  ),
  mortality = list(
    tab = "explore_mortality", title = "Mortality", nav = "Mortality", icon = "heart-pulse",
    sub = "Maternal and newborn deaths recorded in facilities, by country and over time.",
    datasets = c(national = "National Mortality", admin1 = "Admin 1 Mortality"),
    graphs = c("trend", "rank", "change"), measures = TRUE, prefer = "mmr"
  ),
  service = list(
    tab = "explore_service", title = "Service utilization", nav = "Service utilization", icon = "users",
    sub = "How often children under 5 use outpatient and inpatient care.",
    datasets = c(national = "National Service Utilization", admin1 = "Admin 1 Service Utilization"),
    graphs = c("trend", "rank", "change"), measures = TRUE, prefer = "opd"
  )
)

# The tables of this kind that are in the file, still named by variant.
pooled_kind_datasets <- function(kind, datasets) {
  kind$datasets[kind$datasets %in% names(datasets)]
}

# The measure to show first: one that looks like what the page is about, else the first number.
pooled_default_measure <- function(df, prefer = NULL) {
  m <- pooled_measures(df)
  if (!length(m)) return(NULL)
  if (!is.null(prefer)) {
    hit <- m[grepl(prefer, m, ignore.case = TRUE)]
    if (length(hit)) return(hit[[1]])
  }
  m[[1]]
}

# ---- what is in a page's summary strip ---------------------------------------------------------------------------------
pooled_strip <- function(df) {
  yrs <- if ("year" %in% names(df) && any(!is.na(df$year))) paste(range(df$year, na.rm = TRUE), collapse = "–") else "–"
  list(
    Rows = format(nrow(df), big.mark = ","),
    Countries = as.character(dplyr::n_distinct(df$country)),
    Years = yrs,
    Columns = as.character(ncol(df))
  )
}

# ---- extracting a piece of the pooled file -------------------------------------------------------------------------------
# `columns`: NULL (every column) or a named list, dataset name -> columns to keep. Country, year and area columns are
# always kept so the piece still means something. Returns a pooled file (same shape), so it can be saved and opened.
pooled_extract <- function(pooled, datasets, countries = NULL, years = NULL, columns = NULL) {
  keep_always <- c("country", "iso3", "year", "adminlevel_1", "district")
  datasets <- intersect(datasets, names(pooled$datasets))
  out <- lapply(stats::setNames(datasets, datasets), function(nm) {
    df <- pooled_filter(pooled$datasets[[nm]], countries, years)
    cols <- columns[[nm]]
    if (!is.null(cols)) df <- df[, union(intersect(keep_always, names(df)), intersect(cols, names(df))), drop = FALSE]
    df
  })
  keep_countries <- if (length(countries)) intersect(pooled$countries$country, countries) else pooled$countries$country
  piece <- pooled
  piece$datasets <- out
  piece$countries <- pooled$countries[pooled$countries$country %in% keep_countries, , drop = FALSE]
  piece$left_out <- pooled$left_out[0, , drop = FALSE]
  piece$created <- Sys.time()
  piece$log <- c(
    pooled$log,
    paste0("[", format(Sys.time(), "%H:%M:%S"), "] Extracted a piece: ", length(out), " datasets, ", length(keep_countries), " countries",
           if (length(years)) paste0(", years ", min(as.integer(years)), "-", max(as.integer(years))) else "", ".")
  )
  piece
}

pooled_piece_rows <- function(piece) sum(vapply(piece$datasets, nrow, integer(1)))
