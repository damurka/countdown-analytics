# Checks the deterministic part of the Countdown AI evaluation (ai/eval/questions.yaml) on cd2030.core's sample
# dataset: each member named exists in the guide, is read-only, takes the arguments given, and gives the expected
# value; each docs URL exists in the corpus; each tool is one the extension (or DataSuite) provides.
#
#   Rscript scripts/run-eval.R

suppressPackageStartupMessages({
  library(cd2030.core)
  library(jsonlite)
  library(yaml)
})
`%||%` <- function(a, b) if (is.null(a)) b else a

root <- normalizePath(file.path(dirname(sub("^--file=", "", grep("^--file=", commandArgs(), value = TRUE)[1])), ".."), winslash = "/")
questions <- yaml::read_yaml(file.path(root, "ai", "eval", "questions.yaml"))$questions
guide <- fromJSON(file.path(root, "ai", "cache-guide.json"), simplifyVector = FALSE)
corpus <- fromJSON(file.path(root, "ai", "corpus.json"), simplifyVector = FALSE)
package <- fromJSON(file.path(root, "package.json"), simplifyVector = FALSE)
tools <- c(vapply(package$contributes$languageModelTools, function(t) t$name, ""), "shinyApp")
urls <- vapply(corpus$pages, function(p) sub("/+$", "", p$url), "")
# every page and section link: "<page>" and "<page>#<anchor>"
urls <- c(urls, unlist(lapply(corpus$pages, function(p) {
  vapply(p$sections, function(s) paste0(sub("/+$", "", p$url), "/#", s$anchor), "")
})))

cache <- init_CacheConnection(countdown_data = suppressMessages(load_data(system.file("extdata", "kenya.xlsx", package = "cd2030.core"))))

value_of <- function(member, args) {
  generator <- get("CacheConnection", envir = asNamespace("cd2030.core"))
  if (member %in% names(generator$active)) cache[[member]] else do.call(cache[[member]], args)
}

failures <- character()
fail <- function(id, message) failures <<- c(failures, sprintf("%s: %s", id, message))
checked <- 0L

for (q in questions) {
  for (tool in unlist(q$tools)) if (!tool %in% tools) fail(q$id, sprintf("no tool %s", tool))
  if (!is.null(q$docs) && !sub("/+$", "", q$docs) %in% urls) fail(q$id, sprintf("docs page or section %s is not in the corpus", q$docs))
  if (is.null(q$member)) next
  m <- guide$members[[q$member]]
  if (is.null(m)) { fail(q$id, sprintf("no member %s in the guide", q$member)); next }
  if (!identical(m$access, "read")) { fail(q$id, sprintf("%s is not read-only", q$member)); next }
  arg_names <- vapply(m$args, function(a) a$name, "")
  given <- q$args %||% list()
  unknown <- setdiff(names(given), arg_names)
  if (length(unknown)) { fail(q$id, sprintf("%s has no argument %s", q$member, paste(unknown, collapse = ", "))); next }
  if (is.null(q$expect)) { checked <- checked + 1L; next }
  value <- tryCatch(value_of(q$member, given), error = function(e) structure(conditionMessage(e), class = "eval_error"))
  if (inherits(value, "eval_error")) { fail(q$id, sprintf("%s failed: %s", q$member, value)); next }
  e <- q$expect
  if (!is.null(e$rows)) {
    if (!is.data.frame(value) || nrow(value) != e$rows) fail(q$id, sprintf("expected %s rows, got %s", e$rows, if (is.data.frame(value)) nrow(value) else "no table"))
  } else if (!is.null(e$column)) {
    rows <- value
    for (col in names(e$where)) rows <- rows[as.character(rows[[col]]) == as.character(e$where[[col]]), , drop = FALSE]
    got <- if (nrow(rows) == 1) rows[[e$column]] else NA
    if (is.na(got) || abs(as.numeric(got) - as.numeric(e$value)) > (e$tolerance %||% 0)) fail(q$id, sprintf("expected %s = %s, got %s", e$column, e$value, got))
  } else if (!is.null(e$value)) {
    if (!identical(as.character(unlist(value)), as.character(unlist(e$value)))) fail(q$id, sprintf("expected %s, got %s", paste(unlist(e$value), collapse = ","), paste(unlist(value), collapse = ",")))
  }
  checked <- checked + 1L
}

cat(sprintf("Checked %d questions (%d with a member).\n", length(questions), checked))
if (length(failures)) {
  cat("Failures:\n- ", paste(failures, collapse = "\n- "), "\n", sep = "")
  quit(save = "no", status = 1)
}
cat("All checks passed.\n")
