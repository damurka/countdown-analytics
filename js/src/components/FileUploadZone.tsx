import React, { useEffect, useRef, useState } from "react";
import { tr, useLang, useMountSignal, useShinyMessage } from "../lang";
import type { LocalText } from "../lang";

// A drag-and-drop-styled file/folder upload zone -- the visible chrome only. The actual upload mechanism is
// left entirely to Shiny's own native file input binding (srcts/src/bindings/input/fileinput.ts): that binding
// finds any <input type="file"> on the page itself (no special class required to be *found*, though Shiny adds
// "shiny-input-file" once bound), handles the real multipart upload/chunking/progress via its own FileUploader,
// and -- critically -- ALREADY implements page-wide drag-and-drop, but only for a file input whose closest
// ancestor is `div.input-group` (zoneOf() in that same binding hardcodes that selector). So the one structural
// requirement here is keeping that wrapper div and its class name; everything else (the dashed zone, the icon,
// the selected-file display, the folder-contents checklist) is free to be styled however this app wants,
// instead of Bootstrap's own file-input chrome (a small button + a read-only text box), which is what
// fileInput()/directoryInput() rendered before this replaced them.
//
// directoryInput()'s own trick (a hidden <input type="file" webkitdirectory multiple>, relying on Shiny's
// binding to treat the browser's own folder-picker output as an ordinary multi-file upload) is preserved
// exactly -- `directory` here just adds the same two attributes.

export interface FileUploadZoneProps {
  id: string;
  label?: LocalText;
  hint?: LocalText;
  accept?: string;
  directory?: boolean;
  /** Several individual files (no folder picking), e.g. the pooled app's list of .rds caches. */
  multiple?: boolean;
  browseLabel: LocalText;
  browseFolderLabel: LocalText;
  replaceLabel: LocalText;
  resetLabel: LocalText;
  /** Directory mode only: filename PREFIXES expected in the folder (e.g. "all_", "gregion_"), each with a
   *  label -- shown as a checklist once files are selected, checked off as soon as a selected file's name
   *  starts with that prefix. Matches the server's own dispatch logic (grepl('^all_', ...) etc., file_upload.R)
   *  -- the exact, country-substituted filename isn't known client-side, so this checks by prefix, the same
   *  thing the server itself keys off. Purely a preview: the server still validates and reports the definitive
   *  missing-files list the same way it always has (selected_dir_box's own message box, unchanged). */
  requiredFiles?: { prefix: string; label: LocalText }[];
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
    </svg>
  );
}

