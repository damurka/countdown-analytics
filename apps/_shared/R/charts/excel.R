# Excel export helpers for the chart and table download buttons.
#
# cd_add_sheet(): one worksheet, named `name`, holding `x`. With a `title` the title goes in row 1 and the data starts at
# row 3 (the layout the exports have always had); without one the data starts at row 1. A spatial `geometry` column is
# left out (map data), since it cannot be written to a cell.
cd_add_sheet <- function(wb, name, x, title = NULL) {
  if (is.data.frame(x)) x <- dplyr::select(x, -dplyr::any_of("geometry"))
  openxlsx::addWorksheet(wb, name)
  first_row <- 1
  if (!is.null(title)) {
    openxlsx::writeData(wb, sheet = name, x = title, startCol = 1, startRow = 1)
    first_row <- 3
  }
  openxlsx::writeData(wb, sheet = name, x = x, startCol = 1, startRow = first_row)
}

# The writer for the common case -- the data on one sheet -- for cd_plot_server()/cd_table_server()'s `excel_sheet` and
# `excel_title` arguments (translation keys). Anything more (several sheets, data other than the chart's) is an
# `excel_write_fun` that calls cd_add_sheet() once per sheet.
cd_sheet_writer <- function(i18n, sheet, title = NULL) {
  function(wb, d) cd_add_sheet(wb, i18n$t(sheet), d, title = if (!is.null(title)) i18n$t(title))
}
