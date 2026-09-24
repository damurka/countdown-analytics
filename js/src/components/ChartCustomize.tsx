import React, { useEffect, useMemo, useRef, useState } from "react";
import { InputAdapter } from "@/shiny.react";
import { IconReset } from "./ChipFrame";
import { IconSliders, ToolFrame } from "./ToolFrame";
import { FieldControl } from "./ChartCustomizeFields";
import type { CustomizeField, CustomizeEntries, CustomizeValues } from "./ChartCustomizeFields";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// One panel for everything a user can change about one chart: text, axes, legend, grid and background, marks, layout.
// The list of fields comes from R (cd_chart_schema(), apps/_shared/R/charts/chart-schema.R), so a new chart option needs
// no change here. Values are cd2030.core chart options (cd_chart_options()); only what is set is reported to Shiny.
//
// The chart's options can be kept for the screen, for the generated report, or both ("Apply to"). Editing "Both" writes the
// same value to each. The component reports both sets:
//   { screen: {...} | null, report: {...} | null }

export interface CustomizeTab {
  key: string;
  label: LocalText;
  /** Up to three SVG path strings for the tab icon. */
  icon: string[];
}

export interface CustomizeValue {
  screen?: CustomizeValues | null;
  report?: CustomizeValues | null;
}

export interface ChartCustomizeTexts {
  tool: LocalText;
  title: LocalText;
  applyTo: LocalText;
  targetScreen: LocalText;
  targetReport: LocalText;
  targetBoth: LocalText;
  reportNote: LocalText;
  bothNote: LocalText;
  chartId: LocalText;
  chartIdHint: LocalText;
  search: LocalText;
  noResults: LocalText;
  reset: LocalText;
  resetGroup: LocalText;
  resetAll: LocalText;
  changed: LocalText;
  asDrawn: LocalText;
  yes: LocalText;
  no: LocalText;
  min: LocalText;
  max: LocalText;
  entriesLegend: LocalText;
  entriesCategories: LocalText;
  entryText: LocalText;
  entryColor: LocalText;
  autoNote: LocalText;
}

export interface ChartCustomizeProps {
  id?: string;
  value?: CustomizeValue | null;
  tabs: CustomizeTab[];
  fields: CustomizeField[];
  /** Legend entries and axis categories of this chart (from R), to relabel or recolour. */
  entries?: CustomizeEntries;
  /** The chart's id (also how a report finds this chart's report settings). */
  chartId?: string;
  /** The chart's own text, used as placeholders. */
  defaults?: Record<string, string>;
  /** What "Auto" orientation did for this chart right now. */
  autoNote?: LocalText;
  texts: ChartCustomizeTexts;
  onChange?: (value: CustomizeValue | null) => void;
}

const isSet = (v: unknown): boolean => {
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.some((x) => x !== null && x !== undefined && x !== "");
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
};

const clean = (values: CustomizeValues): CustomizeValues => {
  const out: CustomizeValues = {};
  Object.keys(values).forEach((k) => {
    if (isSet(values[k])) out[k] = values[k];
  });
  return out;
};

const ENTRY_KEYS = ["legend_labels", "colors", "category_labels"];
const keysOf = (f: CustomizeField): string[] => (f.type === "entries" ? ENTRY_KEYS : [f.key]);

