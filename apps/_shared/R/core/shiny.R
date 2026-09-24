# Push a new value, new options or new text to a chip that is already on the page. The chip must have mounted:
# a message to one that has not is lost, so wait for cd_mounted().
cd_update_input <- function(inputId, session = shiny::getDefaultReactiveDomain(), ...) {
  # list2() so callers can splice a list of props in with !!!
  do.call(shiny.react::updateReactInput, c(list(session = session, inputId = inputId), rlang::list2(...)))
}

# TRUE once the React component `id` has mounted in the browser. Call it from the module server that owns it.
cd_mounted <- function(input, id) {
  mounted <- reactiveVal(FALSE)
  observeEvent(input[[paste0(id, "__mounted")]], mounted(TRUE), once = TRUE)
  mounted
}

# Like cd_mounted() above, but reflects EVERY mount of the React component `id`, not just the first --
# confirmed live cd_mounted()'s own `once = TRUE` is exactly wrong for a caller whose job is to RE-SYNC state to
# a component that can genuinely be torn down and remounted mid-session (e.g. a wizard step's own field,
# rebuilt every time a landing-page Edit link jumps back into it post-Finish, wizard_panels.R): once=TRUE
# means it only ever reacts to the FIRST mount a given call site ever sees, silently discarding every later
# one, so a value pushed on a later remount (cd_set_file_upload()/cd_update_input()) never lands. The underlying
# input[[paste0(id, "__mounted")]] itself already carries a fresh, distinct value (Date.now(), {priority:
# "event"}) on every single mount -- FileUploadZone.tsx/FieldNumber.tsx/etc.'s own mount effect sends it
# unconditionally, not just once (see their own comments) -- so reading it straight through, with no coercion
# to a sticky boolean, is enough on its own: req()/observeEvent() on the result re-fires each time it changes.
cd_remounted <- function(input, id) {
  reactive(input[[paste0(id, "__mounted")]])
}

# Tell every React component the language changed
cd_set_language <- function(session, lang) {
  session$sendCustomMessage("cd-lang", lang)
}

# Moves the user to a different sidebar tab from a server-side action (js/src/nav.ts's own setActiveTab(), which
# every sidebar click already goes through client-side) -- the Load Data landing page's "Continue to analysis"
# CTA (wizard_landing.R) is the one thing that needs this today. `tab_name` matches a cd_screen()'s own `tabName`
# (app.R), the same string cd_nav_item(tabName=...) uses.
cd_navigate_to <- function(session, tab_name) {
  session$sendCustomMessage("cd-navigate", tab_name)
}
