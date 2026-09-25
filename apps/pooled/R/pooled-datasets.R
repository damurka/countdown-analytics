# The tables a pooled file can hold, and how each is pulled out of one country's dataset (a cd2030.core cache).
# Everything here is plain R: no Shiny, no UI. The names are what people see and what is stored in the pooled file.
#
# Two kinds of table:
#   standard  the ones Explore pooled data has a page for. If a country's file lacks one, that is a warning.
#   extra     everything else the dataset can give (data quality, WUENIC, surveys, denominators, health systems...).
#             Not every country has every one of these, so a missing extra is quietly left out, never a warning.
# The raw facility-by-month data is not included: it is the bulk of a dataset's size and is not a comparison table.

# ---- shaping what comes out -----------------------------------------------------------------------------------------

# A plain tibble: no special classes, no list columns.
pooled_plain <- function(x) {
  if (is.null(x) || !is.data.frame(x)) return(NULL)
  x <- tibble::as_tibble(as.data.frame(x))
  x[, !vapply(x, is.list, logical(1)), drop = FALSE]
}

with_country <- function(x, cache, ...) {
  x |>
    dplyr::mutate(country = cache$country, iso3 = cache$country_iso) |>
    dplyr::relocate(country, iso3, ...)
}

# Area columns go straight after country and iso3, whichever a table has.
with_country_areas <- function(x, cache) {
  with_country(x, cache, dplyr::any_of(c("adminlevel_1", "district")))
}

# One field of the cache, as a table with the country on it. NULL when the country's file does not have it.
pooled_field <- function(field) {
  force(field)
  function(cache) {
    x <- pooled_plain(cache[[field]])
    if (is.null(x) || !nrow(x)) return(NULL)
    if ("iso3" %in% names(x)) x <- dplyr::select(x, -dplyr::any_of(c("country", "iso3")))
    with_country_areas(x, cache)
  }
}

# Coverage columns are named for the denominator each country chose (cov_penta3_dhis2 in one, cov_penta3_penta1 in
# another). Pooled, they are cov_penta3 for everyone, so countries line up.
coverage_columns <- function(cache, indicators) {
  stats::setNames(
    purrr::map_chr(indicators, function(ind) paste0("cov_", ind, "_", cache$get_denominator(ind))),
    paste0("cov_", indicators)
  )
}

# ---- the standard tables ----------------------------------------------------------------------------------------------

extract_parameters <- function(cache) {
  tibble::tibble(
    performance_threshold = cache$performance_threshold,
    anc_k_factor = cache$k_factors["anc"],
    idelv_k_factor = cache$k_factors["idelv"],
    vacc_k_factor = cache$k_factors["vacc"],
    nmr = cache$national_estimates$nmr,
    pnmr = cache$national_estimates$pnmr,
    twin_rate = cache$national_estimates$twin_rate,
    preg_loss = cache$national_estimates$preg_loss,
    sbr = cache$national_estimates$sbr,
    anc1 = cache$survey_estimates["anc1"],
    penta1 = cache$survey_estimates["penta1"],
    penta3 = cache$survey_estimates["penta3"],
    measles1 = cache$survey_estimates["measles1"],
    bcg = cache$survey_estimates["bcg"],
    survey_year = cache$survey_year,
    vaccine_denominator = cache$denominator,
    maternal_denominator = cache$maternal_denominator
  ) |>
    with_country(cache)
}

extract_overall_score <- function(cache) {
  cache$overall_score |> dplyr::select(-dplyr::any_of("no")) |> pooled_plain() |> with_country(cache)
}

extract_indicator_coverage_national <- function(cache) pooled_plain(cache$indicator_coverage_national) |> with_country(cache)
extract_indicator_coverage_admin1 <- function(cache) pooled_plain(cache$indicator_coverage_admin1) |> with_country(cache, adminlevel_1)
extract_indicator_coverage_district <- function(cache) pooled_plain(cache$indicator_coverage_district) |> with_country(cache, adminlevel_1, district)

extract_coverage <- function(cache, level, inds) {
  cols <- coverage_columns(cache, inds)
  cache$calculate_coverage(level) |>
    pooled_plain() |>
    dplyr::select(dplyr::any_of(c("adminlevel_1", "year")), dplyr::any_of(cols)) |>
    dplyr::rename(dplyr::any_of(stats::setNames(unname(cols), names(cols))))
}

COVERAGE_NATIONAL_INDICATORS <- c("anc_1trimester", "anc4", "ideliv", "csection", "hiv_test", "instlivebirths", "pnc48h", "penta1", "penta3",
                                  "measles1", "measles2", "bcg", "opv1", "opv2", "opv3", "syphilis_test", "ipt2", "ipt3")
COVERAGE_ADMIN1_INDICATORS <- setdiff(COVERAGE_NATIONAL_INDICATORS, c("opv1", "opv2", "opv3"))

extract_coverage_national <- function(cache) extract_coverage(cache, "national", COVERAGE_NATIONAL_INDICATORS) |> with_country(cache)
extract_coverage_admin1 <- function(cache) extract_coverage(cache, "adminlevel_1", COVERAGE_ADMIN1_INDICATORS) |> with_country(cache, adminlevel_1)

