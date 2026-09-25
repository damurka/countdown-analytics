# Loading countries' files, combining them into one pooled file, and reading a pooled file back.
# Plain R, no Shiny: the app calls these and shows what they return.

POOLED_KIND <- "cd2030_pooled"
POOLED_VERSION <- 1L

# ---- one file -----------------------------------------------------------------------------------------------

# What a person should read when a file fails. `detail` keeps the technical message for the log.
pooled_error_reason <- function(msg) {
  unreadable <- grepl("unknown input format|cannot open|error reading|magic number|corrupt|truncated|ReadItem|not a valid|version .* written by", msg, ignore.case = TRUE)
  if (unreadable) {
    "Could not read the file. It may be damaged or saved by a newer version of R."
  } else {
    "Not a Countdown dataset. It has no country or adjusted data."
  }
}

# The date a country's file was made, from a name like Kenya_master_adj_dataset_20250918.rds; else its modified time.
pooled_file_date <- function(name, path = NULL) {
  m <- regmatches(name, regexpr("[0-9]{8}(?=[^0-9]*$)", name, perl = TRUE))
  d <- if (length(m)) suppressWarnings(as.Date(m, "%Y%m%d")) else as.Date(NA)
  if (is.na(d) && !is.null(path) && file.exists(path)) d <- as.Date(file.mtime(path))
  d
}

