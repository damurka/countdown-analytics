# What differs between apps in the Load Data wizard. Everything else in R/wizard is the same for every indicator
# group; an app describes only its own part, once, with
#
#   options(cd2030.wizard = list(
#     national_rates_groups = list(cd_wizard_field_group(...), ...),
#     reference_uploads     = c("un_estimates", "wuenic_estimates", "un_mortality_estimates")
#   ))
#
# (rmncah and vaxx do this at the top of modules/0_upload_data.R). The contract:
#
#   national_rates_groups  the National Rates step's cards of fields, in display order. Each element is
#                          cd_wizard_field_group(title_key, subtitle_key, <fields>) and each field is
#                          cd_wizard_survey_field() (a survey coverage estimate, in percent) or
#                          cd_wizard_rate_field() (a national rate, as a proportion). From these the wizard derives
#                          the inputs, what is pushed to and read back from the cache, and which values the step
#                          needs before "Continue" is enabled: every field listed here is required.
#   reference_uploads      which reference-data zones the Upload Data step shows; any of "un_estimates",
#                          "wuenic_estimates", "un_mortality_estimates". Defaults to all three.
#
# The indicator group itself (what merge_and_standardize() / init_CacheConnection() are told) is not part of this: it
# is always getOption("cd2030.selected_group"), which every app already sets.
cd_wizard_config <- function() {
  cfg <- getOption("cd2030.wizard")
  if (is.null(cfg) || is.null(cfg$national_rates_groups)) {
    stop("options(cd2030.wizard = list(national_rates_groups = ...)) must be set before the Load Data wizard is used.", call. = FALSE)
  }
  cfg$reference_uploads <- cfg$reference_uploads %||% c("un_estimates", "wuenic_estimates", "un_mortality_estimates")
  cfg
}

# The group THIS APP is for (options(cd2030.app_group), set at the top of app.R) -- not cd2030.core's session-wide
# selected group, which loading a dataset built for another group changes.
cd_wizard_indicator_group <- function() {
  group <- getOption("cd2030.app_group") %||% getOption("cd2030.selected_group")
  if (is.null(group)) stop("options(cd2030.app_group = ...) must be set before the Load Data wizard is used.", call. = FALSE)
  group
}

# The saved copy of a dataset: <stem>_<group>.rds (e.g. Benin_rmncah.rds, Benin_vaccine.rds). One source file can be
# loaded by more than one app; the group in the name keeps each app's finished copy apart, so vaxx never picks up
# rmncah's copy of the same file (or the reverse).
cd_saved_copy_name <- function(stem) paste0(stem, "_", cd_wizard_indicator_group(), ".rds")

# Put cd2030.core back on this app's group, and refuse a loaded dataset that was built for a different one.
cd_wizard_check_group <- function(cache) {
  app_group <- cd_wizard_indicator_group()
  built_for <- if (!is.null(cache)) attr(cache$countdown_data, "indicator_group") else NULL
  set_selected_group(app_group)
  if (!is.null(built_for) && !identical(built_for, app_group)) {
    stop(sprintf("This dataset was built for the '%s' indicator group, but this app is for '%s'.", built_for, app_group), call. = FALSE)
  }
  invisible(TRUE)
}

# A survey coverage estimate: `id` is the input id, `key` the name inside cache()$survey_estimates, `label_key` a
# translation key.
cd_wizard_survey_field <- function(id, key, label_key) {
  list(kind = "survey", id = id, key = key, label_key = label_key, min = 0, max = 100, step = 1, hint = "hint_upload_percent")
}

# A national rate: `key` is the name inside cache()$national_estimates (nmr, pnmr, sbr, twin_rate, preg_loss).
cd_wizard_rate_field <- function(id, key, label_key) {
  list(kind = "rate", id = id, key = key, label_key = label_key, min = 0, max = 0.05, step = 0.001, hint = "hint_upload_proportion")
}

# `...`: single fields, and/or lists of fields (e.g. cd_wizard_national_rate_fields()), which are spliced in.
cd_wizard_field_group <- function(title_key, subtitle_key, ...) {
  fields <- list()
  for (item in list(...)) {
    fields <- if (!is.null(item$kind)) c(fields, list(item)) else c(fields, item)
  }
  list(title_key = title_key, subtitle_key = subtitle_key, fields = fields)
}

# The five national rates every group needs, shared so the two apps cannot drift on ids/keys/labels.
cd_wizard_national_rate_fields <- function() {
  list(
    cd_wizard_rate_field("pregnancy_loss", "preg_loss", "title_upload_preg_loss"),
    cd_wizard_rate_field("twin_rate", "twin_rate", "title_upload_twin_rate"),
    cd_wizard_rate_field("stillbirth_rate", "sbr", "title_upload_stillbirth"),
    cd_wizard_rate_field("neonatal_mortality_rate", "nmr", "title_upload_nmr"),
    cd_wizard_rate_field("post_neonatal_mortality_rate", "pnmr", "title_upload_pnmr")
  )
}

# Every field of one kind, across all groups, in display order.
wizard_fields <- function(kind) {
  fields <- unlist(lapply(cd_wizard_config()$national_rates_groups, function(g) g$fields), recursive = FALSE)
  Filter(function(f) identical(f$kind, kind), fields)
}
