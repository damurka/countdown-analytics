import React from "react";
import { Icon, ICONS } from "../ui";

// The frame of every builder: the bar above the ribbon (back to the list, the name, what it is and whether it is saved,
// the builder's buttons, Download) and the zoom at the right of the status bar.

type T = (k: string) => string;

export function EditorTopBar({ name, onName, summary, t, onClose, onDownload, children }: {
  name: string;
  onName: (name: string) => void;
  /** What it is, how long, whether it is saved: "Document · 5 pages · Saved in the dataset". */
  summary: string;
  t: T;
  onClose: () => void;
  onDownload: () => void;
  /** Buttons before Download (e.g. Slide Show). */
  children?: React.ReactNode;
}) {
  return (
    <div className="cd-rb-bar">
      <button type="button" className="cd-rb-link" onClick={onClose}>
        <Icon d={ICONS.back} size={16} />
        {t("allReports")}
      </button>
      <span className="cd-rb-bar__sep" />
      <div className="cd-rb-bar__name">
        <input type="text" value={name} aria-label={t("reportName")} onChange={(e) => onName(e.target.value)} />
        <span>{summary}</span>
      </div>
      <span className="cd-rb-grow" />
      {children}
      <button type="button" className="cd-rb-btn cd-rb-btn--primary" onClick={onDownload}>
        <Icon d={ICONS.download} size={16} />
        {t("download")}
      </button>
    </div>
  );
}

/** The Hand tool: dragging moves the view (Space held does the same while it is off). */
export function HandButton({ on, onToggle, t }: { on: boolean; onToggle: () => void; t: T }) {
  return (
    <button type="button" className={on ? "cd-rb-view cd-rb-view--on" : "cd-rb-view"} aria-pressed={on} aria-label={t("handTool")} title={t("handToolHint")} onClick={onToggle}>
      <Icon d={["M8 13V5.5a1.5 1.5 0 0 1 3 0V12", "M11 11.5v-7a1.5 1.5 0 0 1 3 0V12", "M14 11.5V6.5a1.5 1.5 0 0 1 3 0V13", "M17 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.9-2.5L5 14.5a1.5 1.5 0 0 1 2.4-1.8L8 13.5"]} size={15} />
    </button>
  );
}

export const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

/** Zoom out, a thin slider, zoom in, and the percent, which opens the steps and the fits (width, whole page...). */
export function ZoomControl({ zoom, onZoom, min = 0.25, max = 2, fits, t }: {
  zoom: number;
  onZoom: (z: number) => void;
  min?: number;
  max?: number;
  /** The ways to fit (to the width, the whole page, the slide), each with what it does. */
  fits: [string, () => void][];
  t: T;
}) {
  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOMS.find((z) => z > zoom + 0.001) : [...ZOOMS].reverse().find((z) => z < zoom - 0.001);
    onZoom(Math.min(max, Math.max(min, next ?? zoom * (dir > 0 ? 1.1 : 1 / 1.1))));
  };
  return (
    <div className="cd-rb-zoom cd-rb-zoom--status" role="group" aria-label={t("zoom")}>
      <button type="button" className="cd-rb-icon cd-rb-icon--small" aria-label={t("zoomOut")} title={t("zoomOut")} disabled={zoom <= min} onClick={() => step(-1)}>
        <Icon d={["M5 12h14"]} size={14} />
      </button>
      <input type="range" min={Math.round(min * 100)} max={Math.round(max * 100)} step={5} value={Math.round(zoom * 100)} aria-label={t("zoom")} onChange={(e) => onZoom(Number(e.target.value) / 100)} />
      <button type="button" className="cd-rb-icon cd-rb-icon--small" aria-label={t("zoomIn")} title={t("zoomIn")} disabled={zoom >= max} onClick={() => step(1)}>
        <Icon d={ICONS.plus} size={14} />
      </button>
      <select
        className="cd-rb-zoom__pct"
        aria-label={t("zoom")}
        value=""
        onChange={(e) => {
          const v = e.target.value;
          const fit = fits.find(([label]) => label === v);
          if (fit) fit[1]();
          else if (v) onZoom(Number(v));
        }}
      >
        <option value="" hidden>
          {Math.round(zoom * 100)}%
        </option>
        {ZOOMS.filter((z) => z >= min && z <= max).map((z) => (
          <option key={z} value={z}>
            {Math.round(z * 100)}%
          </option>
        ))}
        {fits.map(([label]) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