# Load ONE file and pull every table out of it now, so the (large) cache is not kept in memory.
# status: "ok", "warn" (loaded, with something to know) or "error". `loader` is injectable for tests.
pooled_load_file <- function(path, name, domain, loader = cd2030.core::init_CacheConnection, include = "everything") {
  res <- list(
    name = name, path = path, size = suppressWarnings(file.size(path)), country = NA_character_, iso3 = NA_character_,
    date = pooled_file_date(name, path), status = "error", message = NULL, detail = NULL, tables = list(), issues = character()
  )

  cache <- tryCatch(loader(path, indicator_group = domain), error = function(e) e)
  if (inherits(cache, "error")) {
    res$message <- pooled_error_reason(conditionMessage(cache))
    res$detail <- conditionMessage(cache)
    return(res)
  }

  tryCatch(cd2030.core::set_selected_group(domain), error = function(e) NULL) # loading sets the session group to the file's own

  country <- tryCatch(cache$country, error = function(e) NULL)
  if (is.null(country) || length(country) != 1 || is.na(country) || !nzchar(country)) {
    res$message <- "Not a Countdown dataset. It has no country or adjusted data."
    return(res)
  }
  res$country <- as.character(country)
  res$iso3 <- as.character(tryCatch(cache$country_iso, error = function(e) NA_character_) %||% NA_character_)

  defs <- pooled_defs(domain, include)
  tables <- list()
  res$missing <- character() # table -> why this file has none of it
  for (nm in names(defs)) {
    got <- tryCatch(pooled_plain(defs[[nm]]$extract(cache)), error = function(e) {
      msg <- conditionMessage(e)
      res$issues <<- c(res$issues, paste0(nm, ": ", msg))
      res$missing[[nm]] <<- paste0("error: ", substr(gsub("[[:space:]]+", " ", msg), 1, 90))
      NULL
    })
    if (is.data.frame(got) && nrow(got) > 0) {
      tables[[nm]] <- got
    } else if (is.na(res$missing[nm])) {
      res$missing[[nm]] <- "nothing in this file"
    }
  }
  res$tables <- tables
  res$adjusted <- !(is.null(cache$adjusted_data) && !isTRUE(cache$adjusted_flag))

  if (!length(tables)) {
    res$message <- "No tables could be built from this file."
    res$detail <- paste(res$issues, collapse = "
")
    return(res)
  }

  # A standard table that is missing is always worth a warning. Extras are compared across the files by pooled_finalize().
  standard <- names(Filter(function(d) d$standard, defs))
  res$lacking <- setdiff(standard, names(tables))
  notes <- character()
  if (!res$adjusted) notes <- c(notes, "Not adjusted yet, so its tables use unadjusted data.")
  if (length(res$lacking)) notes <- c(notes, paste0(length(res$lacking), " of ", length(standard), " standard tables could not be built (", paste(res$lacking, collapse = ", "), ")."))
  res$notes <- notes
  res$status <- if (length(notes)) "warn" else "ok"
  res$message <- if (length(notes)) paste(notes, collapse = " ") else NULL
  res
}

# ---- combining ----------------------------------------------------------------------------------------------

# If two files are for the same country, keep the newer one and leave the other out, saying why.
pooled_resolve_duplicates <- function(results) {
  usable <- which(vapply(results, function(r) r$status %in% c("ok", "warn"), logical(1)))
  key <- vapply(results[usable], function(r) r$iso3 %||% r$country, "")
  for (k in unique(key[duplicated(key)])) {
    idx <- usable[key == k]
    dates <- do.call(c, lapply(results[idx], function(r) r$date))
    dates[is.na(dates)] <- as.Date("1970-01-01")
    keep <- idx[which.max(dates)]
    for (i in setdiff(idx, keep)) {
      results[[i]]$status <- "error"
      results[[i]]$message <- paste0("Another file for ", results[[i]]$country, " is newer (", results[[keep]]$name, "), so this one is left out.")
    }
  }
  results
}

pooled_bind <- function(parts, log_fn) {
  tryCatch(dplyr::bind_rows(parts), error = function(e) {
    log_fn(paste0("Columns differ between countries; combined as text: ", conditionMessage(e)))
    dplyr::bind_rows(lapply(parts, function(p) dplyr::mutate(p, dplyr::across(dplyr::everything(), as.character))))
  })
}

pooled_combine <- function(results, domain, app_version = NA_character_, progress = function(i, n, what) NULL) {
  log <- character()
  add_log <- function(msg) log <<- c(log, paste0("[", format(Sys.time(), "%H:%M:%S"), "] ", msg))

  results <- pooled_resolve_duplicates(results)
  ok <- Filter(function(r) r$status %in% c("ok", "warn"), results)
  left_out <- Filter(function(r) !(r$status %in% c("ok", "warn")), results)
  if (!length(ok)) stop("There are no loaded files to combine.", call. = FALSE)

  add_log(paste("Combining", length(ok), "of", length(results), "files."))
  for (r in left_out) add_log(paste0("LEFT OUT ", r$name, ": ", r$message %||% "not loaded"))
  for (r in ok) if (r$status == "warn") add_log(paste0("WARNING ", r$country, ": ", r$message))

  present <- pooled_order(unique(unlist(lapply(ok, function(r) names(r$tables)))))
  datasets <- list()
  for (i in seq_along(present)) {
    nm <- present[[i]]
    progress(i, length(present), nm)
    parts <- purrr::compact(lapply(ok, function(r) r$tables[[nm]]))
    datasets[[nm]] <- pooled_bind(parts, add_log)
    add_log(paste0("OK ", nm, ": ", nrow(datasets[[nm]]), " rows from ", length(parts), if (length(parts) == 1) " country." else " countries."))
  }

  list(
    kind = POOLED_KIND, version = POOLED_VERSION, domain = domain, created = Sys.time(), app_version = app_version,
    countries = tibble::tibble(
      country = vapply(ok, `[[`, "", "country"), iso3 = vapply(ok, function(r) r$iso3 %||% NA_character_, ""),
      file = vapply(ok, `[[`, "", "name"), warning = vapply(ok, function(r) r$message %||% "", "")
    ),
    left_out = tibble::tibble(
      file = vapply(left_out, `[[`, "", "name"), reason = vapply(left_out, function(r) r$message %||% "Not loaded.", "")
    ),
    datasets = datasets,
    log = log
  )
}

pooled_file_name <- function(domain, date = Sys.Date()) paste0("pooled_", domain, "_", format(date), ".rds")

pooled_write <- function(pooled, path) {
  saveRDS(pooled, path)
  invisible(path)
}

# ---- reading a pooled file back ------------------------------------------------------------------------------

# Returns list(ok, pooled, message).
pooled_read <- function(path) {
  x <- tryCatch(readRDS(path), error = function(e) e)
  if (inherits(x, "error")) {
    return(list(ok = FALSE, message = "Could not read the file. It may be damaged or saved by a newer version of R."))
  }
  if (!is.list(x) || !identical(x$kind, POOLED_KIND) || !is.list(x$datasets) || !length(x$datasets) ||
      !all(vapply(x$datasets, is.data.frame, logical(1)))) {
    return(list(ok = FALSE, message = "This is not a pooled file. It was not made by Build pooled file. Choose a file made there, or build a new one."))
  }
  list(ok = TRUE, pooled = x, message = NULL)
}

# ---- looking at one table ------------------------------------------------------------------------------------

pooled_filter <- function(df, countries = NULL, years = NULL) {
  if (length(countries) && "country" %in% names(df)) df <- df[df$country %in% countries, , drop = FALSE]
  if (length(years) && "year" %in% names(df)) df <- df[as.character(df$year) %in% as.character(years), , drop = FALSE]
  df
}

pooled_measures <- function(df) {
  num <- names(df)[vapply(df, is.numeric, logical(1))]
  setdiff(num, c("year", "survey_year"))
}

# One row per column: type, share missing, range. What the Summary tab shows.
pooled_summary <- function(df) {
  purrr::imap_dfr(df, function(col, nm) {
    is_num <- is.numeric(col)
    tibble::tibble(
      Column = nm,
      Type = if (is_num) "number" else if (inherits(col, c("Date", "POSIXt"))) "date" else "text",
      `Missing (%)` = round(100 * mean(is.na(col)), 1),
      Lowest = if (is_num && any(!is.na(col))) format(signif(min(col, na.rm = TRUE), 4)) else "",
      Highest = if (is_num && any(!is.na(col))) format(signif(max(col, na.rm = TRUE), 4)) else ""
    )
  })
}


# ---- comparing the files with each other ------------------------------------------------------------------------------------
# Not every country has every extra table. That is fine, but it should never be silent: once the files are loaded, any file
# with fewer tables than the others is flagged, with which ones and why. Safe to call again (it starts from each file's own notes).
pooled_gap_note <- function(r, gap, n_all) {
  why <- r$missing[gap]
  why[is.na(why)] <- "nothing in this file"
  items <- paste0(gap, " (", why, ")")
  shown <- if (length(items) > 6) c(items[1:6], paste0("and ", length(items) - 6, " more")) else items
  paste0("Has ", length(r$tables), " of the ", n_all, " tables the loaded files have. Missing: ", paste(shown, collapse = ", "), ".")
}

pooled_finalize <- function(results) {
  usable <- which(vapply(results, function(r) r$status %in% c("ok", "warn"), logical(1)))
  if (!length(usable)) return(results)
  everything <- unique(unlist(lapply(results[usable], function(r) names(r$tables))))
  for (i in usable) {
    r <- results[[i]]
    notes <- r$notes %||% character()
    gap <- setdiff(everything, c(names(r$tables), r$lacking))
    if (length(gap)) notes <- c(notes, pooled_gap_note(r, gap, length(everything)))
    results[[i]]$gap <- gap
    results[[i]]$status <- if (length(notes)) "warn" else "ok"
    results[[i]]$message <- if (length(notes)) paste(notes, collapse = " ") else NULL
  }
  results
}
