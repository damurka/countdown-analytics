# The compiled bundle, as an htmltools dependency. Its head script gives the starting language.
#
# version was a hardcoded "0.2.0" for this entire session, never once bumped across any of the many rebuilds
# of www/cd-react/cd-react.js this session made (Sidebar's flyout nesting fix, FieldNumber's mount signal and
# blur-flush fix, FieldSelect, DownloadButtonStatus, ...). htmltools serves a dependency's files at a URL keyed
# by name+version, so an unchanging version means an unchanging URL -- and an unchanging URL is exactly what a
# browser's own HTTP cache keys on, regardless of how many times the R process itself gets restarted (a server
# restart does nothing to a browser's already-cached copy of a file it thinks it already has at that URL). This
# is the same class of bug styles.css/fonts.css's own "?v=" query param (app.R) already guards against, just
# for a dependency that doesn't have a query string of its own to bust -- the version string is the only lever
# htmlDependency() gives for this, so the bundle's own mtime becomes an extra version component here.
cd_react_dependency <- function() {
  start_lang <- cd_i18n()$get_translation_language()
  bundle_dir <- file.path(getOption("cd2030.ui_dir", "../_shared"), "www", "cd-react")
  bundle_path <- file.path(bundle_dir, "cd-react.js")
  version <- if (file.exists(bundle_path)) {
    sprintf("0.2.0.%d", as.integer(file.mtime(bundle_path)))
  } else {
    "0.2.0"
  }
  htmltools::htmlDependency(
    name = "countdownReact",
    version = version,
    src = c(file = normalizePath(bundle_dir, mustWork = TRUE)),
    script = "cd-react.js",
    head = sprintf("<script>window.cdLang = window.cdLang || '%s';</script>", start_lang)
  )
}

# The stylesheet and fonts every app page needs, as <head> tags. "?v=" is the file's modification time: a
# browser (embedded views especially) keeps an old copy across redeploys unless the URL changes. Fonts are
# self-hosted (fonts.css + fonts/), never a live Google Fonts link, so the apps work offline.
cd_head_assets <- function() {
  www <- file.path(getOption("cd2030.ui_dir", "../_shared"), "www")
  v <- function(f) as.integer(file.mtime(file.path(www, f)))
  tags$head(
    tags$link(rel = "icon", type = "image/png", href = "cd-ui/countdown-mark.png"),
    tags$link(rel = "stylesheet", type = "text/css", href = paste0("cd-ui/cd-ui.css?v=", v("cd-ui.css"))),
    tags$link(rel = "stylesheet", type = "text/css", href = paste0("cd-ui/fonts.css?v=", v("fonts.css"))),
    # works around a bug in shiny.i18n's own JS that made every language switch log "[shiny] Error in inputBinding.receiveMessage()"
    tags$script(src = paste0("cd-ui/i18n-fix.js?v=", v("i18n-fix.js")))
  )
}

# A shiny.react element backed by js/src/components/<name>.tsx (registered in js/src/index.ts).
# Every widget wrapper below goes through this, so call sites never touch shiny.react directly.
cd_react_element <- function(name, props) {
  shiny.react::reactElement(module = "@/countdown", name = name, props = props, deps = cd_react_dependency())
}

# The Font Awesome class for one icon *name* ("check-circle"), resolved the same way shiny::icon() resolves
# one -- fontawesome::fa_i()'s own default already prefers the outline/regular weight ("far") and only falls
# back to solid ("fas") for icons Font Awesome Free ships solid-only (no Pro license here, so that's a real
# fallback, not a bug: e.g. "toggle-on"/"heart-crack" have no regular glyph in Free at all). Used wherever an
# icon *name* needs to become a real CSS class for a React component to render directly (cd_nav_item() below
# for Sidebar.tsx, cd_download_button_server() for DownloadButtonStatus.tsx) -- resolving it here, once, means
# neither component has to guess at weight or the exact glyph class name (aliases resolve too: "check-circle"
# -> "circle-check") the way a hardcoded "fa fa-<name>" class used to (see Sidebar.tsx's own history: the bare
# .fa class is Font Awesome 6's SOLID weight regardless of icon name, so every icon that used it rendered
# solid even where an outline glyph did exist).
cd_icon_class <- function(icon) {
  if (is.null(icon)) return(NULL)
  htmltools::tagGetAttribute(fontawesome::fa_i(icon), "class")
}
