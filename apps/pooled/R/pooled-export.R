# Turning pooled tables into files people download: one CSV, a zip of CSVs, or an Excel workbook.

safe_file_stem <- function(x) gsub("[^A-Za-z0-9._-]+", "_", x)

# What a choice of format and scope produces. `n` = how many datasets. Used for the dialog's summary and the file name.
pooled_export_plan <- function(format = c("csv", "xlsx", "rds"), scope = c("view", "selected", "all", "piece"), names, domain = "rmncah", date = Sys.Date()) {
  format <- match.arg(format)
  scope <- match.arg(scope)
  n <- length(names)
  stem <- paste0("pooled_", domain, "_", format(date))
  if (n == 0) return(list(ok = FALSE, n = 0, filename = NA_character_, label = "Nothing to export yet."))
  if (format == "rds") {
    return(list(ok = TRUE, n = n, kind = "rds", filename = paste0(stem, "_piece.rds"), label = "A smaller pooled file (.rds)"))
  }
  if (format == "csv" && n == 1) {
    return(list(ok = TRUE, n = 1, kind = "csv", filename = paste0(safe_file_stem(names), "_", format(date), ".csv"), label = "One CSV file"))
  }
  suffix <- switch(scope, view = "", selected = "_selected", all = "_all", piece = "_piece")
  if (format == "csv") {
    list(ok = TRUE, n = n, kind = "zip", filename = paste0(stem, suffix, ".zip"), label = paste("One zip with", n, "CSV files"))
  } else {
    list(ok = TRUE, n = n, kind = "xlsx", filename = paste0(stem, suffix, ".xlsx"),
         label = if (n == 1) "One Excel file with 1 sheet" else paste("One Excel file with", n, "sheets"))
  }
}

pooled_write_csv <- function(df, path) {
  readr::write_csv(df, path, na = "")
  invisible(path)
}

# `datasets`: a named list of data frames, already filtered.
pooled_write_zip <- function(datasets, path, date = Sys.Date()) {
  dir <- file.path(tempdir(), paste0("pooled_csv_", as.integer(runif(1, 1, 1e9))))
  dir.create(dir, recursive = TRUE)
  on.exit(unlink(dir, recursive = TRUE), add = TRUE)
  files <- vapply(names(datasets), function(nm) {
    f <- file.path(dir, paste0(safe_file_stem(nm), "_", format(date), ".csv"))
    pooled_write_csv(datasets[[nm]], f)
    f
  }, "")
  zip::zipr(path, unname(files), mode = "cherry-pick")
  invisible(path)
}

# Excel sheet names: at most 31 characters, none of \ / * ? : [ ], each different.
pooled_sheet_names <- function(names) {
  clean <- substr(gsub("[\\\\/*?:\\[\\]]", " ", names), 1, 31)
  make.unique(clean, sep = "_") |> substr(1, 31)
}

pooled_write_xlsx <- function(datasets, path, progress = function(i, n, what) NULL) {
  wb <- openxlsx::createWorkbook()
  header <- openxlsx::createStyle(textDecoration = "bold", border = "bottom")
  sheets <- pooled_sheet_names(names(datasets))
  for (i in seq_along(datasets)) {
    progress(i, length(datasets), names(datasets)[[i]])
    openxlsx::addWorksheet(wb, sheets[[i]])
    openxlsx::writeData(wb, sheets[[i]], datasets[[i]], headerStyle = header)
    openxlsx::freezePane(wb, sheets[[i]], firstRow = TRUE)
    openxlsx::setColWidths(wb, sheets[[i]], cols = seq_len(ncol(datasets[[i]])), widths = "auto")
  }
  openxlsx::saveWorkbook(wb, path, overwrite = TRUE)
  invisible(path)
}

# Writes what `plan` says to `path`.
pooled_export <- function(plan, datasets, path, progress = function(i, n, what) NULL) {
  switch(plan$kind,
    csv = pooled_write_csv(datasets[[1]], path),
    zip = pooled_write_zip(datasets, path),
    xlsx = pooled_write_xlsx(datasets, path, progress)
  )
  invisible(path)
}
