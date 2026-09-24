# Per-app settings for the shared page modules (R/modules). Each app sets ONE list near the top of its app.R:
#
#   options(cd2030.config = list(target_indicators = c("vaccine", "dropout"), ...))
#
# and the shared modules read what they need with cd_cfg("target_indicators"). The list is where an app -- rmncah, vaccine
# or a custom indicator group -- says what is particular to it, so nothing in the shared modules is keyed to a group name.
# A value may be a vector or a function returning one (evaluated when read, after the group is known).
#
# Keys used by the shared modules (see each module's use of cd_cfg() for its default):
#   nat_cov_indicators      tabs of national/sub-national coverage (may include "fpet", which adds the family planning chart)
#   target_indicators       tabs of the coverage-target pages
#   equity_indicators       tabs of Equity Assessment; equity_custom_exclude: indicators its Custom picker leaves out
#   cov_trend_indicators, sub_derived_indicators, survey_comp_indicators   tabs of the three Denominator Selection cards
#   adjustment_indicators   tabs of Data Adjustment Changes; k_factors: the adjustment factors, list(name = list(id, label))
#   reporting_rate_indicators, reporting_rate_facet_ncol   Reporting Rate's service chips and national plot layout
#   consistency_pairs       list of c(x, y) indicator pairs, one Consistency Checks tab each
#   has_maternal            does the group have a maternal denominator (Denominator Selection / header row)
cd_cfg <- function(key, default = NULL) {
  value <- getOption("cd2030.config")[[key]]
  if (is.null(value)) return(default)
  if (is.function(value)) value() else value
}
