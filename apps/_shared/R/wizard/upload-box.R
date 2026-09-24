upload_box_ui <- function(id, i18n, is_electron = FALSE) {
  ns <- NS(id)

  # The per-box "Get help" button and the standalone "Upload" label both dropped: the page header now carries
  # one "Get help" button for the whole page (see cd_page_header() in modules/0_upload_data.R), and the card's
  # own title ("Dataset") already says what this is.
  #
  # No cd_card() wrapper here any more -- this and reference_estimates_ui() are two sections of ONE shared card now
  # (0_upload_data.R's panels list wraps both together), matching the design's single "Dataset" card with an
  # "Additional reference data" sub-section beneath it, rather than two separately bordered cards of the same
  # width stacked on top of each other.
  #
  # cd_file_upload() (_shared/R/core (and components/) -> FileUploadZone.tsx), mounted once here -- NOT swapped in and out of
  # a renderUI keyed on upload status the way this used to work (a fresh fileInput() for the empty state, then a
  # second, separately-built "replace" fileInput() -- same inputId -- once status() went to "success"). That
  # swap tore down and remounted the underlying <input type="file"> in the very reactive flush its own change
  # event was still being processed in, and Shiny's file-upload binding has no way to recover from its DOM node
  # disappearing mid-upload: uploads through this box could silently fail to ever call load_file() at all.
  # FileUploadZone.tsx now tracks "already uploaded" state itself (server-pushed via cd_set_file_upload(), not just
  # its own native <input> change event -- see upload_status's own comment below), so nothing server-side needs
  # to force a remount to get that any more -- one persistent element is both simpler and the actual fix.
  # Electron: no picker at all -- base_path (cdsuite_file) is already loaded on startup (see upload_box_server()'s
  # observeEvent(TRUE, ..., once = TRUE)), same as before.
  tagList(
    if (!is_electron) {
      cd_file_upload(
        ns("hfd_file"), label = "btn_upload_hfd", hint = "hint_upload_hfd_format",
        accept = ".xls,.xlsx,.dta,.rds", i18n = i18n
      )
    },
    # Error banner only now -- a successful upload is shown by the zone itself switching to its own "uploaded"
    # state (cd_set_file_upload(), sent right after load_file() succeeds below), not a separate message underneath
    # it. See upload_box.R's load_file()/upload_box_server() for where that message is sent.
    uiOutput(ns("upload_status")),
    div(class = "cd-upload-actions", cd_download_button_ui(ns("download_data")))
  )
}

