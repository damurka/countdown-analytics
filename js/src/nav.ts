// The app shell's navigation: which Shiny tab (a cd_screen()'s tabName) is open, shared between the Sidebar and
// HeaderBar React roots -- two separate mounts, so this is a plain window event, the same pattern lang.ts uses
// for the language. Shiny itself never draws the sidebar any more (see _shared/R/layout/shell.R): switching the
// visible cd_screen() and setting input$tabs, which every page's server code already reads, are both done here.
import { useEffect, useState } from "react";
import type { LocalText } from "./lang";

export interface NavItem {
  key: string;
  tabName?: string;
  label: LocalText;
  /** The item's full Font Awesome class ("far fa-circle-check"), already resolved -- weight (outline where
   *  Font Awesome Free has one, solid otherwise) and alias ("check-circle" -> "circle-check") both -- by
   *  cd_nav_icon_class() (_shared/R/layout/shell.R) before this ever reaches React. Not a bare icon name: Sidebar.tsx
   *  renders it as the className directly, rather than guessing a weight itself. */
  icon?: string;
  children?: NavItem[];
  /** Only ever set on a section's own top-level items (cd_nav_item()'s own `requires_adjustment`, ui/react/
   *  cd-shell.R) -- explicit user request, "if data is not adjusted it cannot generate analysis". Sidebar.tsx
   *  resolves this once per top-level item (app.R's stricter `analysisReady` prop instead of `dataReady`) and
   *  passes the same resolved readiness down through its own existing recursion, so children inherit it
   *  without needing the flag set individually. */
  requiresAdjustment?: boolean;
}

export interface NavSection {
  label: LocalText;
  items: NavItem[];
}

const EVENT = "cd-tab";

export const currentTab = (): string => window.__cdTab || "";

// Phase 9 (sidebar locking): every tabName that stays reachable with no dataset loaded at all -- Introduction
// (nothing to gate) and Load Data itself (the one place a lock could ever be undone from). Every other item
// locks until app.R's own data-readiness condition is met (Sidebar.tsx's `dataReady` prop, driven from
// app.R's shared `data_ready` reactive -- the exact same "cache() exists AND cache()$countdown_data exists"
// check every page module's own `active = page_is(...)` already gates its real computation on, not
// `quality_confirmed`: a plain .dta/.rds upload sets countdown_data immediately but never runs the wizard's
// own Finish branch, so gating on quality_confirmed instead would have locked that path out permanently,
// confirmed live -- see page_is()'s own comment in app.R for the full reasoning this mirrors).
export const ALWAYS_UNLOCKED_TABS = ["introduction", "upload_data"];

/** Whether `tabName` is locked right now -- a leaf link's own tabName, plain undefined/"" (a group toggle,
 *  never itself a navigation target) reads as unlocked here, since Sidebar.tsx only ever calls this for an
 *  item that actually has a tabName to navigate to. */
export function isTabLocked(tabName: string | undefined, dataReady: boolean): boolean {
  if (!tabName) return false;
  if (dataReady) return false;
  return !ALWAYS_UNLOCKED_TABS.includes(tabName);
}

/** Sidebar.tsx calls this instead of setActiveTab() for a locked item's click -- a real Shiny event (not just
 *  a swallowed client-side no-op), so app.R can show the same translated notification toast the wizard rail's
 *  own locked-step click already does (err_wizard_step_locked's sibling, err_nav_locked). {priority: "event"}:
 *  fires every click even if the same locked tabName was just clicked again, matching every other one-shot
 *  signal in this codebase (FieldNumber.tsx's own `${id}_cleared`, etc.). */
export function notifyLockedNavClick(tabName: string): void {
  window.Shiny?.setInputValue?.("cd_locked_nav_click", tabName, { priority: "event" });
}

/** Shows the cd_screen() pane for `tabName` (a plain div.cd-page rendered by cd_screens() in app.R) and tells the
 *  server which tab is open, as input$tabs. .cd-page--active (styles.css) is what makes a page visible. */
export function setActiveTab(tabName: string): void {
  if (!tabName || tabName === window.__cdTab) return;
  window.__cdTab = tabName;
  const pane = document.getElementById(`cd-page-${tabName}`);
  if (pane) {
    document.querySelectorAll('.cd-pages > .cd-page.cd-page--active[id^="cd-page-"]').forEach((el) => el.classList.remove("cd-page--active"));
    pane.classList.add("cd-page--active");
  }
  window.Shiny?.setInputValue?.("tabs", tabName, { priority: "event" });
  window.dispatchEvent(new Event(EVENT));
  // Shiny only re-checks which outputs are hidden on a window resize; without this, outputs first laid out while
  // their page was display:none stay suspended (e.g. the region chip) and the page never finishes loading.
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
    (window as any).jQuery?.(window).trigger("resize");
  });
}