export default function FileUploadZone({
  id,
  label,
  hint,
  accept,
  directory,
  multiple,
  browseLabel,
  browseFolderLabel,
  replaceLabel,
  resetLabel,
  requiredFiles,
}: FileUploadZoneProps) {
  // Sends input$<id>__mounted the moment this zone exists in the DOM -- was missing here, the same gap
  // FieldNumber.tsx/FieldSelect.tsx already had (see their own comments): cd_mounted() (R side, ui/react/
  // cd-react.R) is how a caller is supposed to wait for a React component to exist before pushing it a value,
  // but that only works if the component actually sends this signal. Without it, cd_reset_file_upload() calls
  // that raced this component's mount (file_upload.R's observeEvent(data(), ...), which can fire on the very
  // first dataset load before the client has finished mounting these zones) hit shiny.react's own
  // "Attempted to update non-existent React input" error client-side -- not just a lost message: this stops
  // Shiny's client from processing any further message for the rest of the session (the same class of failure
  // app.R's own header_country debounce comment already warns about), silently swallowing every later render
  // update, including the upload success/error banner from the very upload that triggered the reset.
  useMountSignal(id);
  const lang = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);

  // Binds this zone's <input type="file"> to Shiny ourselves, rather than relying on shiny.react's own
  // ShinyBindingWrapper to do it (shiny-react's dataMappers.element only wraps an element in that -- which
  // calls Shiny.bindAll() on mount to guarantee binding regardless of React/Shiny init timing -- when
  // needsBindingWrapper(props.className) matches; that checks the className PROP passed to cd_react_element()
  // from R, which cd_file_upload()/cd_directory_upload() never set, not this component's own internal root div's
  // className below. So it never wraps any FileUploadZone instance, and binding was left to whatever Shiny's
  // own one-time Shiny.bindAll(document) on page load happened to catch -- a real race against React's own
  // mount, not a delay: if React mounted this zone even slightly after that ran, the underlying input was
  // NEVER bound, silently, for the rest of the session (no error, just zero effect on every pick -- no upload
  // request, no input$<id> server-side, nothing). Every other input in this app goes through InputAdapter,
  // which doesn't need Shiny's generic DOM-scanning binder at all, so nothing else here was ever exposed to
  // this. Calling bindAll ourselves, scoped to this component's own root and on every mount, makes binding
  // deterministic instead of a coin flip.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.Shiny) return undefined;
    window.Shiny.initializeInputs?.(root);
    window.Shiny.bindAll?.(root);
    return () => window.Shiny?.unbindAll?.(root);
  }, []);

  // webkitdirectory isn't a standard React/JSX DOM prop -- set directly on the element, the same reason
  // directoryInput() sets it as a raw HTML attribute rather than something a UI framework has built-in typing
  // for.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || !directory) return;
    // Not in the standard HTMLInputElement typings -- a real, long-supported (Chrome/Edge/Safari) attribute
    // all the same, the same one directoryInput() (ui/input/directory-input.R) sets as raw HTML.
    (el as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
  }, [directory]);

  // True while the current fileNames display came from the server (cd_set_file_upload() below), not from this
  // zone's own native <input>. el.files can never represent that fact either way -- Electron's auto-load and a
  // resumed .rds both set a "current file" with no browser file-picker interaction involved at all, so el.files
  // stays empty the whole time. Read by the poll below so it doesn't fight that state (see its own comment).
  const serverSetRef = useRef(false);

  // Two ways this component's own file-name display can get out of sync with the actual input, both handled
  // here: (1) a normal 'change' listener for the common case (the user genuinely picks/drops a file) -- instant,
  // no lag, and always authoritative (a real pick always wins over a stale server-set name). (2) a slow poll,
  // for changes made with NO 'change' event at all -- vaxx's own upload module calls shinyjs::reset(id) on this
  // same shared component, which reaches into the DOM and clears the underlying <input> with a raw `.val('')`
  // (confirmed against shinyjs's own source), invisible to any event listener. The poll must NOT blindly mirror
  // el.files on every tick, though: it would otherwise clobber a server-set filename back to empty within
  // 600ms, every time, since el.files is never non-empty for that case to begin with -- not a rare race, a
  // guaranteed one, on every single upload (confirmed live: cd_set_file_upload()'s message demonstrably arrived
  // and set state correctly, then reverted to the empty "Browse or drop" prompt well under a second later).
  // Skipping the poll's clear specifically while serverSetRef is true leaves it free to still catch a genuine
  // shinyjs::reset() (which the "cd-file-reset" handler below also clears serverSetRef for, so a *later*
  // shinyjs::reset() on a server-set zone still gets picked up the same poll cycle after that).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return undefined;
    const handleChange = () => {
      serverSetRef.current = false;
      setFileNames(el.files ? Array.from(el.files).map((f) => f.name) : []);
    };
    const poll = () => {
      const files = el.files ? Array.from(el.files).map((f) => f.name) : [];
      if (files.length === 0 && serverSetRef.current) return; // server-set, not a real clear -- leave it
      // Only actually update state when the names genuinely changed -- Array.from() above builds a fresh
      // array every single tick regardless, and setFileNames(fresh array) unconditionally, every 600ms,
      // triggered a full re-render of this zone (new state, even though its CONTENT was identical to what
      // was already showing) for as long as a file stayed selected -- confirmed live via a MutationObserver
      // on the zone: 3 distinct remove+add cycles within ~1.5s of picking a file, matching the "upload
      // component flickers" report exactly. setFileNames is only reachable here when something real
      // changed now.
      setFileNames((prev) => {
        if (prev.length === files.length && prev.every((n, i) => n === files[i])) return prev;
        return files;
      });
    };
    el.addEventListener("change", handleChange);
    const interval = setInterval(poll, 600);
    return () => {
      el.removeEventListener("change", handleChange);
      clearInterval(interval);
    };
  }, []);

  // cd_reset_file_upload()'s own client-side half. Was shiny.react::updateReactInput() (a changing `resetKey`
  // prop) -- that dispatches through shiny.react's own updateHandlers[inputId], which only InputAdapter()
  // registers, and this is deliberately not an InputAdapter component (see this file's own header comment), so
  // that message had no listener EVER, mount timing included, and shiny.react's client threw "Attempted to
  // update non-existent React input" on every single reset, not just a race. A plain custom message doesn't
  // have that requirement -- but each instance calling Shiny.addCustomMessageHandler("cd-file-reset", ...)
  // directly (an earlier version of this did exactly that) has its OWN bug: Shiny keeps only one handler per
  // type globally, so with five upload zones on one page, only the last one to mount would ever actually
  // reset. useShinyMessage() (lang.ts) registers a single real handler and fans it out by inputId instead --
  // see its own comment for the full story (MessageBoxStatus.tsx hit the identical bug for "messagebox").
  useShinyMessage("cd-file-reset", "inputId", id, () => {
    const el = inputRef.current;
    if (el) el.value = "";
    serverSetRef.current = false;
    setFileNames([]);
  });

  // The server-truth counterpart to the reset message above (cd_set_file_upload(), R: _shared/R/core (and components/)): says
  // "this file is the current one" independent of this zone's own native <input> ever having fired a 'change'
  // event for it -- which it never does for a file loaded via Electron's auto-load path, or a cache resumed
  // from a saved .rds, since neither one involves the browser's own file picker at all. Drives the exact same
  // "already uploaded" render branch below as a real pick would.
  useShinyMessage("cd-file-set", "inputId", id, (msg) => {
    const fileName = typeof msg.fileName === "string" ? msg.fileName : undefined;
    serverSetRef.current = fileName != null;
    setFileNames(fileName ? [fileName] : []);
  });

  const checklist = requiredFiles?.map((r) => ({ ...r, present: fileNames.some((n) => n.startsWith(r.prefix)) }));
  const hasFile = fileNames.length > 0;

  // Distinct from clicking the zone itself (which replaces via the native picker, same as always): clears the
  // selection back to the empty "Browse or drop" state without opening anything. Lives OUTSIDE the <label> (see
  // JSX below) rather than as a nested button with stopPropagation() -- a label's own click-forwards-to-input
  // behavior happens at the browser level, beneath React's synthetic event system, so stopPropagation() inside
  // a descendant can't reliably suppress it.
  //
  // Also fires a plain `${id}_reset` input value -- a server-side module that wants "reset" to mean more than
  // just clearing this zone's own display (e.g. reference_estimates.R: actually reverting cache()'s stored
  // value back to its package default, not just "let me pick a different file") can observe
  // input$<field>_reset and act on it; a module that doesn't care just never looks at it, same as any other
  // unobserved Shiny input. Shiny.setInputValue() works here same as anywhere else -- it isn't gated behind
  // InputAdapter/shiny.react the way updateReactInput() is (see this file's own header comment on that).
  function handleReset(e: React.MouseEvent) {
    e.preventDefault();
    const el = inputRef.current;
    if (el) el.value = "";
    serverSetRef.current = false;
    setFileNames([]);
    window.Shiny?.setInputValue?.(`${id}_reset`, Date.now(), { priority: "event" });
  }

  return (
    // shiny-input-container: not decorative -- it's the standard class Shiny itself gives any input's wrapper
    // (form-group styling, its own error-state selectors), and vaxx's own upload module still calls
    // shinyjs::reset() on this same shared component, which only looks for resettable inputs inside an element
    // carrying this exact class (its own _initResettablesHelper hardcodes the selector) -- without it,
    // shinyjs::reset('un_data') etc. there would silently find nothing to reset. rmncah no longer depends on
    // this for its own reset path (see the "cd-file-reset" handler above), but the class stays for both
    // reasons.
    <div ref={rootRef} className="shiny-input-container cd-upload-zone-wrap">
      {label != null && <span className="cd-field-label">{tr(label, lang)}</span>}
      <div className={`cd-upload-zone-shell${hasFile ? " cd-upload-zone-shell--filled" : ""}`}>
        <label htmlFor={id} className="input-group cd-upload-zone">
          {hasFile ? <span className="cd-upload-zone__check"><CheckIcon /></span> : <UploadIcon />}
          <span className="cd-upload-zone__text">
            {!hasFile ? (
              <>
                <strong>{tr(directory ? browseFolderLabel : browseLabel, lang)}</strong>
                {hint != null && <span className="cd-upload-zone__hint">{tr(hint, lang)}</span>}
              </>
            ) : (
              <>
                <strong>{directory || multiple ? `${fileNames.length} file${fileNames.length === 1 ? "" : "s"}` : fileNames[0]}</strong>
                <span className="cd-upload-zone__hint">{tr(replaceLabel, lang)}</span>
              </>
            )}
          </span>
          <input ref={inputRef} id={id} name={id} type="file" accept={accept} multiple={directory || multiple || undefined} className="cd-upload-zone__input" />
        </label>
        {hasFile && (
          <button
            type="button"
            className="cd-upload-zone__reset"
            title={tr(resetLabel, lang)}
            aria-label={tr(resetLabel, lang)}
            onClick={handleReset}
          >
            <ResetIcon />
          </button>
        )}
        {/* Shiny's own native upload-progress bar (its fileinput binding fills/shows this by id during the
            actual network transfer) -- nested inside the shell now, tucked against its bottom edge, instead of
            a separate line sitting below the box with its own gap. Hidden once hasFile flips true: Shiny's own
            JS shows this once an upload starts and never explicitly hides it again once done (confirmed live --
            it was sitting there permanently, fully filled, long after the upload had finished), and hasFile
            flips true at essentially the same moment (the native 'change' event that starts the upload is the
            same one this component's own handleChange() listens to), so this loses very little of the actual
            in-flight indication while getting rid of the stuck-visible artifact. */}
        {!hasFile && (
          <div id={`${id}_progress`} className="progress active shiny-file-input-progress cd-upload-progress">
            <div className="progress-bar" />
          </div>
        )}
      </div>
      {checklist && checklist.length > 0 && (
        <div className="cd-upload-checklist">
          {checklist.map((f) => (
            <div key={f.prefix} className={`cd-upload-checklist__item${f.present ? " cd-upload-checklist__item--found" : ""}`}>
              <span className="cd-upload-checklist__dot">{f.present && <CheckIcon />}</span>
              {tr(f.label, lang)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
