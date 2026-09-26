# Generates the Countdown AI's guides from the installed cd2030.core and the methodology docs corpus:
#   ai/cache-guide.json   every CacheConnection member: kind, arguments, read/write, group, the question it answers,
#                         precomputed or not, related report kinds, docs pages, defaults from the app's filters
#   ai/report-kinds.json  every report kind (rmncah and vaccine): options, related members, docs pages
#
# What code can't say (group, question, returns, related kinds, docs) is drafted and marked `status: "draft"`. An
# entry someone has reviewed (`status: "reviewed"`) keeps those fields on regeneration; the fields that come from the
# code (kind, arguments, read/write, precomputed, chartable) are always refreshed.
#
#   Rscript scripts/generate-ai-guide.R [--corpus <corpus.json or URL>] [--check]
#
# --check writes nothing and exits 1 when the guides don't match the installed cd2030.core (CI).

suppressPackageStartupMessages({
  library(cd2030.core)
  library(jsonlite)
})
`%||%` <- function(a, b) if (is.null(a)) b else a

args <- commandArgs(trailingOnly = TRUE)
check <- "--check" %in% args
corpus_arg <- if ("--corpus" %in% args) args[[which(args == "--corpus") + 1]] else NA_character_
root <- normalizePath(file.path(dirname(sub("^--file=", "", grep("^--file=", commandArgs(), value = TRUE)[1])), ".."), winslash = "/")
guide_file <- file.path(root, "ai", "cache-guide.json")
kinds_file <- file.path(root, "ai", "report-kinds.json")

# ------------------------------------------------------------------------------------------------ inputs

corpus_path <- if (!is.na(corpus_arg)) corpus_arg else {
  candidates <- c(file.path(root, "..", "datasuite-docs", "out", "ai", "corpus.json"), file.path(root, "ai", "corpus.json"))
  candidates[file.exists(candidates)][1]
}
corpus <- if (!is.na(corpus_path)) fromJSON(corpus_path, simplifyVector = FALSE) else list(pages = list())
en_pages <- Filter(function(p) identical(p$lang, "en"), corpus$pages)

docs_for <- function(field, value) {
  hits <- Filter(function(p) value %in% unlist(p$frontmatter[[field]]), en_pages)
  unique(vapply(hits, function(p) p$url, ""))
}

manifest <- cache_manifest()
chartable <- cd_chartable_members()

old_guide <- if (file.exists(guide_file)) fromJSON(guide_file, simplifyVector = FALSE) else list(members = list())
old_kinds <- if (file.exists(kinds_file)) fromJSON(kinds_file, simplifyVector = FALSE) else list(kinds = list())

# ------------------------------------------------------------------------------------------------ drafting

group_of <- function(name) {
  rules <- list(
    "data quality" = "reporting|completeness|outlier|ratio|adequacy|overall_score|dqa|consistency|quality",
    "denominators" = "denominator|derivation|k_factor|population|un_estimates",
    "adjustment" = "adjust|excluded_years",
    "coverage" = "coverage|derived|threshold|high_performers|decompose",
    "equity" = "inequality|equity|wiq|area_survey|education",
    "mortality" = "mortality|mmr|sbr|nmr",
    "service utilization" = "utilization|service|opd|ipd|curative",
    "health system" = "health_system|ratios_and_adequacy",
    "private sector" = "sector|private|csection",
    "mapping" = "map|shapefile|mapping",
    "surveys and estimates" = "survey|estimates|wuenic|fpet",
    "bayesian model" = "bayes",
    "reports" = "report|graph|chart_options",
    "dataset" = ".*"
  )
  for (group in names(rules)) if (grepl(rules[[group]], name)) return(group)
  "dataset"
}

question_of <- function(member) {
  text <- trimws(gsub("\\s+", " ", sub("^Active Binding:\\s*", "", member$description %||% "")))
  if (!nzchar(text)) text <- paste0("What ", gsub("_", " ", member$name), " holds.")
  text
}

filter_args <- c("admin_level", "region", "indicator", "denominator")

members <- list()
for (m in manifest$members) {
  name <- m$name
  args_list <- lapply(m$args, function(a) a[intersect(names(a), c("name", "required", "default", "choices", "description"))])
  access <- if (isTRUE(m$writes)) "write" else "read"
  auto <- list(
    kind = m$kind,
    access = access,
    precomputed = identical(m$kind, "binding"),
    chartable = name %in% chartable,
    args = args_list
  )
  arg_names <- vapply(m$args, function(a) a$name, "")
  defaults <- as.list(setNames(intersect(filter_args, arg_names), intersect(filter_args, arg_names)))
  drafted <- list(
    group = group_of(name),
    question = question_of(m),
    returns = m$returns %||% "",
    reportKinds = list(),
    docs = as.list(docs_for("cacheMembers", name)),
    defaults = defaults,
    status = "draft"
  )
  old <- old_guide$members[[name]]
  kept <- if (!is.null(old) && identical(old$status, "reviewed")) old[intersect(names(old), names(drafted))] else drafted
  if (access == "write") next_entry <- c(auto, list(group = kept$group %||% drafted$group, question = kept$question %||% drafted$question, status = kept$status %||% "draft"))
  else next_entry <- c(auto, modifyList(drafted, kept))
  members[[name]] <- next_entry
}