// Lets the server move the user to a different tab from a plain button click -- the Load Data landing page's
// "Continue to analysis" CTA (wizard_landing.R) is the one thing that needs this. A single, page-level
// registration, the same shape lang.ts's own cd-lang handler uses: appropriate here because navigation is one
// concern for the whole app, not something many mounted instances of the same component each need their own
// slice of (contrast useShinyMessage() in lang.ts, built for exactly that other case -- messagebox/
// cd-file-reset). Shiny may finish loading after this bundle, so retry briefly instead of assuming an order.
function registerNavigateHandler(): boolean {
  const shiny = window.Shiny;
  if (!shiny || !shiny.addCustomMessageHandler) return false;
  shiny.addCustomMessageHandler("cd-navigate", (tabName: unknown) => {
    setActiveTab(tabName as string);
  });
  return true;
}
if (!registerNavigateHandler()) {
  const timer = setInterval(() => {
    if (registerNavigateHandler()) clearInterval(timer);
  }, 50);
  setTimeout(() => clearInterval(timer), 10000);
}

export function useActiveTab(): string {
  const [tab, setTab] = useState(currentTab);
  useEffect(() => {
    const onChange = () => setTab(currentTab());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return tab;
}

/** The section and item an active tabName belongs to, searched recursively (groups can nest). */
export function findNavEntry(sections: NavSection[], tabName: string): { section: NavSection; item: NavItem } | null {
  const search = (items: NavItem[]): NavItem | null => {
    for (const item of items) {
      if (item.tabName === tabName) return item;
      if (item.children) {
        const hit = search(item.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const section of sections) {
    const item = search(section.items);
    if (item) return { section, item };
  }
  return null;
}

/** The chain of ancestor group keys an active tab sits under, so their <ul> can start expanded. */
export function ancestorGroups(sections: NavSection[], tabName: string): Set<string> {
  const out = new Set<string>();
  const walk = (items: NavItem[], trail: string[]): boolean => {
    for (const item of items) {
      const next = [...trail, item.key];
      if (item.tabName === tabName) {
        trail.forEach((k) => out.add(k));
        return true;
      }
      if (item.children && walk(item.children, next)) {
        trail.forEach((k) => out.add(k));
        return true;
      }
    }
    return false;
  };
  sections.forEach((s) => walk(s.items, []));
  return out;
}

const COLLAPSE_EVENT = "cd-sidebar-collapse";

export const sidebarCollapsed = (): boolean => !!window.__cdSidebarCollapsed;

// The <script src="cd-react.js"> tag (a shiny.react htmlDependency) sits in <head>, ahead of <body> in the
// document -- so anything that can run before the page finishes loading (initResponsiveCollapse() below, at
// module scope, runs the moment the bundle does) must not assume document.body already exists yet.
function applyBodyClass(): void {
  document.body.classList.toggle("sidebar-collapse", !!window.__cdSidebarCollapsed);
}

/** Toggles the icon-only rail (Narrow.dc.html): 64px wide. Same window-event pattern as setActiveTab()/EVENT
 *  above -- Sidebar and HeaderBar are separate React roots, and only body-level CSS (see styles.css's
 *  body.sidebar-collapse rules) actually needs the state, but both components re-render off it (HeaderBar to
 *  flip the toggle button's aria-pressed). */
export function setSidebarCollapsed(collapsed: boolean): void {
  if (collapsed === !!window.__cdSidebarCollapsed) return;
  window.__cdSidebarCollapsed = collapsed;
  if (document.body) applyBodyClass();
  // addEventListener with the same function reference is a no-op past the first call, so repeated early calls
  // (e.g. the matchMedia listener firing again before load) don't stack up duplicate listeners.
  else document.addEventListener("DOMContentLoaded", applyBodyClass, { once: true });
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
  // Whatever the hover-preview drawer (below) was doing, a collapse-state change makes it stale -- either the
  // rail just appeared (nothing to preview yet) or it just disappeared (the full sidebar is already showing).
  closeSidebarHoverPreview(true);
}

export function toggleSidebarCollapsed(): void {
  setSidebarCollapsed(!sidebarCollapsed());
}

export function useSidebarCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);
  useEffect(() => {
    const onChange = () => setCollapsed(sidebarCollapsed());
    window.addEventListener(COLLAPSE_EVENT, onChange);
    return () => window.removeEventListener(COLLAPSE_EVENT, onChange);
  }, []);
  return collapsed;
}

// Hovering the collapsed rail (or the header's toggle button) previews the FULL expanded menu as a drawer
// overlaid on top of the content, rather than reflowing the page -- retracts back to the icon rail once the
// pointer leaves both. This replaced an earlier per-group click-to-open flyout popover: that needed
// position:absolute content to spill outside the 64px rail, which forced .cd-shell__sidebar's overflow-y:auto
// to also treat overflow-x as auto (per the CSS overflow spec, an axis left "visible" while the other isn't
// becomes "auto" too), adding an unwanted horizontal scrollbar. The whole-drawer approach never needs to
// overflow its own box, so there's nothing left to clip or scroll sideways.
const HOVER_EVENT = "cd-sidebar-hover";
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;

export const sidebarHoverOpen = (): boolean => !!window.__cdSidebarHoverOpen;

function applyHoverOpen(open: boolean): void {
  window.__cdSidebarHoverOpen = open;
  // Hover events only ever fire after the page has actually loaded and rendered, unlike setSidebarCollapsed()'s
  // very first automatic call (see initResponsiveCollapse()) -- document.body is always safe to touch here.
  document.body.classList.toggle("sidebar-hover-open", open);
  window.dispatchEvent(new Event(HOVER_EVENT));
}

/** mouseenter or click of the header's toggle button -- the only thing that opens this particular drawer (the
 *  entire nav tree, overlaid on the sidebar's own position). A no-op when the sidebar isn't actually collapsed
 *  -- there's nothing to preview, the full menu is already showing in place. Deliberately not triggered by
 *  hovering the sidebar/rail itself (see retainSidebarHoverPreview()) or by a rail item's own click, which
 *  opens a much smaller, per-group flyout instead (Sidebar.tsx) -- unrelated to this drawer. */
export function openSidebarHoverPreview(): void {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
  if (!sidebarCollapsed() || sidebarHoverOpen()) return;
  applyHoverOpen(true);
}

/** mouseenter of the sidebar/rail itself. Only cancels a pending close, never opens the drawer on its own --
 *  hovering individual rail icons should just highlight them (plain CSS :hover), not balloon into the full
 *  drawer on every pass of the mouse. Once the drawer IS open (opened via the toggle button, or a rail item's
 *  click), this is what keeps it open while the pointer sits on it. */
export function retainSidebarHoverPreview(): void {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
}

/** mouseleave of either, an outside click, or Escape (see Sidebar.tsx). `immediate` skips the grace period --
 *  used when the state itself just became irrelevant (collapse toggled, or the user actually navigated), not
 *  when the pointer might still be about to re-enter a *different* part of the same drawer. The grace period
 *  otherwise absorbs the gap between the toggle button and the sidebar (two separate elements, not adjacent in
 *  the DOM), so moving the pointer from one to the other doesn't flicker the drawer shut and back open. */
export function closeSidebarHoverPreview(immediate = false): void {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
  if (!sidebarHoverOpen()) return;
  if (immediate) {
    applyHoverOpen(false);
    return;
  }
  hoverCloseTimer = setTimeout(() => {
    applyHoverOpen(false);
    hoverCloseTimer = null;
  }, 200);
}

export function useSidebarHoverOpen(): boolean {
  const [open, setOpen] = useState(sidebarHoverOpen);
  useEffect(() => {
    const onChange = () => setOpen(sidebarHoverOpen());
    window.addEventListener(HOVER_EVENT, onChange);
    return () => window.removeEventListener(HOVER_EVENT, onChange);
  }, []);
  return open;
}

// Below this width the wide sidebar (272px) plus a chart's own content stops being comfortable -- narrow the
// rail automatically, same as Narrow.dc.html's own breakpoint, rather than requiring a manual click every time
// the window is resized. init() runs once (module-level, not per-component-mount, since Sidebar.tsx and
// HeaderBar.tsx both import this module but only one instance of the browser's matchMedia list should exist).
// A later manual toggle (setSidebarCollapsed()) still works and sticks until the query's match actually flips
// (i.e. the window crosses back over the breakpoint) -- it doesn't fight every intermediate resize event.
const COLLAPSE_QUERY = "(max-width: 1099px)";

// Whether the header's own buttons/title/pill go compact -- a SEPARATE body class from sidebar-collapse above,
// even though the same matchMedia query drives both by default. Deliberately not exported: nothing should set
// this except the responsive listener. Collapsing the sidebar *frees up* width rather than needing it, so a
// manual hamburger click toggling this too was backwards -- it made the header shrink right when there was
// more room for it, for a click that's meant to be a plain retract/expand of the sidebar and nothing else.
function applyHeaderCompactClass(): void {
  document.body.classList.toggle("header-compact", !!window.__cdHeaderCompact);
}
function setHeaderCompact(compact: boolean): void {
  if (compact === !!window.__cdHeaderCompact) return;
  window.__cdHeaderCompact = compact;
  if (document.body) applyHeaderCompactClass();
  else document.addEventListener("DOMContentLoaded", applyHeaderCompactClass, { once: true });
}

function initResponsiveCollapse(): void {
  if (typeof window.matchMedia !== "function") return;
  const mq = window.matchMedia(COLLAPSE_QUERY);
  setSidebarCollapsed(mq.matches);
  setHeaderCompact(mq.matches);
  mq.addEventListener("change", (e) => {
    setSidebarCollapsed(e.matches);
    setHeaderCompact(e.matches);
  });
}
initResponsiveCollapse();

declare global {
  interface Window {
    __cdTab?: string;
    __cdSidebarCollapsed?: boolean;
    __cdHeaderCompact?: boolean;
    __cdSidebarHoverOpen?: boolean;
  }
}
