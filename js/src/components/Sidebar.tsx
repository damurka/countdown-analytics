import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tr, useLang, useMountSignal } from "../lang";
import type { LocalText } from "../lang";
import {
  ancestorGroups,
  closeSidebarHoverPreview,
  isTabLocked,
  notifyLockedNavClick,
  retainSidebarHoverPreview,
  setActiveTab,
  useActiveTab,
  useSidebarCollapsed,
  useSidebarHoverOpen,
} from "../nav";
import type { NavItem, NavSection } from "../nav";

export interface SidebarProps {
  id?: string;
  sections: NavSection[];
  initialTab: string;
  docsLabel: LocalText;
  docsHref?: string;
  /** Phase 9: whether a dataset has actually finished loading (app.R's own `data_ready` reactive) -- while
   *  false, every item except Introduction/Load Data (nav.ts's own ALWAYS_UNLOCKED_TABS) renders locked. */
  dataReady?: boolean;
  /** Stricter than dataReady -- explicit user request, "if data is not adjusted it cannot generate analysis,
   *  so continue to have grayed out ... on the sidemenu from denominator down till adjustment is done"
   *  (app.R's own `analysis_ready` reactive). Used instead of dataReady for any top-level item cd_nav_item()
   *  marked `requiresAdjustment` (and everything nested under it) -- see the three sections.map() call sites
   *  below, the only place this is actually read. */
  analysisReady?: boolean;
}

/** Navigates for an unlocked click, or signals the server for a locked one (nav.ts's own notifyLockedNavClick,
 *  shown as a toast) instead -- shared by NavLink/RailItem/FlyoutItem so all three lock consistently. */