# report kinds, both app groups
kinds <- list()
for (group in c("rmncah", "vaccine")) {
  set_selected_group(group)
  block_kinds <- cd2030.core::report_block_kinds(group = group)
  for (id in names(block_kinds)) {
    k <- block_kinds[[id]]
    if (!is.null(kinds[[id]])) {
      kinds[[id]]$groups <- unique(c(unlist(kinds[[id]]$groups), group))
      next
    }
    docs_pages <- Filter(function(p) id %in% unlist(p$frontmatter$reportKinds), en_pages)
    related <- sort(unique(intersect(unlist(lapply(docs_pages, function(p) p$frontmatter$cacheMembers)), names(members))))
    drafted <- list(shows = k$label %||% id, members = as.list(related), docs = as.list(unique(vapply(docs_pages, function(p) p$url, ""))), status = "draft")
    old <- old_kinds$kinds[[id]]
    kept <- if (!is.null(old) && identical(old$status, "reviewed")) old[intersect(names(old), names(drafted))] else drafted
    kinds[[id]] <- c(list(label = k$label %||% id, type = k$type %||% "chart", group = k$group %||% "", groups = list(group),
                          indicators = k$indicators, levels = k$levels, variants = k$variants,
                          year = isTRUE(k$year), regional = isTRUE(k$regional)),
                     modifyList(drafted, kept))
  }
}

# members <- report kinds (from the docs pages that name both)
for (id in names(kinds)) for (member in unlist(kinds[[id]]$members)) {
  if (!is.null(members[[member]]) && identical(members[[member]]$status, "draft")) {
    members[[member]]$reportKinds <- as.list(unique(c(unlist(members[[member]]$reportKinds), id)))
  }
}

guide <- list(package = "cd2030.core", version = manifest$version, generatedAt = manifest$generatedAt,
              note = "Generated by scripts/generate-ai-guide.R. Review an entry by editing it and setting status to reviewed.",
              members = members[order(names(members))])
report_kinds <- list(version = manifest$version, generatedAt = manifest$generatedAt, kinds = kinds[order(names(kinds))])

# ------------------------------------------------------------------------------------------------ write or check

signature <- function(g) {
  vapply(names(g$members), function(n) {
    m <- g$members[[n]]
    paste(n, m$kind, m$access, isTRUE(m$precomputed), isTRUE(m$chartable),
          paste(vapply(m$args, function(a) paste(a$name, isTRUE(a$required), paste(unlist(a$choices), collapse = "|")), ""), collapse = ";"))
  }, "")
}

if (check) {
  problems <- character()
  if (!file.exists(guide_file)) problems <- c(problems, "ai/cache-guide.json is missing")
  else {
    current <- fromJSON(guide_file, simplifyVector = FALSE)
    a <- signature(current)
    b <- signature(guide)
    missing <- setdiff(names(b), names(a))
    removed <- setdiff(names(a), names(b))
    changed <- intersect(names(a), names(b))
    changed <- changed[a[changed] != b[changed]]
    if (length(missing)) problems <- c(problems, paste("new in cd2030.core:", paste(missing, collapse = ", ")))
    if (length(removed)) problems <- c(problems, paste("no longer in cd2030.core:", paste(removed, collapse = ", ")))
    if (length(changed)) problems <- c(problems, paste("changed:", paste(changed, collapse = ", ")))
  }
  if (!file.exists(kinds_file)) problems <- c(problems, "ai/report-kinds.json is missing")
  else {
    current_kinds <- fromJSON(kinds_file, simplifyVector = FALSE)
    if (!setequal(names(current_kinds$kinds), names(kinds))) {
      problems <- c(problems, paste("report kinds differ:", paste(c(setdiff(names(kinds), names(current_kinds$kinds)), setdiff(names(current_kinds$kinds), names(kinds))), collapse = ", ")))
    }
  }
  if (length(problems)) {
    cat("The AI guides don't match cd2030.core ", manifest$version, ":\n- ", paste(problems, collapse = "\n- "),
        "\nRun: Rscript scripts/generate-ai-guide.R\n", sep = "")
    quit(save = "no", status = 1)
  }
  cat("The AI guides match cd2030.core ", manifest$version, " (", length(guide$members), " members, ", length(kinds), " report kinds).\n", sep = "")
  quit(save = "no", status = 0)
}

dir.create(dirname(guide_file), showWarnings = FALSE, recursive = TRUE)
write_json(guide, guide_file, auto_unbox = TRUE, pretty = TRUE, null = "null", na = "null")
write_json(report_kinds, kinds_file, auto_unbox = TRUE, pretty = TRUE, null = "null", na = "null")
drafts <- sum(vapply(guide$members, function(m) identical(m$status, "draft"), NA))
cat("Wrote ai/cache-guide.json (", length(guide$members), " members, ", drafts, " drafts) and ai/report-kinds.json (",
    length(kinds), " kinds) from cd2030.core ", manifest$version, "; docs from ", corpus_path %||% "(none)", ".\n", sep = "")
