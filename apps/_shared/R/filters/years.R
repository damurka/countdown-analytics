# Choosing several years: a multi-choice chip whose options are the years in the data and whose value is kept in
# step with a setting in the cache. Choosing nothing means "all years" and reaches the server as "".
#
#   UI:      cd_chip_multi(ns("years"), "title_global_select_years", i18n = i18n)
#   server:  cd_years_sync(input, session, "years", years = <reactive of available years>,
#                            selected = <reactive of the years chosen in the cache>)
#            and the module's own observeEvent(input$years, ...) writes the choice to the cache.

# cache -> chip. Pushes the options and the chosen years once the chip has mounted, and again when either changes.
# It depends only on the cache side and the mount, never on input$years: a choice reaches the cache through the
# module's own writer, and an observer that also reacted to the input could run first and push the old value
# back over the user's choice.
cd_years_sync <- function(input, session, id = "years", years, selected) {
  stopifnot(is.reactive(years), is.reactive(selected))
  mounted <- cd_mounted(input, id)

  observeEvent(list(years(), selected(), mounted()), {
    req(mounted(), years())
    chosen <- selected()
    cd_update_input(
      id, session,
      options = cd_plain_options(years()),
      value = if (length(chosen) && !all(is.na(chosen))) as.character(chosen) else ""
    )
  })
}

# The years a years chip currently means, as integers. An empty chip ("") means "all years" (see cd_chip_multi()); the
# cache's *_mapping_years fields must not be given NA for that -- filter_mapping_data() keeps only rows whose year is
# in the field, so NA plots nothing. `all_years`: what "all" is (the dataset's years).
cd_years_input <- function(value, all_years) {
  years <- suppressWarnings(as.integer(value[nzchar(value)]))
  years <- years[!is.na(years)]
  if (length(years)) years else as.integer(all_years)
}
