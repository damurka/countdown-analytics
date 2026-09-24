# A drag-and-drop-styled file upload (FileUploadZone.tsx) -- the visible chrome only. Not an InputAdapter
# component and not wired through shiny.react's value-syncing at all: Shiny's own native file-input binding
# (srcts/src/bindings/input/fileinput.ts) finds the real, plain <input type="file"> this renders and handles
# the actual upload completely independently, exactly the way it always has for fileInput()/directoryInput()
# (both since removed) -- input$<id> arrives the same way it always did. See FileUploadZone.tsx's own
# comment for why the upload mechanism itself was left alone and only the surrounding chrome replaced.
# browseLabel/browseFolderLabel/replaceLabel: fixed text every upload zone in the app shares, so resolved here
# rather than exposed as a parameter every call site would just pass the same three keys into.
cd_upload_zone_texts <- function(i18n) {
  list(
    browseLabel = cd_text(i18n, "btn_upload_browse_drop"),
    browseFolderLabel = cd_text(i18n, "btn_upload_browse_drop_folder"),
    replaceLabel = cd_text(i18n, "lbl_upload_replace"),
    resetLabel = cd_text(i18n, "lbl_upload_reset")
  )
}

cd_file_upload <- function(id, label = NULL, hint = NULL, accept = NULL, i18n = cd_i18n(), multiple = FALSE) {
  cd_react_element("FileUploadZone", do.call(shiny.react::asProps, c(
    list(id = id),
    if (!is.null(label)) list(label = cd_text(i18n, cd_key(label))),
    if (!is.null(hint)) list(hint = cd_text(i18n, cd_key(hint))),
    if (!is.null(accept)) list(accept = accept),
    if (isTRUE(multiple)) list(multiple = TRUE),
    cd_upload_zone_texts(i18n)
  )))
}

# Tell a FileUploadZone (cd_file_upload()/cd_directory_upload()) to clear its own selected-file display -- the
# React-driven replacement for shinyjs::reset(inputId), which used to do this by reaching into the DOM and
# calling .val('') on the underlying <input type="file"> directly. That worked (Shiny's own binding does see
# the clear), but it fires no 'change' event, so FileUploadZone.tsx had no way to hear it happen and had to
# fall back to polling the input's .files every 600ms just to catch it -- see that component's own header
# comment.
#
# Was shiny.react::updateReactInput(session, inputId, resetKey = ...) (a changing prop, the same "push a new
# prop" mechanism cd_update_input() uses for chips) -- that doesn't work here and can't be made to: it dispatches
# through updateHandlers[inputId], which shiny.react's own InputAdapter() is the ONLY thing that ever
# registers (see useUpdatedProps() in its bundled JS). cd_file_upload()'s own header comment already says
# FileUploadZone is deliberately NOT an InputAdapter component -- so updateHandlers[inputId] never exists for
# it, at any point, mount timing included, and shiny.react's own client throws "Attempted to update
# non-existent React input" every single time, not just on a race. (A prior version of this function gated the
# call on cd_mounted() to fix what looked like a mount race -- it wasn't one; the error fired even on an
# instance confirmed already mounted, which is what surfaced this.)
#
# A plain custom message instead -- the exact mechanism MessageBoxStatus.tsx/cd_message_server() already use for
# the same kind of push to a non-InputAdapter component (see message_box.R's own rootId = ns("body")):
# Shiny.addCustomMessageHandler has no "does this exist" check at all, so a message that arrives before (or
# without) a matching mounted instance just has no listener and silently does nothing -- the same safe,
# no-op-if-nothing-to-reset behavior shinyjs::reset(id) always had, restored, not a new caveat to gate around.
# ns(inputId), not the bare id updateReactInput()'s own inputId argument took: session$sendInputMessage()
# namespaces that argument automatically for a module session, but an arbitrary field inside a custom
# message's own payload is not auto-namespaced, so this has to match ns("body")'s own explicit call above.
cd_reset_file_upload <- function(inputId, session = shiny::getDefaultReactiveDomain()) {
  session$sendCustomMessage("cd-file-reset", list(inputId = session$ns(inputId), resetKey = as.numeric(Sys.time())))
}

# Tells an already-mounted FileUploadZone "this file is the current one" -- the counterpart to
# cd_reset_file_upload() above, same plain-custom-message mechanism and the same reason it has to be one (see that
# function's own long comment: FileUploadZone is deliberately not an InputAdapter, so updateReactInput() never
# reaches it). Lets the zone show its own "already uploaded, replace/reset" state driven by SERVER truth (the
# load actually having succeeded, cdsuite_file's own electron auto-load, or a resumed cache) rather than only
# ever reacting to its own native <input>'s change event -- which never fires at all for a file the user didn't
# just pick through this exact browser session (electron auto-load; a resumed .rds). Called right after
# load_file() succeeds (upload_box.R) instead of a separate "Upload successful" status banner underneath the
# zone -- one place showing the current file, not two.
cd_set_file_upload <- function(inputId, fileName, session = shiny::getDefaultReactiveDomain()) {
  session$sendCustomMessage("cd-file-set", list(inputId = session$ns(inputId), fileName = fileName))
}

