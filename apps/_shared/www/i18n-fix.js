// Works around a real bug in the shiny.i18n package's own bundled JS (shiny.i18n/www/shiny-i18n.js), not
// anything in this app's own code -- patched here rather than editing the installed package, which a package
// update/reinstall would silently undo.
//
// The bug: shinyi18n.receiveMessage() does `$(el).trigger('change')` with no extra data, and
// shinyi18n.subscribe() wires that straight to Shiny via `$(el).on('change', callback)`. jQuery always calls a
// 'change' listener with the native DOM Event object as its first argument -- but Shiny's own internal wiring
// (srcts/src/bindings/input/inputBinding.ts, roughly: `binding.subscribe(el, (priority) => ...)`) treats an
// input binding's callback's first argument AS the update's priority. So the raw Event object lands where a
// priority string ("immediate"/"event"/"deferred") is expected, and Shiny's own addDefaultInputOpts() throws
// "Unexpected input value mode: '[object Object]'" the moment the app's language changes (console: "[shiny]
// Error in inputBinding.receiveMessage()", Shiny's own per-binding error isolation, which is why this doesn't
// crash the rest of the page -- but it does mean the language-state input's own update is dropped every time).
//
// Fix: replace subscribe() so the 'change' handler calls the Shiny callback with no arguments at all, instead
// of forwarding jQuery's event object -- Shiny then falls back to its own default priority ("immediate"),
// which is exactly what a plain, unprioritized update should get anyway.
//
// shinyi18n may not exist yet when this runs (script load order isn't guaranteed against shiny.i18n's own
// htmlDependency) -- poll briefly instead of assuming it, the same retry pattern js/src/lang.ts already uses
// for Shiny.addCustomMessageHandler.
(function () {
  function patch() {
    if (window.shinyi18n && typeof window.shinyi18n.subscribe === "function") {
      window.shinyi18n.subscribe = function (el, callback) {
        $(el).on("change", function () {
          callback();
        });
      };
      return true;
    }
    return false;
  }

  if (!patch()) {
    var timer = setInterval(function () {
      if (patch()) clearInterval(timer);
    }, 50);
    setTimeout(function () {
      clearInterval(timer);
    }, 10000);
  }
})();
