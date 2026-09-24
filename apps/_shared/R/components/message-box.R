# cd_message_box() (_shared/R/core (and components/) -> MessageBoxStatus.tsx), not a jQuery-appended <div> stack any more --
# cd_message_server() below sends the exact same "messagebox" custom message it always has, React just renders
# it now. Styling (.messages-stack/.msg/.msg__title/.msg__desc etc.) lives in _shared/www/cd-ui.css as a shared rule,
# not injected per instance via singleton(tags$style()) the way it used to be -- one rule for every message box
# on the page, like every other shared component class, instead of identical CSS text duplicated into each
# instance's HTML.
cd_message_ui <- function(id, label = NULL, width = NULL) {
  ns <- NS(id)

  div(
    id = ns("container"),
    class = "cd-message-box",
    style = if (!is.null(width)) css(width = validateCssUnit(width)),

    if (!is.null(label))
      tags$label(class = "cd-field-label", `for` = ns("body"), label),

    cd_message_box(ns("body"))
  )
}

# title (add_message()/update_message()/default_title): a translation key for the bold heading React shows
# above the message text (MessageBoxStatus.tsx) -- the design's own message token is icon + bold title +
# description, not a single line (see _shared/www/cd-ui.css's .msg__title/.msg__desc). Optional and NULL by default:
# a message with no title still renders fine, just without the bold heading line (MessageBoxStatus.tsx only
# renders .msg__title when one was given) -- existing callers that haven't been given a title yet fall back to
# that rather than erroring.
cd_message_server <- function(id, i18n = NULL, default_message = "msg_upload_awaiting", default_title = "title_msg_waiting", use_pre = FALSE, help_text = NULL) {
  moduleServer(id, function(input, output, session) {
    ns <- session$ns
    statuses <- c("info", "success", "error", "warning")

    # Was tr(key) -- i18n$t(key) resolves to ONE string, in whatever language the server's i18n object is set
    # to right now, baked into the message at send time. Every other piece of text this app sends to a React
    # component (cd_field_number()'s label, cd_status_banner()'s title, ...) instead sends a {en,fr,pt} object via
    # cd_text() and lets the client pick the live language itself (see useLang(), js/src/lang.ts) -- that's how
    # a language switch re-renders text without the server resending anything. Message boxes never got that:
    # these messages mostly fire once, at load or on upload, well before/after any language switch, so whatever
    # language was active at that one moment is what displays forever after, regardless of what the page's own
    # labels/hints correctly switch to. tr_all() mirrors cd_text() -- one {en,fr,pt} object, {parameters}
    # interpolated into EACH language's own template separately (str_glue_data() per language, not once on a
    # single resolved string) -- and also works unchanged for a key that ISN'T a real translation lookup (e.g.
    # selected_dir_box$add_message(clean_error_message(e), ...), dynamically-built text, not a key): cd_text()
    # already falls back to the raw string verbatim in every language when it's not found in the table.
    tr_all <- function(key, parameters = NULL) {
      if (is.null(key)) return(NULL)
      if (is.null(parameters)) parameters <- list()
      if (!is.null(i18n)) {
        lapply(cd_text(i18n, key), function(template) str_glue_data(parameters, template))
      } else {
        list(en = str_glue_data(parameters, key))
      }
    }

    # A "messagebox" custom message sent before MessageBoxStatus.tsx has mounted (and registered its own
    # Shiny.addCustomMessageHandler listener, see that component's own comment) has no listener at all and is
    # simply gone -- Shiny doesn't replay custom messages to a handler registered later. add_message() below
    # (the default_message call right after this, at module-init time -- the session's very first reactive
    # flush, well before the client can have mounted anything yet) hit exactly this every time: every message
    # box in the app was silently losing its own opening message. Queuing here and flushing once mounted() goes
    # TRUE fixes it for every caller at once, not just this module's own default message -- send_msg() is a
    # plain function called from all over the app (inside tryCatch handlers, top-level init, observers), not
    # only from a reactive context, so isolate() is how it has to read/write these two reactiveVals safely.
    # cd_mounted() indexes into THIS module's own scoped `input`, which auto-namespaces a bare id itself (see
    # national_rates.R's own cd_mounted(input, f) calls, same bare-id convention) -- ns("body") here would double
    # -namespace and never match what the client actually sends (the fully-qualified id it was given as its own
    # `id` prop, namespaced exactly once).
    mounted <- cd_mounted(input, "body")
    pending <- reactiveVal(list())

    send_msg <- function(action, text = NULL, status = "info", title = NULL) {
      msg <- list(
        rootId = ns("body"),
        action = action,
        text = text,
        title = title,
        status = status,
        usePre = isTRUE(use_pre)
      )
      if (isTRUE(isolate(mounted()))) {
        session$sendCustomMessage("messagebox", msg)
      } else {
        pending(c(isolate(pending()), list(msg)))
      }
    }

    observeEvent(mounted(), {
      msgs <- isolate(pending())
      if (length(msgs) == 0) return()
      pending(list())
      for (msg in msgs) session$sendCustomMessage("messagebox", msg)
    }, ignoreInit = TRUE)

    make_node <- function(text, status, parameters) {
      # A programming-error check (an invalid `status` argument, a call-site bug), not user-facing UI text --
      # doesn't need i18n treatment.
      if (!status %in% statuses) stop("Invalid message status: ", status)
      tr_all(text, parameters)
    }

    clear_messages <- function() {
      send_msg("clear")
    }

    add_message <- function(message, status = "info", parameters = NULL, title = NULL) {
      txt <- make_node(message, status, parameters)
      title_txt <- tr_all(title)
      send_msg("add", txt, status, title_txt)
    }

    update_message <- function(message, status = "info", parameters = NULL, title = NULL) {
      clear_messages()
      add_message(message, status, parameters, title)
    }

    if (!is.null(help_text)) {
      # Plain, server-resolved text (not tr_all()'s {en,fr,pt} object) -- this is a one-time raw HTML insertion
      # via insertUI(), not a pushed message a React component can re-render per the live language the way
      # add_message()/update_message() now do, so it's frozen at whatever language is active on insert (rare in
      # practice: no caller in this app currently passes help_text at all).
      insertUI(
        selector  = paste0("#", ns("container")),
        where     = "beforeEnd",
        immediate = TRUE,
        ui        = tags$span(class = "cd-field-hint", if (!is.null(i18n)) i18n$t(help_text) else help_text)
      )
    }

    add_message(default_message, "info", title = default_title)

    list(
      add_message = add_message,
      update_message = update_message,
      clear_messages = clear_messages
    )
  })
}
