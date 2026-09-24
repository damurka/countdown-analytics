# R side of the Countdown React components, rendered through shiny.react.
#
# Source: js/ (TypeScript, Babel + webpack, components in js/src/components). Build with `npm run build` from
# js/; the built bundle, www/cd-react/cd-react.js, is committed so running the app never needs Node.
# shiny.react's reactElement() attaches React itself, so the bundle only adds our components.
#
# Text: the app translates by scanning the page for elements marked class = "i18n" and data-key and swapping
# their text in the browser. React owns the text it renders, so a component receives every piece of its text
# in all languages ({en, fr, pt}, see cd_text()) and picks one itself. When the language changes the server
# sends one "cd-lang" message (see show_language() in app.R) and every component re-renders. Nothing has to be
# pushed to individual components.

# The app's translator, kept here because app.R's own objects live in the app's environment, which the
# functions sourced from ui/ cannot see. app.R calls cd_use_i18n() once, right after creating it.
.cd_state <- new.env(parent = emptyenv())

cd_use_i18n <- function(i18n) assign("i18n", i18n, envir = .cd_state)

cd_i18n <- function() get("i18n", envir = .cd_state)

# A translation key given either as the key or as the markup i18n$t() returns for it
cd_key <- function(x) {
  if (inherits(x, "shiny.tag")) htmltools::tagGetAttribute(x, "data-key") else x
}

# Plain-text translation. i18n$translate() returns markup while the page is being built, so look the
# text up directly. `lang` defaults to the translator's language.
cd_plain_text <- function(i18n, key, lang = NULL) {
  lang <- lang %||% i18n$get_translation_language()
  tr <- i18n$get_translations()
  if (!key %in% rownames(tr) || !lang %in% names(tr)) return(key)
  val <- tr[key, lang]
  if (is.na(val) || !nzchar(val)) key else val
}

# One translation key as text in every language: list(en = , fr = , pt = )
cd_text <- function(i18n, key) {
  langs <- setdiff(i18n$get_languages(), "key")
  stats::setNames(lapply(langs, function(l) cd_plain_text(i18n, key, l)), langs)
}

# choices: a named vector -- names are translation keys, values are option values
cd_options <- function(choices, i18n = cd_i18n()) {
  purrr::pmap(
    list(key = names(choices), value = unname(choices)),
    function(key, value) list(key = as.character(value), text = cd_text(i18n, key))
  )
}

# Options that are data, not translations: regions, years. `groups` (optional) gives each a heading.
cd_plain_options <- function(values, groups = NULL) {
  values <- as.character(values)
  purrr::map(seq_along(values), function(i) {
    o <- list(key = values[[i]], text = values[[i]])
    if (!is.null(groups)) o$group <- as.character(groups[[i]])
    o
  })
}

# Text every chip shares
cd_chip_texts <- function(i18n) {
  list(
    resetLabel = cd_text(i18n, "lbl_chip_reset"),
    searchLabel = cd_text(i18n, "lbl_chip_search"),
    emptyLabel = cd_text(i18n, "lbl_chip_no_match")
  )
}

# A label as text in every language for a React component: a translation KEY (or the i18n$t() tag for one) becomes
# cd_text(); an already-built list(en=, fr=, pt=) is passed through; anything else is plain text as given.
cd_label <- function(i18n, x) {
  if (is.null(x)) return(NULL)
  if (is.list(x) && !inherits(x, "shiny.tag")) return(x)
  key <- cd_key(x)
  if (is.character(key) && length(key) == 1 && key %in% rownames(i18n$get_translations())) cd_text(i18n, key) else as.character(x)
}

# `template_key`'s text in every language with {step} filled from `step_key`'s text in that language -- for a label
# built from two translations (the wizard footer's "Continue to {step}").
cd_label_glue <- function(i18n, template_key, ...) {
  parts <- list(...)
  langs <- setdiff(i18n$get_languages(), "key")
  stats::setNames(lapply(langs, function(l) {
    vals <- lapply(parts, function(k) cd_plain_text(i18n, k, l))
    as.character(stringr::str_glue_data(vals, cd_plain_text(i18n, template_key, l)))
  }), langs)
}

# ---- translation files ---------------------------------------------------------------------------------------
# Translations are layered: _shared/translation/shared.json holds every key the apps have in common, and each app's
# own translation/translation.json holds only what is specific to it (and may override a shared key). An app --
# including one on a custom indicator group -- adds its own keys there, or passes more layers in `extra`.
# cd_translations() merges the layers (later layers win) into one file for shiny.i18n's init_i18n(), which wants a
# single path:  i18n <- init_i18n(translation_json_path = cd_translations("translation/translation.json"))
cd_read_translation_file <- function(path) {
  lines <- readLines(path, warn = FALSE, encoding = "UTF-8")
  lines <- lines[!startsWith(trimws(lines), "//")]   # the app files may carry // comment lines
  jsonlite::fromJSON(paste(lines, collapse = "\n"), simplifyVector = FALSE)
}

cd_translations <- function(app_file, extra = character()) {
  ui_dir <- getOption("cd2030.ui_dir", "../_shared")
  files <- c(file.path(ui_dir, "translation", "shared.json"), app_file, extra)
  layers <- lapply(files[file.exists(files)], cd_read_translation_file)
  merged <- list()
  for (layer in layers) for (entry in layer$translation) merged[[entry$key]] <- entry
  out <- tempfile(fileext = ".json")
  jsonlite::write_json(
    list(languages = layers[[1]]$languages, translation = unname(merged)),
    out, auto_unbox = TRUE, pretty = TRUE
  )
  out
}
