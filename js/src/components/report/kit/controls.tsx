import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, ICONS } from "../ui";

// The ribbon's controls, shared by every builder and any page made from them (Word's and PowerPoint's): large and small
// buttons, groups that fold on a narrow ribbon, menus, number boxes, split buttons, galleries.

/** Buttons act on mouse down without taking the focus, so the text being edited keeps its selection. */
export const keep = (e: React.MouseEvent) => e.preventDefault();

// ---- building blocks ----------------------------------------------------------------------------------------------

/** The colour of a ribbon icon, as Word's: most are dark, the ones that stand for a kind of thing have its colour. */
export const TONES = new Map<string[], string>([
  [ICONS.paste, "amber"],
  [ICONS.copy, "blue"],
  [ICONS.cut, "blue"],
  [ICONS.highlighter, "amber"],
  [ICONS.clear, "red"],
  [ICONS.field, "purple"],
  [ICONS.picture, "green"],
  [ICONS.image, "green"],
  [ICONS.chartBar, "blue"],
  [ICONS.chart, "blue"],
  [ICONS.table, "blue"],
  [ICONS.coverPage, "red"],
  [ICONS.cover, "red"],
  [ICONS.blankPage, "blue"],
  [ICONS.pagebreak, "amber"],
  [ICONS.breaks, "amber"],
  [ICONS.textBox, "amber"],
  [ICONS.calendar, "teal"],
  [ICONS.header, "blue"],
  [ICONS.footer, "blue"],
  [ICONS.pageNumber, "blue"],
  [ICONS.themes, "purple"],
  [ICONS.colors, "red"],
  [ICONS.fonts, "blue"],
  [ICONS.spacing, "teal"],
  [ICONS.palette, "purple"],
  [ICONS.margins, "blue"],
  [ICONS.orientation, "blue"],
  [ICONS.pageSize, "blue"],
  [ICONS.pages, "blue"],
  [ICONS.lineSpacing, "blue"],
  [ICONS.indentMore, "blue"],
  [ICONS.indentLess, "blue"],
  [ICONS.bullets, "blue"],
  [ICONS.numbering, "blue"],
  [ICONS.undo, "blue"],
  [ICONS.redo, "blue"],
  [ICONS.trash, "red"]
]);
export const toneOf = (icon: string[] | undefined, tone?: string) => tone || (icon ? TONES.get(icon) : undefined);
/** A button's tooltip: its name and its shortcut, as Word's. */
export const tip = (label: string, keys?: string) => (keys ? `${label} (${keys})` : label);

/** A large button: an icon over its label (and an arrow under it when it opens a menu). */
export function Big({ icon, label, onClick, menu, disabled, on, tone, keys }: { icon: string[]; label: string; onClick?: () => void; menu?: boolean; disabled?: boolean; on?: boolean; tone?: string; keys?: string }) {
  const tn = toneOf(icon, tone);
  return (
    <button type="button" className={["cd-rb-big", on ? "cd-rb-big--on" : "", tn ? "cd-rb-tone--" + tn : ""].join(" ")} title={tip(label, keys)} disabled={disabled} aria-pressed={on} onMouseDown={keep} onClick={onClick}>
      <Icon d={icon} size={26} />
      <span>{label}</span>
      {menu && <Icon d={ICONS.expand} size={11} />}
    </button>
  );
}

/** A small button: an icon, and its label beside it when `wide`; `keys`, its shortcut, shows in its tooltip. */
export function Small({ icon, label, onClick, on, disabled, wide, children, keys, tone }: { icon?: string[]; label: string; onClick?: () => void; on?: boolean; disabled?: boolean; wide?: boolean; children?: React.ReactNode; keys?: string; tone?: string }) {
  const tn = toneOf(icon, tone);
  return (
    <button type="button" className={["cd-rb-sm", on ? "cd-rb-sm--on" : "", wide ? "cd-rb-sm--wide" : "", tn ? "cd-rb-tone--" + tn : ""].join(" ")} aria-label={label} title={tip(label, keys)} aria-pressed={on} disabled={disabled} onMouseDown={keep} onClick={onClick}>
      {icon && <Icon d={icon} size={16} />}
      {children}
      {wide && <span>{label}</span>}
    </button>
  );
}

