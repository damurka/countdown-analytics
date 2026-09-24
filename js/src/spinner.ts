// Toggles a .cd-spinner-wrap's own "cd-spinner-wrap--busy" class in response to Shiny's own per-output
// lifecycle events -- the same ones shinycssloaders' own JS listens for. This is what actually shows/hides
// LoadingSkeleton.tsx's overlay (cd_spinner(), _shared/R/core (and components/)), replacing shinycssloaders entirely
// (explicit user request, "replace all withSpinner ... use react component" -- LoadingSkeleton.tsx is the
// react component; this file is the plumbing that decides when to show it, no React state involved since
// nothing here needs to re-render, only toggle a class).
//
// Listened for through jQuery, not native document.addEventListener: shiny.js bundles its own copy of
// jQuery and dispatches "shiny:recalculating"/"shiny:value"/"shiny:error" through it (the same mechanism
// shinycssloaders itself relies on) -- the library that fires a custom event is the one guaranteed to
// deliver it to a same-library listener; a native listener has no such guarantee for an event that may never
// reach the browser's own dispatch path. jQuery is a hard Shiny dependency and always present once the page
// is usable, but script load ORDER between this bundle and jQuery isn't guaranteed, so this retries briefly
// rather than assuming window.jQuery is already set the instant this module evaluates.
function bindSpinnerEvents() {
  const jq = (window as { jQuery?: any }).jQuery;
  if (!jq) {
    setTimeout(bindSpinnerEvents, 50);
    return;
  }

  const wrapOf = (target: unknown): HTMLElement | null =>
    target instanceof Element ? (target.closest(".cd-spinner-wrap") as HTMLElement | null) : null;

  // The skeleton only appears if the output is still not back after SHOW_AFTER_MS. Coming back to a page or an
  // input re-asks for outputs Shiny already has (or the server has cached) and those answer within a few tens of
  // milliseconds: flashing a skeleton for that long is what read as the chart "reloading".
  const SHOW_AFTER_MS = 700;
  const timers = new WeakMap<Element, number>();
  const cancel = (wrap: HTMLElement | null) => {
    if (!wrap) return;
    const t = timers.get(wrap);
    if (t !== undefined) {
      window.clearTimeout(t);
      timers.delete(wrap);
    }
  };
  jq(document).on("shiny:recalculating", (e: { target: unknown }) => {
    const wrap = wrapOf(e.target);
    if (!wrap) return;
    cancel(wrap);
    timers.set(
      wrap,
      window.setTimeout(() => {
        timers.delete(wrap);
        wrap.classList.remove("cd-spinner-wrap--init");
        wrap.classList.add("cd-spinner-wrap--busy");
      }, SHOW_AFTER_MS),
    );
  });
  // A "silent" error (req()/validate() with no message: the inputs for this output aren't ready yet) is not a
  // result -- keep the skeleton up instead of dropping to a blank box, and let the value that follows clear it.
  const isSilent = (e: { error?: { message?: string; type?: string | string[] } }) => {
    const err = e.error;
    if (!err) return false;
    const type = Array.isArray(err.type) ? err.type : [err.type];
    return type.includes("shiny.silent.error") || !err.message;
  };
  // An empty value (null) is what an output sends while the inputs it needs are not ready yet -- not content. Keep
  // the skeleton up for it (the real value follows and clears it), but only for so long: a page whose output is
  // genuinely empty must not stay on "loading" for ever.
  const EMPTY_GRACE_MS = 4000;
  jq(document).on("shiny:value", (e: { target: unknown; value?: unknown }) => {
    const wrap = wrapOf(e.target);
    if (!wrap) return;
    cancel(wrap);
    const clear = () => wrap.classList.remove("cd-spinner-wrap--busy", "cd-spinner-wrap--init");
    if (e.value === null || e.value === undefined) {
      wrap.classList.add("cd-spinner-wrap--busy");
      timers.set(wrap, window.setTimeout(() => { timers.delete(wrap); clear(); }, EMPTY_GRACE_MS));
    } else {
      clear();
    }
  });
  jq(document).on("shiny:error", (e: { target: unknown; error?: { message?: string; type?: string | string[] } }) => {
    const wrap = wrapOf(e.target);
    if (isSilent(e)) {
      // Not ready (or its page was left): show the loader now, so that when the output is next visible the
      // loader is already what's there, not an empty box until the recalculation is reported.
      cancel(wrap);
      wrap?.classList.remove("cd-spinner-wrap--init");
      wrap?.classList.add("cd-spinner-wrap--busy");
      return;
    }
    cancel(wrap);
    wrap?.classList.remove("cd-spinner-wrap--busy", "cd-spinner-wrap--init");
  });
}
bindSpinnerEvents();