function handleNavClick(tabName: string | undefined, dataReady: boolean): void {
  if (!tabName) return;
  if (isTabLocked(tabName, dataReady)) {
    notifyLockedNavClick(tabName);
    return;
  }
  setActiveTab(tabName);
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="cd-nav__chev"
    style={{ transform: open ? "rotate(90deg)" : undefined }}
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

// A closed padlock -- shown on every locked item (leaf or group), alongside the dimmed/not-allowed styling
// (styles.css's own .cd-nav__link--locked etc.), not instead of it. Explicit user request: dimming alone
// wasn't a clear enough signal, and a group header (e.g. "Data Quality Assessment") wasn't dimmed at all --
// every item inside a group locks the SAME way its parent does (isTabLocked() only ever exempts two specific,
// always-top-level tabNames, never anything nested), so the group header shows this exactly when its own
// children would, no per-child check needed.
const LockIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="cd-nav__lock"
  >
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

function NavLink({ item, depth, activeTab, openGroups, onToggleGroup, dataReady, lang }: {
  item: NavItem;
  depth: number;
  activeTab: string;
  openGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  dataReady: boolean;
  lang: string;
}) {
  const hasChildren = !!item.children && item.children.length > 0;
  const isActive = item.tabName === activeTab;
  const isOpen = openGroups.has(item.key);

  if (hasChildren) {
    // The group TOGGLE itself still opens/closes (isTabLocked() only ever exempts a leaf tabName, and opening
    // a group navigates nowhere on its own) -- but it shows the same dimmed/locked visual treatment as its
    // children whenever they're locked, plus the lock icon in place of its own chevron, so a collapsed group
    // reads as locked WITHOUT having to open it first to discover that every item inside is. Explicit user
    // request: a group header wasn't grayed out at all before this, the only inconsistent-looking item in an
    // otherwise fully locked sidebar.
    const groupLocked = !dataReady;
    return (
      <li className={`cd-nav__group${isOpen ? " cd-nav__group--open" : ""}`}>
        <a
          href="#"
          className={`cd-nav__link${groupLocked ? " cd-nav__link--locked" : ""}`}
          aria-expanded={isOpen}
          onClick={(e) => {
            e.preventDefault();
            onToggleGroup(item.key);
          }}
        >
          {item.icon && (
            <span className="cd-nav__icon">
              <i className={item.icon} aria-hidden="true" />
            </span>
          )}
          <span className="cd-nav__text">{tr(item.label, lang)}</span>
          {groupLocked ? <LockIcon /> : <Chevron open={isOpen} />}
        </a>
        {isOpen && (
          <ul className="cd-nav__children">
            {item.children!.map((child) => (
              <NavLink
                key={child.key}
                item={child}
                depth={depth + 1}
                activeTab={activeTab}
                openGroups={openGroups}
                onToggleGroup={onToggleGroup}
                dataReady={dataReady}
                lang={lang}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const locked = isTabLocked(item.tabName, dataReady);

  return (
    <li className={isActive ? "cd-nav__item--active" : undefined}>
      <a
        href="#"
        className={`cd-nav__link${isActive ? " cd-nav__link--active" : ""}${locked ? " cd-nav__link--locked" : ""}`}
        aria-current={isActive ? "page" : undefined}
        aria-disabled={locked ? "true" : undefined}
        onClick={(e) => {
          e.preventDefault();
          handleNavClick(item.tabName, dataReady);
        }}
      >
        {isActive && <span className="cd-nav__dot" />}
        {item.icon && (
          <span className="cd-nav__icon">
            <i className={item.icon} aria-hidden="true" />
          </span>
        )}
        <span className="cd-nav__text">{tr(item.label, lang)}</span>
        {locked && <LockIcon />}
      </a>
    </li>
  );
}

// Icon-only rail (Narrow.dc.html): each item is a 40x40 button. A group's children show in a small flyout
// next to its icon on hover or click (see Sidebar's flyout state/portal below) -- NOT nested inside this <li>:
// an in-DOM absolutely-positioned flyout spilling outside the 64px rail fought the sidebar's own vertical
// scrollbar (overflow-y:auto implicitly makes overflow-x auto too, so the spillover added a horizontal
// scrollbar). Portalled to document.body instead, it's not a descendant of the scroll container at all.
function RailItem({ item, activeTab, isFlyoutOpen, onEnter, onLeave, onClick, dataReady, lang }: {
  item: NavItem;
  activeTab: string;
  isFlyoutOpen: boolean;
  onEnter: (item: NavItem, el: HTMLElement) => void;
  onLeave: () => void;
  onClick: (item: NavItem, el: HTMLElement) => void;
  dataReady: boolean;
  lang: string;
}) {
  const hasChildren = !!item.children && item.children.length > 0;
  const isActive = item.tabName === activeTab || (hasChildren && item.children!.some((c) => c.tabName === activeTab));
  const label = tr(item.label, lang);
  // A group's own rail button still opens its flyout either way (same reasoning as NavLink's group branch),
  // but shows the same locked treatment as its children whenever they're locked -- a small badge (the rail has
  // no room for a full inline icon+label+lock row the way the expanded sidebar does) rather than nothing at
  // all, matching the same "don't have to open it first to find out" reasoning too.
  const locked = hasChildren ? !dataReady : isTabLocked(item.tabName, dataReady);

  return (
    <li className="cd-nav__rail-item">
      <a
        href="#"
        className={`cd-nav__rail-btn${isActive ? " cd-nav__rail-btn--active" : ""}${locked ? " cd-nav__rail-btn--locked" : ""}`}
        aria-label={label}
        title={label}
        aria-haspopup={hasChildren ? "true" : undefined}
        aria-expanded={hasChildren ? isFlyoutOpen : undefined}
        aria-current={!hasChildren && isActive ? "page" : undefined}
        aria-disabled={locked ? "true" : undefined}
        onMouseEnter={hasChildren ? (e) => onEnter(item, e.currentTarget) : undefined}
        onMouseLeave={hasChildren ? onLeave : undefined}
        onClick={(e) => {
          e.preventDefault();
          if (hasChildren) onClick(item, e.currentTarget);
          else handleNavClick(item.tabName, dataReady);
        }}
      >
        {isActive && <span className="cd-nav__dot" />}
        {item.icon && <i className={item.icon} aria-hidden="true" />}
        {locked && (
          <span className="cd-nav__rail-lock">
            <LockIcon />
          </span>
        )}
      </a>
    </li>
  );
}

interface FlyoutState {
  item: NavItem;
  left: number;
  top: number;
}

// One entry in the rail's flyout popup -- recursive, so a child that is itself a group (nesting >1 level deep,
// e.g. National Analysis > Inequality > Routine/Survey Data) gets shown too, not silently dropped. Was a flat
// .map() over flyout.item.children treating every child as a leaf link: a grandchild group rendered as a link
// with no tabName (so clicking it did nothing) and its own children never appeared anywhere in the flyout at
// all -- the deepest level was simply unreachable from the collapsed rail. A second cascading flyout-of-a-
// flyout would work too, but is awkward to hover/click through on a touch screen; a labeled sub-section
// indented within the same popup (matching how the *expanded* sidebar's own NavLink already nests arbitrarily
// deep via .cd-nav__children) keeps it one predictable panel instead.
function FlyoutItem({ item, activeTab, onNavigate, dataReady, lang }: {
  item: NavItem;
  activeTab: string;
  onNavigate: (tabName: string) => void;
  dataReady: boolean;
  lang: string;
}) {
  const hasChildren = !!item.children && item.children.length > 0;
  if (hasChildren) {
    return (
      <div className="cd-nav__flyout-group">
        <div className="cd-nav__flyout-sublabel">{tr(item.label, lang)}</div>
        {item.children!.map((child) => (
          <FlyoutItem key={child.key} item={child} activeTab={activeTab} onNavigate={onNavigate} dataReady={dataReady} lang={lang} />
        ))}
      </div>
    );
  }
  const active = item.tabName === activeTab;
  const locked = isTabLocked(item.tabName, dataReady);
  return (
    <a
      href="#"
      role="menuitem"
      className={`cd-nav__flyout-link${active ? " cd-nav__flyout-link--active" : ""}${locked ? " cd-nav__flyout-link--locked" : ""}`}
      aria-disabled={locked ? "true" : undefined}
      onClick={(e) => {
        e.preventDefault();
        if (!item.tabName) return;
        if (locked) {
          notifyLockedNavClick(item.tabName);
          return;
        }
        onNavigate(item.tabName);
      }}
    >
      {active && <span className="cd-nav__dot" />}
      <span>{tr(item.label, lang)}</span>
      {locked && <LockIcon />}
    </a>
  );
}

export default function Sidebar({ id, sections, initialTab, docsLabel, docsHref, dataReady = true, analysisReady = true }: SidebarProps) {
  useMountSignal(id);
  const lang = useLang();
  const activeTab = useActiveTab();
  const collapsed = useSidebarCollapsed();
  const hoverOpen = useSidebarHoverOpen();
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => ancestorGroups(sections, window.__cdTab || initialTab));
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const flyoutCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The rail (icon-only) shows only while collapsed and not being previewed via the header's toggle button;
  // otherwise the full tree does -- whether that's because the sidebar was never collapsed, or hovering/
  // clicking the toggle button opened the drawer (see nav.ts's openSidebarHoverPreview()).
  const showRail = collapsed && !hoverOpen;

  useEffect(() => {
    // Only on the very first mount. The server re-renders this element whenever dataReady/analysisReady change
    // (e.g. the moment Adjust Data finishes), which can remount it -- and re-applying initialTab then threw the
    // user back to Load Data from whatever page they were on.
    if (window.__cdTab) return;
    setActiveTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The full drawer (hoverOpen) replaces the rail entirely, so any small per-group flyout left open from just
  // before that happened is now meaningless -- close it. Also closes it on navigate-away or collapse changing.
  useEffect(() => {
    setFlyout(null);
  }, [hoverOpen, collapsed, activeTab]);

  // Outside click and Escape close the hover-preview drawer -- clicking the header's toggle button itself is
  // a separate, real setSidebarCollapsed() action (see HeaderBreadcrumb.tsx) that already closes this on its
  // own (nav.ts's setSidebarCollapsed() does that directly), so this only needs to handle everything else.
  useEffect(() => {
    if (!hoverOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeSidebarHoverPreview(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebarHoverPreview(true);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [hoverOpen]);

  // Same idea, one level down, for the small per-group flyout: a click outside it (the portal isn't a DOM
  // descendant of rootRef, so it needs its own check) or Escape closes it immediately.
  useEffect(() => {
    if (!flyout) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return; // a rail item's own click handles itself
      if ((e.target as HTMLElement).closest?.(".cd-nav__flyout")) return;
      setFlyout(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFlyout(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [flyout]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const positionFlyout = (item: NavItem, el: HTMLElement): FlyoutState => {
    const rect = el.getBoundingClientRect();
    return { item, left: rect.right + 8, top: rect.top };
  };

  const onRailGroupEnter = (item: NavItem, el: HTMLElement) => {
    if (flyoutCloseTimer.current) {
      clearTimeout(flyoutCloseTimer.current);
      flyoutCloseTimer.current = null;
    }
    setFlyout(positionFlyout(item, el));
  };
  const onRailGroupLeave = () => {
    if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
    flyoutCloseTimer.current = setTimeout(() => {
      setFlyout(null);
      flyoutCloseTimer.current = null;
    }, 150);
  };
  // A click (not just hover) toggling the same flyout -- for touch/keyboard users, and so clicking an already-
  // open group's icon again closes it instead of just re-opening the same thing.
  const onRailGroupClick = (item: NavItem, el: HTMLElement) => {
    setFlyout((prev) => (prev?.item.key === item.key ? null : positionFlyout(item, el)));
  };

  return (
    <div
      ref={rootRef}
      onMouseEnter={retainSidebarHoverPreview}
      onMouseLeave={() => closeSidebarHoverPreview()}
    >
      {showRail ? (
        <nav aria-label="Main" className="cd-nav cd-nav--collapsed">
          {sections.map((section, i) => (
            <ul key={i} className="cd-nav__list cd-nav__list--collapsed">
              {section.items.map((item) => (
                <RailItem
                  key={item.key}
                  item={item}
                  activeTab={activeTab}
                  isFlyoutOpen={flyout?.item.key === item.key}
                  onEnter={onRailGroupEnter}
                  onLeave={onRailGroupLeave}
                  onClick={onRailGroupClick}
                  dataReady={item.requiresAdjustment ? analysisReady : dataReady}
                  lang={lang}
                />
              ))}
            </ul>
          ))}
        </nav>
      ) : (
        <nav aria-label="Main" className="cd-nav">
          {sections.map((section, i) => (
            <React.Fragment key={i}>
              <div className="cd-nav__section">{tr(section.label, lang)}</div>
              <ul className="cd-nav__list">
                {section.items.map((item) => (
                  <NavLink
                    key={item.key}
                    item={item}
                    depth={0}
                    activeTab={activeTab}
                    openGroups={openGroups}
                    onToggleGroup={toggleGroup}
                    dataReady={item.requiresAdjustment ? analysisReady : dataReady}
                    lang={lang}
                  />
                ))}
              </ul>
            </React.Fragment>
          ))}
        </nav>
      )}
      {docsHref && (
        <div className="cd-sidebar__footer">
          <a
            href={docsHref}
            target="_blank"
            rel="noreferrer"
            title={showRail ? tr(docsLabel, lang) : undefined}
            aria-label={showRail ? tr(docsLabel, lang) : undefined}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 012-2h13" />
            </svg>
            {!showRail && <span>{tr(docsLabel, lang)}</span>}
          </a>
        </div>
      )}
      {flyout &&
        createPortal(
          <div
            className="cd-nav__flyout"
            role="menu"
            style={{ left: flyout.left, top: flyout.top }}
            onMouseEnter={() => {
              if (flyoutCloseTimer.current) {
                clearTimeout(flyoutCloseTimer.current);
                flyoutCloseTimer.current = null;
              }
            }}
            onMouseLeave={onRailGroupLeave}
          >
            <div className="cd-nav__flyout-label">{tr(flyout.item.label, lang)}</div>
            {flyout.item.children!.map((child) => (
              <FlyoutItem
                key={child.key}
                item={child}
                activeTab={activeTab}
                onNavigate={(tabName) => {
                  setActiveTab(tabName);
                  setFlyout(null);
                }}
                dataReady={flyout.item.requiresAdjustment ? analysisReady : dataReady}
                lang={lang}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
