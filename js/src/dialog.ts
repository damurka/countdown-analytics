// Behaviour for cd_dialog() (apps/rmncah/_shared/R/core (and components/)), the app's own replacement for shiny::modalDialog().
// The dialog itself is server-rendered markup inserted with insertUI() -- so Shiny binds every input inside it
// exactly as it did inside showModal() -- and this file only does what needs a browser: close it on its own
// close buttons, on Escape, and on a click on the backdrop when the dialog says it may (data-easy-close).

function closeDialog(el: Element | null): void {
  if (!el) return;
  const shiny = window.Shiny as { unbindAll?: (scope?: Element) => void } | undefined;
  shiny?.unbindAll?.(el);
  el.remove();
}

document.addEventListener("click", (e) => {
  const target = e.target as Element | null;
  if (!target?.closest) return;
  if (target.closest("[data-cd-dialog-close]")) {
    closeDialog(target.closest(".cd-dialog-backdrop"));
    return;
  }
  // A click on the dim backdrop itself (not on anything inside the dialog).
  if (target.classList.contains("cd-dialog-backdrop") && target.getAttribute("data-easy-close") === "true") {
    closeDialog(target);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const dlg = document.querySelector('.cd-dialog-backdrop[data-easy-close="true"]');
  if (dlg) closeDialog(dlg);
});

// cd_dialog() bodies can hold a block that only shows for one value of a Shiny input, the way
// shiny::conditionalPanel() did: <div data-cd-show-when="<full input id>" data-cd-show-value="<value>">. Follows
// every input change (jQuery, like spinner.ts -- shiny.js dispatches its events through its own jQuery).
const inputValues: Record<string, unknown> = {};
function applyShowWhen(): void {
  document.querySelectorAll<HTMLElement>("[data-cd-show-when]").forEach((el) => {
    const name = el.getAttribute("data-cd-show-when") as string;
    el.style.display = String(inputValues[name]) === el.getAttribute("data-cd-show-value") ? "" : "none";
  });
}
function bindShowWhen(): void {
  const jq = (window as { jQuery?: any }).jQuery;
  if (!jq) {
    setTimeout(bindShowWhen, 50);
    return;
  }
  jq(document).on("shiny:inputchanged", (e: { name: string; value: unknown }) => {
    inputValues[e.name] = e.value;
    applyShowWhen();
  });
  // The bundle loads in <head>, before <body> exists.
  const watch = () => new MutationObserver(applyShowWhen).observe(document.body, { childList: true, subtree: true });
  if (document.body) watch();
  else document.addEventListener("DOMContentLoaded", watch);
}
bindShowWhen();
