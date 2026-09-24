# The standard sidebar sections every app with the analysis pages shares; an app adds its own groups after them (see
# rmncah's app.R). cd_nav_section()/cd_nav_item() are in shell.R. Each leaf's tabName matches a cd_screen().

cd_nav_start <- function() {
  cd_nav_section("lbl_nav_section_start",
    cd_nav_item("title_global_intro", tabName = "introduction", icon = "info-circle"),
    cd_nav_item("title_nav_load_data", tabName = "upload_data", icon = "upload")
  )
}

cd_nav_quality <- function() {
  cd_nav_section("lbl_nav_section_quality",
    cd_nav_item("title_nav_quality", icon = "check-circle", children = list(
      cd_nav_item("title_rr_main", tabName = "reporting_rate", icon = "chart-bar"),
      cd_nav_item("title_outlier_main", tabName = "outlier_detection", icon = "exclamation-triangle"),
      cd_nav_item("title_complete_main", tabName = "data_completeness", icon = "check-square"),
      # a balanced scale is what "internally consistent" looks like
      cd_nav_item("title_consist_main", tabName = "internal_consistency", icon = "scale-balanced"),
      cd_nav_item("title_score_main", tabName = "overall_score", icon = "star")
    )),
    cd_nav_item("btn_adjust_remove_years", tabName = "remove_years", icon = "trash"),
    # Sliders for the group, a pencil for applying an adjustment, a clock for the log of past ones -- they used to be
    # the same icon. (pen-to-square has an outline weight in Font Awesome Free, unlike toggle-on.)
    cd_nav_item("title_adjust_main", icon = "sliders", children = list(
      cd_nav_item("title_adjust_main", tabName = "data_adjustment", icon = "pen-to-square"),
      cd_nav_item("title_adjust_changes", tabName = "data_adjustment_changes", icon = "clock-rotate-left")
    ))
  )
}

# requires_adjustment = TRUE on every item from here down: unadjusted data can't drive the denominator and analysis pages,
# so they stay locked (greyed out) until Data Adjustment has actually been run.
cd_nav_denominators <- function() {
  cd_nav_section("lbl_nav_section_denominators",
    cd_nav_item("title_denom_pop_trend", tabName = "denominator_assessment", icon = "chart-line", requires_adjustment = TRUE),
    cd_nav_item("title_denom_selection", tabName = "denominator_selection", icon = "filter", requires_adjustment = TRUE)
  )
}

# `extra`: more cd_nav_item()s for this group (rmncah adds Continuum of Care), shown after the coverage target.
cd_nav_national <- function(extra = list()) {
  cd_nav_item("title_nav_national_analysis", icon = "flag", requires_adjustment = TRUE, children = c(
    list(
      # chart-area, not chart-line: chart-line is Population Trend's icon
      cd_nav_item("title_coverage_national", tabName = "national_coverage", icon = "chart-area"),
      cd_nav_item("title_nav_global_coverage", tabName = "national_target", icon = "bullseye")
    ),
    extra,
    list(
      cd_nav_item("title_inequ_national", icon = "scale-unbalanced", children = list(
        cd_nav_item("title_routine_data", tabName = "national_inequality", icon = "clipboard-list"),
        cd_nav_item("title_survey_data", tabName = "equity_assessment", icon = "users")
      ))
    )
  ))
}

cd_nav_subnational <- function() {
  cd_nav_item("title_nav_subnational_analysis", icon = "map", requires_adjustment = TRUE, children = list(
    cd_nav_item("title_nav_subnational_coverage", tabName = "subnational_coverage", icon = "map-marked"),
    # scale-unbalanced-flip: the mirror image of National Inequality's scale-unbalanced
    cd_nav_item("title_inequ_subnational", tabName = "subnational_inequality", icon = "scale-unbalanced-flip"),
    cd_nav_item("title_nav_global_coverage", tabName = "subnational_target", icon = "bullseye")
  ))
}