/** A group of the ribbon, its name under it; `launch` opens its full settings (the arrow in the corner). */
/** The ribbon's groups fold into one button each, from the right, when the ribbon is too narrow for them (as Word's). */
export const FoldContext = createContext<{ folded: Set<string>; report: (key: string, width: number) => void } | null>(null);
export const FOLDED_WIDTH = 66;
export const GROUP_ICON = ["M4 6h16", "M4 12h16", "M4 18h10"];

export function RibbonBody({ tab, label, children }: { tab: string; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // each group's width when shown in full, by tab
  const widths = useRef(new Map<string, number>());
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const foldedRef = useRef(folded);
  foldedRef.current = folded;
  const compute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const room = el.clientWidth - 12;
    const groups = Array.from(el.children).filter((g): g is HTMLElement => g instanceof HTMLElement && !!g.dataset.group);
    const keys = groups.map((g) => g.dataset.group as string);
    const fill = new Set(groups.filter((g) => g.dataset.fill).map((g) => g.dataset.group as string));
    const full = (k: string) => widths.current.get(tab + "|" + k) ?? FOLDED_WIDTH;
    // a gallery that shrinks counts at its smallest
    let total = keys.reduce((sum, k) => sum + (fill.has(k) ? 90 : full(k)), 0);
    const next = new Set<string>();
    for (let i = keys.length - 1; i >= 0 && total > room; i--) {
      if (fill.has(keys[i])) continue;
      next.add(keys[i]);
      total -= full(keys[i]) - FOLDED_WIDTH;
    }
    const cur = foldedRef.current;
    if (next.size !== cur.size || Array.from(next).some((k) => !cur.has(k))) setFolded(next);
  }, [tab]);
  useLayoutEffect(() => compute());
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [compute]);
  const report = useCallback((key: string, width: number) => widths.current.set(tab + "|" + key, width), [tab]);
  return (
    <FoldContext.Provider value={{ folded, report }}>
      <div ref={ref} className="cd-rb-ribbon__body" role="toolbar" aria-label={label}>
        {children}
      </div>
    </FoldContext.Provider>
  );
}

