import React from "react";
import { tr, useLang, useMountSignal } from "../lang";
import type { LocalText } from "../lang";
import { usePopover } from "../usePopover";
import {
  closeSidebarHoverPreview,
  findNavEntry,
  openSidebarHoverPreview,
  toggleSidebarCollapsed,
  useActiveTab,
  useSidebarCollapsed,
} from "../nav";
import type { NavSection } from "../nav";

// Two separate mounts either side of a plain CSS spacer (see cd_app_bar() in cd-shell.R), not one component
// with an internal spacer: an internal flex-grow spacer here only pushed content to the edge of *this*
// component's own box, which sits inside a Shiny uiOutput wrapper that in turn sits inside .cd-navbar --
// nested flex-grow across that Shiny/React boundary didn't actually reach .cd-navbar's real right edge, so
// the toggle/breadcrumb and the language/Ask AI buttons rendered bunched together on the left instead of the
// latter grouping with the dataset pill/Download report on the right. One spacer at the flat .cd-navbar level
// (a plain div, proven to work: it's what already puts the daylight between this whole header-react block and
// the pill/download block today) sidesteps the nesting problem entirely.

export interface HeaderBreadcrumbProps {
  id?: string;
  sections: NavSection[];
}

const icon = (paths: string[], size = 18) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths.map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);
const ChevronRight = () => icon(["M9 6l6 6-6 6"], 14);
const MenuIcon = () => icon(["M3 6h18M3 12h18M3 18h18"], 20);
const GlobeIcon = () => icon(["M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18", "M12 3a9 9 0 100 18 9 9 0 000-18z"]);
const SparkleIcon = () =>
  icon(["M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"]);

// Left side: sidebar toggle + breadcrumb.
export function HeaderBreadcrumb({ id, sections }: HeaderBreadcrumbProps) {
  useMountSignal(id);
  const lang = useLang();
  const activeTab = useActiveTab();
  const collapsed = useSidebarCollapsed();
  const entry = activeTab ? findNavEntry(sections, activeTab) : null;

  return (
    <div className="cd-header-crumb-inner">
            <a
        href="#"
        className="cd-shell__toggle"
        role="button"
        aria-expanded={!collapsed}
        aria-label="Toggle sidebar"
        onClick={(e) => {
          e.preventDefault();
          toggleSidebarCollapsed();
        }}
        onMouseEnter={openSidebarHoverPreview}
        onMouseLeave={() => closeSidebarHoverPreview()}
      >
        <MenuIcon />
        <span className="cd-visually-hidden">Toggle navigation</span>
      </a>
      {entry && (
        <div className="cd-breadcrumb">
          <span className="cd-breadcrumb__part">{tr(entry.section.label, lang)}</span>
          <span className="cd-breadcrumb__sep">
            <ChevronRight />
          </span>
          <span className="cd-breadcrumb__current">{tr(entry.item.label, lang)}</span>
        </div>
      )}
    </div>
  );
}

export interface HeaderActionsProps {
  id?: string;
  askAiLabel: LocalText;
  askAiHint: LocalText;
  languages: { key: string; text: LocalText; flag?: string }[];
}

// Right side: language switcher + Ask AI, grouped next to the dataset pill/Download report (see cd-header-shiny
// in cd-shell.R, right after this in the DOM).
export function HeaderActions({ id, askAiLabel, askAiHint, languages }: HeaderActionsProps) {
  useMountSignal(id);
  // The page's language, not a prop: it must follow window.cdLang live, the same signal every chip's own text
  // already follows (see lang.ts), not the value this component happened to mount with.
  const lang = useLang();
  const langPop = usePopover();
  const current = languages.find((l) => l.key === lang) ?? languages[0];

  const chooseLanguage = (key: string) => {
    window.Shiny?.setInputValue?.("selected_language", key, { priority: "event" });
    langPop.close(true);
  };

  return (
    // A real flex row, not a fragment relying on display:contents to promote its children into .cd-navbar's own
    // flex row: that promotion is inconsistently supported across embedded Chromium builds (this project has
    // already hit browser-specific quirks once, in the stale-cache issue), so this owns its own layout instead.
    <div className="cd-header-actions-inner">
      <span ref={langPop.rootRef} className="cd-chipwrap">
        <button
          ref={langPop.triggerRef}
          type="button"
          className={`cd-hdr-btn cd-hdr-btn--outline${langPop.open ? " cd-chip--open" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={langPop.open}
          onClick={() => langPop.setOpen(!langPop.open)}
        >
          {/* The current language's own flag, not a generic globe -- it's a faster visual cue for "which
              language is this" than the code alone, and doubles as an icon nobody has to read. Falls back to
              the globe for a language with no flag entry, so this never renders an empty button. */}
          {current?.flag ? (
            <span className="cd-flag" aria-hidden="true">{current.flag}</span>
          ) : (
            <GlobeIcon />
          )}
          {/* cd-hdr-btn__label, not a bare span: body.header-compact's CSS hides this specifically to go
              icon-only -- a bare "span" selector would (and, before this, did) also hit the flag span above,
              same bug the Download report button just had with its own icon-wrapping span. */}
          <span className="cd-hdr-btn__label">{tr(current?.text, lang) || current?.key?.toUpperCase()}</span>
        </button>
        {langPop.open && (
          <div ref={langPop.popRef} className={`cd-pop${langPop.align === "right" ? " cd-pop--right" : ""}`} style={{ top: 42, minWidth: 140 }}>
            <div className="cd-list">
              {languages.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  className={`cd-opt${l.key === lang ? " cd-opt--on" : ""}`}
                  onClick={() => chooseLanguage(l.key)}
                >
                  {/* .cd-opt is display:flex; justify-content:space-between (it also lays out a leading
                      checkbox/trailing checkmark elsewhere -- see OptionList.tsx), so the flag and the text
                      need to be one flex item together here, not two separate ones space-between would push
                      apart. */}
                  <span className="cd-opt__lead">
                    {l.flag && <span className="cd-flag" aria-hidden="true">{l.flag}</span>}
                    <span>{tr(l.text, lang)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </span>
      <button type="button" className="cd-hdr-btn cd-hdr-btn--accent" title={tr(askAiHint, lang)}>
        <SparkleIcon />
        <span className="cd-hdr-btn__label">{tr(askAiLabel, lang)}</span>
      </button>
    </div>
  );
}