extract_national_mortality <- function(cache) {
  cache$mortality_summary |> pooled_plain() |> dplyr::filter(adminlevel_1 == "National") |> dplyr::select(-adminlevel_1) |> with_country(cache)
}
extract_admin1_mortality <- function(cache) {
  cache$mortality_summary |> pooled_plain() |> dplyr::filter(adminlevel_1 != "National") |> with_country(cache, adminlevel_1)
}
extract_national_service_utilization <- function(cache) pooled_plain(cache$service_utilization_national) |> with_country(cache)
extract_admin1_service_utilization <- function(cache) pooled_plain(cache$service_utilization_admin1) |> with_country(cache, adminlevel_1)

# ---- the registry, in the order they are listed ---------------------------------------------------------------------------
pooled_registry <- function() {
  def <- function(name, group, extract, standard = FALSE, rmncah_only = FALSE) {
    list(name = name, group = group, extract = extract, standard = standard, rmncah_only = rmncah_only)
  }
  f <- pooled_field
  list(
    def("Parameters", "Parameters and score", extract_parameters, TRUE),
    def("Overall Score", "Parameters and score", extract_overall_score, TRUE),
    def("Indicator Coverage - National", "Indicator coverage", extract_indicator_coverage_national, TRUE),
    def("Indicator Coverage - Admin 1", "Indicator coverage", extract_indicator_coverage_admin1, TRUE),
    def("Indicator Coverage - District", "Indicator coverage", extract_indicator_coverage_district, TRUE),
    def("Coverage - National", "Coverage", extract_coverage_national, TRUE),
    def("Coverage - Admin 1", "Coverage", extract_coverage_admin1, TRUE),
    def("National Mortality", "Mortality", extract_national_mortality, TRUE, TRUE),
    def("Admin 1 Mortality", "Mortality", extract_admin1_mortality, TRUE, TRUE),
    def("Mortality Ratios", "Mortality", f("mortality_ratios"), FALSE, TRUE),
    def("National Service Utilization", "Service utilization", extract_national_service_utilization, TRUE, TRUE),
    def("Admin 1 Service Utilization", "Service utilization", extract_admin1_service_utilization, TRUE, TRUE),

    def("Reporting Rate - National", "Data quality", f("reporting_rate_national")),
    def("Reporting Rate - Admin 1", "Data quality", f("reporting_rate_admin1")),
    def("Reporting Rate - District", "Data quality", f("reporting_rate_district")),
    def("Completeness - National", "Data quality", f("completeness_national")),
    def("Completeness - Admin 1", "Data quality", f("completeness_admin1")),
    def("Completeness - District", "Data quality", f("completeness_district")),
    def("Outliers - National", "Data quality", f("outliers_national")),
    def("Outliers - Admin 1", "Data quality", f("outliers_admin1")),
    def("Outliers - District", "Data quality", f("outliers_district")),
    def("Ratios Summary", "Data quality", f("ratios_summary")),
    def("Adequacy Ratios", "Data quality", f("adequacy_ratios")),

    def("Denominator Metrics", "Denominators and population", f("denominator_metrics")),
    def("UN Population Estimates", "Denominators and population", f("un_estimates")),

    def("WUENIC Estimates", "Estimates and surveys", f("wuenic_estimates")),
    def("UN Mortality Estimates", "Estimates and surveys", f("un_mortality_estimates")),
    def("National Survey", "Estimates and surveys", f("national_survey")),
    def("Regional Survey", "Estimates and surveys", f("regional_survey")),
    def("FPET Data", "Estimates and surveys", f("fpet_data")),

    def("Inequality - District", "Equity", f("inequality_district")),
    def("Wealth Quintile Survey", "Equity", f("wiq_survey")),
    def("Area Survey", "Equity", f("area_survey")),
    def("Education Survey", "Equity", f("education_survey")),

    def("Health System Comparison", "Health systems", f("health_system_comparison")),
    def("Health System Metrics - National", "Health systems", f("health_system_metrics_national")),
    def("National Private Share", "Health systems", f("national_private_share")),
    def("Area Private Share", "Health systems", f("area_private_share"))
  )
}

# The tables for a domain. `include`: "everything" (default) or "standard" (only the ones with a page of their own).
pooled_defs <- function(domain = "rmncah", include = c("everything", "standard")) {
  include <- match.arg(include)
  defs <- pooled_registry()
  if (!identical(domain, "rmncah")) defs <- Filter(function(d) !d$rmncah_only, defs)
  if (identical(include, "standard")) defs <- Filter(function(d) d$standard, defs)
  stats::setNames(defs, vapply(defs, `[[`, "", "name"))
}

pooled_dataset_groups <- function(names_in_file) {
  defs <- pooled_registry()
  groups <- unique(vapply(defs, `[[`, "", "group"))
  lapply(stats::setNames(groups, groups), function(g) {
    in_group <- vapply(defs, function(d) identical(d$group, g) && d$name %in% names_in_file, logical(1))
    vapply(defs[in_group], `[[`, "", "name")
  }) |> Filter(f = length)
}

# The registry's order, for tables in a file (anything unknown goes last).
pooled_order <- function(names_in_file) {
  known <- vapply(pooled_registry(), `[[`, "", "name")
  c(intersect(known, names_in_file), setdiff(names_in_file, known))
}
