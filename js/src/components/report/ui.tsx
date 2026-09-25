import React from "react";
import { cssFont, isSerif } from "./layout";

// Small pieces the report builder uses in several places.

export function Icon({ d, size = 18 }: { d: string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

export const ICONS: Record<string, string[]> = {
  back: ["M15 6l-6 6 6 6"],
  undo: ["M9 7L4 12l5 5", "M4 12h11a5 5 0 0 1 0 10h-2"],
  redo: ["M15 7l5 5-5 5", "M20 12H9a5 5 0 0 0 0 10h2"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  download: ["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"],
  search: ["M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M16 16l4 4"],
  up: ["M6 15l6-6 6 6"],
  down: ["M6 9l6 6 6-6"],
  copy: ["M8 8h12v12H8z", "M16 8V4H4v12h4"],
  trash: ["M5 7h14", "M9 7V4h6v3", "M7 7l1 13h8l1-13"],
  grip: ["M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  check: ["M5 12l5 5 9-10"],
  warn: ["M12 9v4", "M12 17h.01", "M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"],
  chevron: ["M9 6l6 6-6 6"],
  plus: ["M12 5v14", "M5 12h14"],
  doc: ["M6 3h9l4 4v14H6z", "M14 3v5h5", "M9 13h7", "M9 17h5"],
  // block kinds
  chart: ["M4 4v16h16", "M7 15l4-5 3 3 5-7"],
  map: ["M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z", "M9 4v14", "M15 6v14"],
  bars: ["M4 6h12", "M4 12h16", "M4 18h8"],
  table: ["M4 5h16v14H4z", "M4 10h16", "M10 5v14"],
  heading: ["M6 5v14", "M18 5v14", "M6 12h12"],
  paragraph: ["M4 6h16", "M4 12h16", "M4 18h10"],
  note: ["M5 4h14v16H5z", "M9 9h6", "M9 13h6"],
  pagebreak: ["M4 12h3M10 12h4M17 12h3", "M6 4v5h12V4", "M6 20v-5h12v5"],
  image: ["M4 5h16v14H4z", "M4 16l5-5 4 4 3-3 4 4", "M15.5 8.5h.01"],
  // the ribbon
  bold: ["M7 5h6a3.5 3.5 0 0 1 0 7H7z", "M7 12h7a3.5 3.5 0 0 1 0 7H7z"],
  italic: ["M11 5h7", "M6 19h7", "M14 5l-4 14"],
  underline: ["M7 4v7a5 5 0 0 0 10 0V4", "M5 20h14"],
  alignLeft: ["M4 6h16", "M4 10h10", "M4 14h16", "M4 18h10"],
  alignCenter: ["M4 6h16", "M7 10h10", "M4 14h16", "M7 18h10"],
  alignRight: ["M4 6h16", "M10 10h10", "M4 14h16", "M10 18h10"],
  alignJustify: ["M4 6h16", "M4 10h16", "M4 14h16", "M4 18h16"],
  bullets: ["M9 6h11", "M9 12h11", "M9 18h11", "M4.5 6h.01M4.5 12h.01M4.5 18h.01"],
  numbering: ["M10 6h10", "M10 12h10", "M10 18h10", "M4 5l1.5-1v5", "M4 15.5a1.5 1.5 0 0 1 3 0c0 1.5-3 2-3 3.5h3"],
  field: ["M8 4c-2 0-3 1-3 3v2c0 1.5-1 2.5-2 3 1 .5 2 1.5 2 3v2c0 2 1 3 3 3", "M16 4c2 0 3 1 3 3v2c0 1.5 1 2.5 2 3-1 .5-2 1.5-2 3v2c0 2-1 3-3 3"],
  clear: ["M6 5h12", "M12 5l-3 14", "M15 14l5 5M20 14l-5 5"],
  palette: ["M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z", "M7.5 11h.01M10 7h.01M15 7h.01"],
  cover: ["M6 3h12v18H6z", "M6 3v18", "M9 14h6", "M9 17h4"],
  pages: ["M8 3h10v14H8z", "M5 6v15h11"],
  orientation: ["M5 4h10v16H5z", "M17 9h3v11H9v-2"],
  margins: ["M4 4h16v16H4z", "M8 4v16", "M16 4v16", "M4 8h16", "M4 16h16"],
  header: ["M4 4h16v16H4z", "M4 8h16"],
  footer: ["M4 4h16v16H4z", "M4 16h16"],
  pageNumber: ["M5 3h14v18H5z", "M10 17h4"],
  // the Office-style ribbon
  paste: ["M9 4h6v3H9z", "M7 5H5v16h7", "M17 5h2v5", "M12 11h8v10h-8z"],
  cut: ["M6 6a2.5 2.5 0 1 0 0 .01", "M6 18a2.5 2.5 0 1 0 0 .01", "M8 7.5L20 18", "M8 16.5L20 6"],
  fontGrow: ["M3 19l5-13 5 13", "M5 14h6", "M16 9l2.5-3L21 9"],
  fontShrink: ["M3 19l5-13 5 13", "M5 14h6", "M16 6l2.5 3L21 6"],
  changeCase: ["M3 18l4-11 4 11", "M4.5 14h5", "M17 11a3 3 0 1 0 0 7h3v-7", "M20 13v5"],
  strike: ["M5 12h14", "M16 7a4 3 0 0 0-8 0c0 3 8 2 8 6a4 3 0 0 1-8 0"],
  subscript: ["M4 5l7 9", "M11 5l-7 9", "M16 19h4l-4-4a2 2 0 1 1 4-1"],
  superscript: ["M4 9l7 9", "M11 9l-7 9", "M16 10h4l-4-4a2 2 0 1 1 4-1"],
  highlighter: ["M9 11l6-6 4 4-6 6", "M9 11l-3 6 4 1 3-3", "M4 21h16"],
  indentMore: ["M10 6h10", "M10 12h10", "M10 18h10", "M4 9l3 3-3 3"],
  indentLess: ["M10 6h10", "M10 12h10", "M10 18h10", "M7 9l-3 3 3 3"],
  lineSpacing: ["M11 6h10", "M11 12h10", "M11 18h10", "M5 4v16", "M3 6l2-2 2 2", "M3 18l2 2 2-2"],
  picture: ["M3 5h18v14H3z", "M3 16l5-5 4 4 3-3 6 6", "M15.5 8.5h.01"],
  chartBar: ["M4 20h16", "M6 20V10", "M11 20V5", "M16 20v-7"],
  coverPage: ["M6 3h12v18H6z", "M6 3h4v18", "M12 13h4", "M12 16h3"],
  blankPage: ["M6 3h9l4 4v14H6z", "M14 3v5h5"],
  calendar: ["M4 6h16v14H4z", "M4 10h16", "M8 3v5", "M16 3v5"],
  textBox: ["M4 5h16v14H4z", "M8 9h8", "M12 9v7"],
  themes: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  colors: ["M12 3a9 9 0 0 0 0 18", "M12 3a9 9 0 0 1 0 18", "M3 12h18"],
  fonts: ["M4 19l6-15 6 15", "M6.5 13h7", "M17 19h4"],
  spacing: ["M9 6h12", "M9 12h12", "M9 18h12", "M4 4v16", "M2 6l2-2 2 2", "M2 18l2 2 2-2"],
  pageSize: ["M6 3h12v18H6z", "M9 7h6", "M9 17h6", "M12 7v10"],
  breaks: ["M6 3v6h12V3", "M6 21v-6h12v6", "M3 12h3M9 12h2M13 12h2M18 12h3"],
  undoBig: ["M9 7L4 12l5 5", "M4 12h11a5 5 0 0 1 0 10h-2"],
  expand: ["M6 9l6 6 6-6"],
  launcher: ["M9 15l6-6", "M10 9h5v5"]
};

export function kindIcon(type: string, kind?: string): string[] {
  if (type === "table") return ICONS.table;
  if (type === "chart") {
    if (kind === "map") return ICONS.map;
    if (kind === "derived_coverage" || kind === "threshold" || kind === "overall_score") return ICONS.bars;
    return ICONS.chart;
  }
  return ICONS[type] || ICONS.paragraph;
}

export function Seg<T extends string | number>({ label, value, options, onPick }: { label: string; value: T | undefined; options: { value: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="cd-seg cd-seg--fill">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={value === o.value} className={value === o.value ? "cd-seg__btn cd-seg__btn--on" : "cd-seg__btn"} onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, on, onFlip }: { label: string; on: boolean; onFlip: () => void }) {
  return (
    <label className="cd-rb-toggle">
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? "cd-rb-switch cd-rb-switch--on" : "cd-rb-switch"} onClick={onFlip}>
        <span />
      </button>
      <span>{label}</span>
    </label>
  );
}

/** The report fonts as a font list shows them: serif faces (reading text), then sans serif (charts, tables, headings),
 *  each written in itself. */
export function FontOptions({ fonts, serifLabel, sansLabel }: { fonts: string[]; serifLabel: string; sansLabel: string }) {
  const groups: [string, string[]][] = [
    [serifLabel, fonts.filter(isSerif)],
    [sansLabel, fonts.filter((f) => !isSerif(f))]
  ];
  return (
    <>
      {groups
        .filter(([, list]) => list.length > 0)
        .map(([label, list]) => (
          <optgroup key={label} label={label}>
            {list.map((f) => (
              <option key={f} value={f} style={{ fontFamily: cssFont(f) }}>
                {f}
              </option>
            ))}
          </optgroup>
        ))}
    </>
  );
}