# Same as cd_file_upload(), a folder instead of one file (adds the webkitdirectory attribute, same trick
# directoryInput() already used). required_files: a named character vector, names = a translation key for each
# expected file's own short label, values = the filename PREFIX the server actually dispatches on (file_upload.R's
# own grepl('^all_', ...) etc., not the exact country-substituted filename, which isn't known client-side) --
# shown as a live checklist, checked off as files are selected, purely a preview (the server's own missing-files
# validation, unchanged, remains the definitive check).
cd_directory_upload <- function(id, label = NULL, hint = NULL, accept = NULL, required_files = NULL, i18n = cd_i18n()) {
  cd_react_element("FileUploadZone", do.call(shiny.react::asProps, c(
    list(id = id, directory = TRUE),
    if (!is.null(label)) list(label = cd_text(i18n, cd_key(label))),
    if (!is.null(hint)) list(hint = cd_text(i18n, cd_key(hint))),
    if (!is.null(accept)) list(accept = accept),
    # cd_text(), not i18n$t(): the latter returns markup for the app's OLD DOM-scanning translator (a class="i18n"
    # data-key="..." span), not the plain {en,fr,pt} object every React component here needs to follow
    # window.cdLang live via tr() -- passing i18n$t()'s markup through as a prop still "worked" (React can
    # render an arbitrary element as a child), but silently opted this text out of the live-language-switch
    # behavior every other label/hint in this component family gets.
    if (!is.null(required_files)) list(requiredFiles = unname(purrr::imap(required_files, function(prefix, key) {
      list(prefix = prefix, label = cd_text(i18n, key))
    }))),
    cd_upload_zone_texts(i18n)
  )))
}

# Shared text every MappingModal instance needs, the same bundling cd_chip_texts() already does for chips.
cd_mapping_texts <- function(i18n = cd_i18n()) {
  list(
    cancelLabel = cd_text(i18n, "btn_global_cancel"),
    saveLabel = cd_text(i18n, "btn_upload_save_mapping"),
    searchLabel = cd_text(i18n, "lbl_map_search"),
    mappedLabel = cd_text(i18n, "lbl_map_mapped"),
    # Explicit user request: MappingModal.tsx's own auto-match (js/src/matching.ts, run once when the modal
    # opens) can fill in most or every row before the user has touched anything -- confirmed live, e.g. every
    # region already showing "12 / 12 mapped" the very first time the modal opens -- with nothing telling the
    # user that happened automatically rather than them having done it, or the app somehow already knowing
    # their data. Shown (MappingModal.tsx) only when autoMatch() actually found something, so a genuinely
    # unmapped/empty modal doesn't show a note about matching that never happened.
    autoMatchedLabel = cd_text(i18n, "lbl_map_auto_matched"),
    # Per-row tags (MappingModal.tsx, js/src/matching.ts's classifyMatch()) telling the user *why* a still-
    # pending auto-match matched -- explicit user report: a same-spelling, different-case match ("Alibori" ->
    # "ALIBORI") needs to say so specifically, not just the generic "matched...based on spelling" note above,
    # which reads as if a real spelling fix happened when it was only a case difference.
    matchCaseLabel = cd_text(i18n, "lbl_map_match_case"),
    matchAccentLabel = cd_text(i18n, "lbl_map_match_accent"),
    matchFuzzyLabel = cd_text(i18n, "lbl_map_match_fuzzy"),
    noMatchLabel = cd_text(i18n, "lbl_map_no_match"),
    selectLabel = cd_text(i18n, "lbl_map_select"),
    usedTwiceLabel = cd_text(i18n, "lbl_map_used_twice"),
    unmappedLabel = cd_text(i18n, "lbl_map_unmapped"),
    duplicateLabel = cd_text(i18n, "lbl_map_duplicate"),
    saveAnywayQuestion = cd_text(i18n, "lbl_map_save_anyway_q"),
    reviewLabel = cd_text(i18n, "lbl_map_review"),
    saveAnywayLabel = cd_text(i18n, "lbl_map_save_anyway")
  )
}

# The region-name-reconciliation button + modal (MappingModal.tsx), replacing mapping_modal_ui()/
# createMappingModal() (modal_helpers.R) -- an InputAdapter component (unlike every other cd*() helper above
# this point in the file, which are plain), since it sends its whole result back as ONE value on Save (an
# object, region -> matched value) rather than syncing a value continuously; mapping_modal_server() reads it via
# a single observeEvent(input$<id>, ...) instead of looping over N separate selectize inputs.
# existing: a named character vector (region -> its previously-saved match), or NULL if nothing's been mapped
# yet -- auto-match (client-side, matching.ts) only fills rows this doesn't already cover.
cd_mapping_modal <- function(id, label, title, regions, choices, existing = NULL, i18n = cd_i18n()) {
  cd_react_element("MappingModal", do.call(shiny.react::asProps, c(
    list(
      inputId = id, label = cd_text(i18n, cd_key(label)), title = cd_text(i18n, cd_key(title)),
      regions = as.list(regions), choices = as.list(choices)
    ),
    if (!is.null(existing) && length(existing) > 0) list(existing = as.list(existing)),
    cd_mapping_texts(i18n)
  )))
}