upload_box_server <- function(id, i18n, cdsuite_file, is_electron = FALSE) {
  moduleServer(
    id = id,
    module = function(input, output, session) {
      ns <- session$ns

      base_path <- normalizePath(cdsuite_file, winslash = "/", mustWork = FALSE)
      base_dir <- dirname(base_path)

      initial_cache <- reactiveVal(NULL)
      # The original uploaded path (Excel/Stata; NULL for a direct .rds upload, which needs no
      # eventual persist step of its own). Nothing is done with this at load time any more -- see
      # load_file()'s own comment on create_cache/validate below -- it's kept only so the wizard's
      # own Finish action (wizard_panels.R) can later compute the same `<dirname>/<stem>_<group>.rds` path
      # CacheConnection$initialize() would have used immediately, and call cache()$set_cache_path()
      # itself, once, when the user is actually done rather than the moment the file is picked.
      source_path <- reactiveVal(NULL)
      # NULL (nothing loaded yet -- show the picker) | list(state="success", file=<name>) |
      # list(state="error", message=<translated text>)
      status <- reactiveVal(NULL)
      # TRUE (the default) means the Load Data wizard shows its sequential walkthrough; FALSE means a resumed
      # .rds skips straight to the landing view instead (wizard_panels.R/wizard_landing.R) -- "rds will already
      # have done all these" is an explicit rule keyed on the file extension actually loaded, not inferred from
      # whether individual fields happen to be filled in. Set alongside initial_cache() below, in the same
      # tryCatch success branch, so by the time cache() itself first becomes truthy (what wizard_panels.R
      # actually waits on) this already holds the real, final answer for that load -- never left at its
      # placeholder default past that point. Deliberately NOT inferred from CacheConnection's own
      # cache_path/rds_path: that field gets populated by the class's own autosave-to-rds mechanism regardless
      # of the ORIGINAL upload's extension, so it can't distinguish "resumed from rds" from "excel-originated
      # cache that's since autosaved."
      requires_walkthrough <- reactiveVal(TRUE)

      # i18n$t() only ever takes a keyword (see shiny.i18n's Translator$t(keyword, session)) -- no built-in
      # {glue}-style interpolation, unlike cd_message_server()'s own tr() helper. str_glue_data() applied to the
      # translated template afterwards is the same two-step cd_message_server() already does for this.
      tr_err <- function(clean_message) {
        str_glue_data(list(clean_message = clean_message), i18n$t("err_upload_failed_general"))
      }

      # Where a dataset's saved copy (<name>_<group>.rds) lives: beside the file itself when the app was launched with one
      # (Electron/desktop -- cdsuite_file is the real path). A file picked in the browser only ever reaches the app
      # as a temp copy -- the folder it came from isn't sent -- so those use one fixed local folder instead; the
      # same name in the same place is what lets the next upload of that file find its saved copy.
      fallback_dir <- file.path(tools::R_user_dir("cd2030", "data"), "datasets")
      dataset_dir <- function() {
        dir <- if (is_electron && !is.na(base_path)) base_dir else fallback_dir
        if (!dir.exists(dir)) dir.create(dir, recursive = TRUE, showWarnings = FALSE)
        dir
      }

      # `use_saved = FALSE` ignores the saved copy: what load_file() falls back to when the saved copy exists but cannot be read
      # (a half-written or corrupt .rds) -- the original file is still there, so the upload must not fail over it.
      load_file <- function(path, display_name, use_saved = TRUE) {
        original_path <- path
        used_saved <- FALSE
        tryCatch(
          {
            # Whatever an earlier load left cd2030.core on, this app's group is the one to work in.
            set_selected_group(cd_wizard_indicator_group())
            # A same-named .rds (<name>_<group>.rds) beside the data (or in the fallback folder) is that dataset's saved, already-finished
            # copy: an Excel/Stata file with one loads it instead of starting the walkthrough over.
            stem <- tools::file_path_sans_ext(basename(display_name))
            saved_copy <- file.path(dataset_dir(), cd_saved_copy_name(stem))
            original_ext <- tolower(tools::file_ext(display_name))
            if (use_saved && original_ext %in% c("xls", "xlsx", "dta") && file.exists(saved_copy)) {
              path <- saved_copy
              used_saved <- TRUE
            }
            ext <- tolower(tools::file_ext(path))
            is_rds <- identical(ext, "rds")
            is_excel <- ext %in% c("xls", "xlsx")

            if (is_excel) {
              # Deferred-merge path (Phase 3 of the Load Data wizard redesign, cd2030.core): read
              # every sheet separately and hold them on the cache as wizard_parts -- no
              # merge_data()/standardize_data() and no hard-abort over a data-QUALITY problem (as
              # opposed to a structural one -- missing sheets/key columns still always abort, inside
              # load_excel_parts() itself) until the wizard's own Finish action explicitly calls
              # merge_and_standardize() (wizard_panels.R). Data Quality (data_quality.R) is where
              # per-sheet problems get run and shown, progressively, against data the user can
              # already see and act on. country/country_iso get a best-effort resolution right away
              # too (resolve_country_best_effort()), so the header badge and every national-rate/
              # survey/shapefile default that needs a country work before Finish.
              parts_result <- load_excel_parts(path)
              cache_instance <- init_CacheConnection(wizard_parts = parts_result, indicator_group = cd_wizard_indicator_group())$reactive()
              initial_cache(cache_instance())
              admin_data <- parts_result$parts[[parts_result$admin_sheet_name]]
              initial_cache()$set_wizard_country(resolve_country_best_effort(admin_data))
            } else {
              # .dta (Stata) and a direct .rds resume both keep going through the existing,
              # already-merged path -- deferred-merge is meaningless for a single-sheet Stata file
              # (no separate Admin/Population/Service sheets to defer merging between), and an .rds
              # resume is already fully merged and validated from a previous Finish.
              cache_instance <- load_cache_data(path, indicator_group = cd_wizard_indicator_group(), create_cache = FALSE, validate = FALSE)$reactive()
              initial_cache(cache_instance())
              # loading a dataset resets cd2030.core's group to the dataset's own; a mismatch is refused
              tryCatch(cd_wizard_check_group(initial_cache()), error = function(e) {
                initial_cache(NULL)
                stop(e)
              })
            }

            requires_walkthrough(!is_rds)
            # The path Finish saves next to: <dataset folder>/<original name>.rds, whatever temp copy `path` is.
            source_path(if (is_rds) NULL else file.path(dataset_dir(), basename(display_name)))
            # basename(), not the full path: a full local path (e.g.
            # "C:/Users/.../Downloads/Final_RDS/Chad_CAM2026.rds") is neither meaningful to the person reading
            # it nor something that fits the zone's own filename display without wrapping.
            file_name <- basename(display_name)
            status(list(state = "success", file = file_name))
            # Tells the (already-mounted) upload zone to show its own "already uploaded" state for this exact
            # file -- see cd_set_file_upload()'s own comment (_shared/R/core (and components/)) for why this replaces a separate
            # success banner instead of sitting alongside one.
            cd_set_file_upload("hfd_file", file_name, session)
          },
          error = function(e) {
            initial_cache(NULL)
            if (used_saved) {
              message("The saved copy of ", display_name, " could not be read (", clean_error_message(e), "); loading the original file instead.")
              return(load_file(original_path, display_name, use_saved = FALSE))
            }
            status(list(state = "error", message = tr_err(clean_error_message(e))))
          }
        )
      }

      observeEvent(TRUE,
        {
          # Was req(nzchar(base_path)) -- nzchar(NA_character_) is TRUE (nzchar() only treats NA as empty when
          # keepNA = TRUE is passed explicitly, which this didn't), so with CDSUITE_SHINY_SELECTED_FILE unset
          # (cdsuite_file/base_path both NA_character_, the ordinary non-Electron case) this still passed and
          # file.exists(NA) is FALSE, so every plain-browser run showed "the file provided does not exist" on
          # load even though no file was ever supposed to be pre-loaded. is_electron is exactly "was a file
          # actually provided" (app.R's own is_electron = !is.na(selected_file)) -- the right guard here.
          req(is_electron)

          if (!file.exists(base_path)) {
            status(list(state = "error", message = tr_err("The file provided does not exist")))
            return(NULL)
          }
          load_file(base_path, base_path)
        },
        once = TRUE
      )

      remounted <- cd_remounted(input, "hfd_file")
      observe({
        req(remounted())
        st <- status()
        if (!is.null(st) && identical(st$state, "success")) cd_set_file_upload("hfd_file", st$file, session)
      })

      observeEvent(input$hfd_file, {
        req(input$hfd_file)

        file_path <- input$hfd_file$datapath
        file_name <- input$hfd_file$name
        # Was input$hfd_file$ext -- not a column Shiny's file-input binding ever produces (?fileInput's own data
        # frame is name/size/type/datapath, no "ext"), so this was always NULL. `!NULL %in% c(...)` is
        # `logical(0)`, and `if (logical(0))` throws "argument is of length zero" -- uncaught (this observer has
        # no tryCatch of its own; only load_file() below does), so every upload through this box errored out
        # before ever reaching load_file(). tools::file_ext() derives it from the actual filename instead.
        file_type <- tools::file_ext(file_name)

        if (!file_type %in% c("xls", "xlsx", "dta", "rds")) {
          status(list(state = "error", message = i18n$t("err_upload_unsupported")))
          initial_cache(NULL)
          return()
        }
        load_file(file_path, file_name)
      })

      # Clearing the MAIN dataset is different from clearing one of the reference-data zones
      # (reference_estimates.R's own input$X_data_reset observers only revert that one field): this is the file
      # "the whole analysis runs on" (upload_box_ui()'s own subtitle), so clearing it has to invalidate
      # everything downstream that was derived from it -- national rates, survey files, mappings, all of it --
      # not just blank out this one zone's display. Reverting cache() to NULL is enough on its own: every other
      # step's own complete_fn() (step_status.R) already treats a NULL cache as "not done", so the wizard
      # re-locks steps 2+ the moment this fires, the same as if nothing had ever been uploaded.
      observeEvent(input$hfd_file_reset, {
        initial_cache(NULL)
        status(NULL)
        requires_walkthrough(TRUE)
        source_path(NULL)
      })

      # Error only -- a successful load is shown by the upload zone itself (cd_set_file_upload(), load_file()
      # above), not a second banner repeating the same "file X is ready" underneath it.
      output$upload_status <- renderUI({
        st <- status()
        if (is.null(st)) return(NULL)
        if (identical(st$state, "error")) {
          return(cd_status_banner("error", "title_upload_error_heading", st$message, i18n = i18n))
        }
        # Electron has no upload zone to show "uploaded" in (the file was loaded on startup), so it gets the
        # message instead; with a zone, the zone itself already says so.
        if (isTRUE(is_electron) && identical(st$state, "success")) {
          msg <- str_glue_data(list(file_name = st$file), cd_plain_text(i18n, "msg_upload_success_file"))
          return(cd_status_banner("success", "title_upload_success_heading", msg, i18n = i18n))
        }
        NULL
      })

      # icon_only = FALSE: every button in the design (Replace file, Download report, Get help) shows its label,
      # not just an icon -- this one already had a real translation key (btn_upload_download_master, "Download
      # master dataset") sitting unused as just the hover tooltip/a11y text.
      cd_download_button_server(
        id = "download_data",
        filename = reactive("master_dataset"),
        extension = reactive("dta"),
        i18n = i18n,
        content = function(file, data) {
          # Reachable mid-wizard (right after upload, well before Finish) -- countdown_data itself
          # is still NULL then (Phase 3 of the wizard redesign), so this can't just read it directly
          # the way it used to; build the merged export on demand from wizard_parts instead when
          # that's all there is yet. validate = FALSE: this is a plain export convenience, not the
          # wizard's own Finish action -- it shouldn't newly enforce Tier B blocking checks the
          # wizard's own Data Quality step already surfaces separately.
          cd <- initial_cache()
          merged <- cd$countdown_data %||% (
            if (!is.null(cd$wizard_parts)) merge_and_standardize(cd$wizard_parts, indicator_group = cd_wizard_indicator_group(), validate = FALSE)
          )
          haven::write_dta(merged, file)
        },
        data = initial_cache,
        label = "btn_upload_download_master",
        icon_only = FALSE
      )

      # cd_help_button_server() removed along with the box's own "Get help" button (upload_data_ui() has the page's
      # help button now, wired to the same "loading-data" path via cd_page_header_server()).

      list(cache = reactive(initial_cache()), requires_walkthrough = requires_walkthrough, source_path = source_path)
    }
  )
}