export function Group({ label, children, launch, launchLabel, fill, icon }: { label: string; children: React.ReactNode; launch?: () => void; launchLabel?: string; fill?: boolean; icon?: string[] }) {
  const fold = useContext(FoldContext);
  const ref = useRef<HTMLDivElement>(null);
  const folded = !fill && !!fold?.folded.has(label);
  useLayoutEffect(() => {
    if (!folded && ref.current && fold) fold.report(label, ref.current.getBoundingClientRect().width);
  });
  if (folded) {
    return (
      <div ref={ref} className="cd-rb-rgroup cd-rb-rgroup--folded" data-group={label} role="group" aria-label={label}>
        <Drop trigger={(open, toggle) => <Big icon={icon || GROUP_ICON} label={label} menu on={open} onClick={toggle} />}>
          {() => (
            <div className="cd-rb-foldpop">
              <div className="cd-rb-rgroup__body">{children}</div>
              {launch && (
                <button type="button" className="cd-rb-mitem" onMouseDown={keep} onClick={launch}>
                  <Icon d={ICONS.launcher} size={12} />
                  <span>{launchLabel || label}</span>
                </button>
              )}
            </div>
          )}
        </Drop>
      </div>
    );
  }
  return (
    <div ref={ref} className={fill ? "cd-rb-rgroup cd-rb-rgroup--fill" : "cd-rb-rgroup"} data-group={label} data-fill={fill ? "1" : undefined} role="group" aria-label={label}>
      <div className="cd-rb-rgroup__body">{children}</div>
      <div className="cd-rb-rgroup__label">
        <span>{label}</span>
        {launch && (
          <button type="button" className="cd-rb-launch" aria-label={launchLabel || label} title={launchLabel || label} onMouseDown={keep} onClick={launch}>
            <Icon d={ICONS.launcher} size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

export const Col = ({ children }: { children: React.ReactNode }) => <div className="cd-rb-col">{children}</div>;
export const Row = ({ children }: { children: React.ReactNode }) => <div className="cd-rb-row2">{children}</div>;

/** A button that opens a menu under it; the menu closes on a click elsewhere or when an item is chosen. */
export function Drop({ trigger, children, width }: { trigger: (open: boolean, toggle: () => void) => React.ReactNode; children: (close: () => void) => React.ReactNode; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  // a menu that would go past the window's right edge is moved back into it
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const r = popRef.current?.getBoundingClientRect();
    if (r) setShift(Math.min(0, window.innerWidth - 8 - (r.right - shift)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="cd-rb-menu" ref={ref}>
      {trigger(open, () => setOpen(!open))}
      {open && (
        <div ref={popRef} className="cd-rb-menu__pop" role="menu" style={{ ...(width ? { width } : {}), ...(shift ? { transform: `translateX(${shift}px)` } : {}) }} onMouseDown={(e) => (e.target as HTMLElement).tagName !== "INPUT" && keep(e)}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Word's style gallery: as many style cards as fit in the ribbon, scrolled a row at a time by the arrows beside
 *  them, the lowest arrow opening every style; on a narrow ribbon it folds into one Styles button. */
export function StyleGallery({ count, card, win, disabled, t }: { count: number; card: (i: number) => React.ReactNode; win: (close: () => void) => React.ReactNode; disabled: boolean; t: (k: string) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(6);
  const [first, setFirst] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // a card is 70px and 3px apart; the arrows take 18px
    const measure = () => setFit(Math.max(0, Math.floor((el.clientWidth - 24) / 73)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = Math.max(1, Math.min(fit, count));
  const start = Math.min(first, Math.max(0, Math.floor((count - 1) / n) * n));
  const more = (
    <Drop width={470} trigger={(open, toggle) => (
      <button type="button" className="cd-rb-galarrow" aria-label={t("allStyles")} title={t("allStyles")} aria-expanded={open} disabled={disabled} onMouseDown={keep} onClick={toggle}>
        <Icon d={["M7 7h10", "M8 12l4 4 4-4"]} size={11} />
      </button>
    )}>
      {win}
    </Drop>
  );
  return (
    <div ref={ref} className="cd-rb-stylegal">
      {fit < 2 ? (
        <Drop width={470} trigger={(open, toggle) => <Big icon={["M5 19h4", "M7 19L12 5l5 14", "M9 14h6"]} label={t("styles")} menu on={open} tone="purple" disabled={disabled} onClick={toggle} />}>
          {win}
        </Drop>
      ) : (
        <>
          <div className="cd-rb-stylegallery">{Array.from({ length: Math.min(n, count - start) }, (_, k) => card(start + k))}</div>
          <div className="cd-rb-galarrows">
            <button type="button" className="cd-rb-galarrow" aria-label={t("previousRow")} title={t("previousRow")} disabled={start === 0} onMouseDown={keep} onClick={() => setFirst(Math.max(0, start - n))}>
              <Icon d={["M8 14l4-4 4 4"]} size={11} />
            </button>
            <button type="button" className="cd-rb-galarrow" aria-label={t("nextRow")} title={t("nextRow")} disabled={start + n >= count} onMouseDown={keep} onClick={() => setFirst(start + n)}>
              <Icon d={["M8 10l4 4 4-4"]} size={11} />
            </button>
            {more}
          </div>
        </>
      )}
    </div>
  );
}

/** A small button with an arrow beside it: the button does the last choice, the arrow opens the choices. */
export function SplitSmall({ icon, label, onClick, swatch, children }: { icon: string[]; label: string; onClick: () => void; swatch?: string; children: (close: () => void) => React.ReactNode }) {
  return (
    <Drop
      trigger={(open, toggle) => (
        <span className={open ? "cd-rb-split cd-rb-split--open" : "cd-rb-split"}>
          <button type="button" className="cd-rb-sm" aria-label={label} title={label} onMouseDown={keep} onClick={onClick}>
            <Icon d={icon} size={16} />
            {swatch !== undefined && <i className="cd-rb-swatchbar" style={{ background: swatch || "transparent" }} />}
          </button>
          <button type="button" className="cd-rb-split__arrow" aria-label={label} aria-haspopup="menu" aria-expanded={open} onMouseDown={keep} onClick={toggle}>
            <Icon d={ICONS.expand} size={10} />
          </button>
        </span>
      )}
    >
      {children}
    </Drop>
  );
}

/** A menu item. */
export function Item({ label, hint, on, onClick, icon, style }: { label: string; hint?: string; on?: boolean; onClick: () => void; icon?: string[]; style?: React.CSSProperties }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={!!on} className={on ? "cd-rb-mitem cd-rb-mitem--on" : "cd-rb-mitem"} onMouseDown={keep} onClick={onClick}>
      {icon && <Icon d={icon} size={16} />}
      <span style={style}>{label}</span>
      {hint && <small>{hint}</small>}
    </button>
  );
}

/** A number box, as Word's font size box: any value can be typed (Enter, or leaving the box, applies it; an empty box
 *  means "as drawn"), the arrow keys step it, and the arrow beside it lists suggested values. */
export function NumCombo({ icon, label, hideLabel, unit, value, placeholder, min, max, step, neutral, presets, disabled, width = 40, applyOnBlur = true, onFocus, onChange }: {
  icon?: string[];
  label: string;
  hideLabel?: boolean;
  unit?: string;
  value: number | undefined;
  placeholder?: string;
  min: number;
  max: number;
  step: number;
  /** What an empty box stands for, where the arrow keys start from. */
  neutral: number;
  presets: [number | undefined, string][];
  disabled?: boolean;
  width?: number;
  applyOnBlur?: boolean;
  onFocus?: () => void;
  onChange: (v: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value === undefined ? "" : String(Math.round(value * 100) / 100);
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  const apply = (text: string) => {
    setDraft(null);
    const clean = text.trim().replace(",", ".").replace(/[^0-9.+-]/g, "");
    if (!clean) {
      if (value !== undefined) onChange(undefined);
      return;
    }
    const n = Number(clean);
    if (isFinite(n) && clamp(n) !== value) onChange(clamp(n));
  };
  const bump = (dir: 1 | -1) => {
    setDraft(null);
    onChange(clamp((value ?? neutral) + dir * step));
  };
  return (
    <Drop
      width={Math.max(140, width + 80)}
      trigger={(open, toggle) => (
        <span className={disabled ? "cd-rb-numcombo cd-rb-numcombo--off" : "cd-rb-numcombo"} title={label}>
          {icon && <Icon d={icon} size={15} />}
          {!hideLabel && <span className="cd-rb-numcombo__label">{label}</span>}
          <span className="cd-rb-numcombo__box">
            <input
              type="text"
              inputMode="decimal"
              aria-label={label}
              disabled={disabled}
              style={{ width }}
              value={draft ?? shown}
              placeholder={placeholder}
              onFocus={(e) => {
                onFocus?.();
                e.target.select();
              }}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => {
                if (draft !== null && applyOnBlur) apply(e.target.value);
                else setDraft(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  apply((e.target as HTMLInputElement).value);
                } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  bump(e.key === "ArrowUp" ? 1 : -1);
                } else if (e.key === "Escape") {
                  setDraft(null);
                }
              }}
            />
            {unit && <small>{unit}</small>}
            <button type="button" className="cd-rb-numcombo__arrow" aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onMouseDown={keep} onClick={toggle}>
              <Icon d={ICONS.expand} size={10} />
            </button>
          </span>
        </span>
      )}
    >
      {(close) => (
        <>
          {presets.map(([v, text]) => (
            <Item
              key={String(v)}
              label={text}
              on={value === v}
              onClick={() => {
                setDraft(null);
                onChange(v);
                close();
              }}
            />
          ))}
        </>
      )}
    </Drop>
  );
}

/** A slide layout drawn small: its placeholders as boxes (the title ones darker). */
export function LayoutThumb({ items, wide }: { items: { x: number; y: number; w: number; h: number; role?: string }[]; wide: boolean }) {
  const W = wide ? 64 : 48;
  const H = 36;
  return (
    <svg className="cd-rb-layoutthumb" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="#fff" stroke="#c8c8c8" />
      {items.map((it, i) => (
        <rect key={i} x={it.x * W + 1} y={it.y * H + 1} width={Math.max(1, it.w * W - 2)} height={Math.max(1, it.h * H - 2)} fill={it.role === "title" ? "#b9c3cc" : "#e6eaee"} stroke="#9aa3ac" strokeWidth={0.5} strokeDasharray={it.role === "title" ? undefined : "1.5 1"} />
      ))}
    </svg>
  );
}