function ChartCustomize({ id, value, chartId, tabs, fields, entries, defaults = {}, autoNote, texts, onChange }: ChartCustomizeProps) {
  const lang = useLang();
  const [screen, setScreen] = useState<CustomizeValues>(value?.screen || {});
  const [report, setReport] = useState<CustomizeValues>(value?.report || {});
  const [target, setTarget] = useState<"screen" | "report" | "both">("screen");
  const [tab, setTab] = useState<string>(tabs[0]?.key || "");
  const [query, setQuery] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // R pushes the stored value when the tool mounts (and after a reset from elsewhere)
  useEffect(() => {
    setScreen(value?.screen || {});
    setReport(value?.report || {});
  }, [JSON.stringify(value || {})]);

  const emit = (nextScreen: CustomizeValues, nextReport: CustomizeValues) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const sc = clean(nextScreen);
      const rp = clean(nextReport);
      if (onChange) onChange(Object.keys(sc).length || Object.keys(rp).length ? { screen: Object.keys(sc).length ? sc : null, report: Object.keys(rp).length ? rp : null } : null);
    }, 350);
  };
  const update = (nextScreen: CustomizeValues, nextReport: CustomizeValues) => {
    setScreen(nextScreen);
    setReport(nextReport);
    emit(nextScreen, nextReport);
  };

  // what is shown and counted: the report's values when editing the report, the screen's otherwise ("Both" shows the screen's)
  const bag = target === "report" ? report : screen;
  const own = (k: string) => isSet(bag[k]);
  const shown = (k: string) => bag[k];

  const edit = (change: (values: CustomizeValues) => CustomizeValues) => {
    update(target === "report" ? screen : change({ ...screen }), target === "screen" ? report : change({ ...report }));
  };
  const put = (k: string, v: unknown) =>
    edit((values) => {
      if (!isSet(v)) delete values[k];
      else values[k] = v;
      return values;
    });
  const drop = (keys: string[]) =>
    edit((values) => {
      keys.forEach((k) => delete values[k]);
      return values;
    });

  const changedField = (f: CustomizeField) => keysOf(f).some(own);

  const visibleFields = fields.filter((f) => f.type !== "entries" || (entries?.legend?.length || entries?.categories?.length));
  const tabLabel = (key: string) => tr(tabs.find((t) => t.key === key)?.label, lang);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    tabs.forEach((t) => (c[t.key] = visibleFields.filter((f) => f.tab === t.key && changedField(f)).length));
    return c;
  }, [JSON.stringify(bag), target, fields.length]);
  const total = visibleFields.filter(changedField).length;
  const totalAny = fields.filter((f) => keysOf(f).some((k) => isSet(screen[k]) || isSet(report[k]))).length;

  const q = query.trim().toLowerCase();
  const matches = (f: CustomizeField) => {
    const hay = [tr(f.label, lang), tr(f.group, lang), tabLabel(f.tab), f.keywords || ""].join(" ").toLowerCase();
    return q.split(/\s+/).every((word) => hay.indexOf(word) >= 0);
  };
  const list = q ? visibleFields.filter(matches) : visibleFields.filter((f) => f.tab === tab);

  // rows: a heading whenever the group changes (not while searching, where the tab is shown instead)
  const rows: React.ReactNode[] = [];
  let lastGroup = "";
  list.forEach((f) => {
    const groupKey = typeof f.group === "string" ? f.group : JSON.stringify(f.group);
    if (!q && groupKey !== lastGroup) {
      lastGroup = groupKey;
      const same = list.filter((g) => (typeof g.group === "string" ? g.group : JSON.stringify(g.group)) === groupKey);
      const groupChanged = same.some(changedField);
      rows.push(
        <div key={`g-${groupKey}`} className="cd-cc__group">
          <span>{tr(f.group, lang)}</span>
          {groupChanged && (
            <button type="button" className="cd-cc__link" onClick={() => drop(same.flatMap(keysOf))}>
              {tr(texts.resetGroup, lang)}
            </button>
          )}
        </div>
      );
    }
    rows.push(
      <div key={f.key} className="cd-cc__field">
        <div className="cd-cc__label">
          <span>{tr(f.label, lang)}</span>
          {changedField(f) && <span className="cd-cc__dot" aria-label={tr(texts.changed, lang)} />}
          {q && <span className="cd-cc__tag">{tabLabel(f.tab)}</span>}
          <span className="cd-cc__grow" />
          {changedField(f) && (
            <button type="button" className="cd-field__reset" aria-label={`${tr(texts.reset, lang)}: ${tr(f.label, lang)}`} title={tr(texts.reset, lang)} onClick={() => drop(keysOf(f))}>
              <IconReset />
            </button>
          )}
        </div>
        <FieldControl
          field={f}
          bag={bag}
          shown={shown}
          own={own}
          put={put}
          entries={entries}
          placeholder={defaults[f.key]}
          texts={texts}
        />
        {f.key === "flip" && !own("flip") && autoNote ? <div className="cd-cc__hint">{tr(autoNote, lang)}</div> : null}
      </div>
    );
  });

  return (
    <ToolFrame id={id} icon={<IconSliders />} tooltip={texts.tool} changed={totalAny > 0} title={texts.title} wide bare>
      <div className="cd-cc">
        <div className="cd-cc__head">
          <div className="cd-cc__title">{tr(texts.title, lang)}</div>
          {chartId ? (
            <div className="cd-cc__id" title={tr(texts.chartIdHint, lang)}>
              {tr(texts.chartId, lang)}: <code>{chartId}</code>
            </div>
          ) : null}
        </div>

        <div className="cd-cc__scope">
          <div className="cd-cc__applyto">{tr(texts.applyTo, lang)}</div>
          <div role="group" aria-label={tr(texts.applyTo, lang)} className="cd-seg cd-seg--fill">
            {([
              ["screen", texts.targetScreen],
              ["report", texts.targetReport],
              ["both", texts.targetBoth]
            ] as ["screen" | "report" | "both", LocalText][]).map(([key, text]) => (
              <button key={key} type="button" aria-pressed={target === key} className={target === key ? "cd-seg__btn cd-seg__btn--on" : "cd-seg__btn"} onClick={() => setTarget(key)}>
                {tr(text, lang)}
              </button>
            ))}
          </div>
        </div>
        {target !== "screen" && <div className="cd-cc__banner">{tr(target === "report" ? texts.reportNote : texts.bothNote, lang)}</div>}

        <label className="cd-cc__search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <input type="search" value={query} placeholder={tr(texts.search, lang)} aria-label={tr(texts.search, lang)} onChange={(e) => setQuery(e.target.value)} />
        </label>

        {!q && (
          <div role="tablist" aria-label={tr(texts.title, lang)} className="cd-cc__tabs">
            {tabs.map((t) => {
              const on = tab === t.key;
              const n = counts[t.key] || 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={`${tr(t.label, lang)}${n ? `, ${n} ${tr(texts.changed, lang)}` : ""}`}
                  className={on ? "cd-cc__tab cd-cc__tab--on" : "cd-cc__tab"}
                  onClick={() => setTab(t.key)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {t.icon.filter(Boolean).map((d, i) => (
                      <path key={i} d={d} />
                    ))}
                  </svg>
                  {on && <span>{tr(t.label, lang)}</span>}
                  {!on && n > 0 && <span className="cd-cc__tabdot" />}
                </button>
              );
            })}
          </div>
        )}

        <div className="cd-cc__list">
          {rows.length === 0 ? <div className="cd-cc__empty">{tr(texts.noResults, lang)}</div> : rows}
        </div>

        <div className="cd-cc__foot">
          <div className="cd-cc__count">
            <b>{total}</b> {tr(texts.changed, lang)}
          </div>
          <button type="button" className="cd-cc__btn" disabled={Object.keys(clean(bag)).length === 0} onClick={() => edit(() => ({}))}>
            {tr(texts.resetAll, lang)}
          </button>
        </div>
      </div>
    </ToolFrame>
  );
}

export default InputAdapter<ChartCustomizeProps, CustomizeValue | null>(ChartCustomize, (value, setValue) => ({ value, onChange: setValue }));
