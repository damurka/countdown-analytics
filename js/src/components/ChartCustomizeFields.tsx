import React from "react";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// The controls of the chart customize panel (ChartCustomize.tsx), one per field type. Each edits one value through
// `put(key, value)`; an empty value means "as the chart draws it" and is removed by the panel.

export type CustomizeValues = Record<string, unknown>;

export type FieldType = "text" | "number" | "select" | "seg" | "boolean" | "color" | "limits" | "margin" | "entries";

export interface CustomizeChoice {
  value: string | number;
  label: LocalText;
}

export interface CustomizeField {
  key: string;
  tab: string;
  group: LocalText;
  label: LocalText;
  type: FieldType;
  choices?: CustomizeChoice[];
  step?: number;
  min?: number;
  max?: number;
  /** Extra words the search matches (English). */
  keywords?: string;
}

/** One entry of a legend or category axis: the key R matches on, what the chart writes now, and its colour. */
export interface CustomizeEntry {
  key: string;
  shown: string;
  color?: string;
}

export interface CustomizeEntries {
  legend?: CustomizeEntry[];
  categories?: CustomizeEntry[];
}

interface Texts {
  asDrawn: LocalText;
  yes: LocalText;
  no: LocalText;
  min: LocalText;
  max: LocalText;
  entriesLegend: LocalText;
  entriesCategories: LocalText;
  entryText: LocalText;
  entryColor: LocalText;
}

interface Props {
  field: CustomizeField;
  bag: CustomizeValues;
  shown: (key: string) => unknown;
  own: (key: string) => boolean;
  put: (key: string, value: unknown) => void;
  entries?: CustomizeEntries;
  placeholder?: string;
  texts: Texts;
}

const HEX = /^#[0-9a-f]{6}$/i;

function Seg({ label, options, current, onPick }: { label: string; options: { key: string; text: string; value: unknown }[]; current: unknown; onPick: (v: unknown) => void }) {
  return (
    <div role="group" aria-label={label} className="cd-seg cd-seg--fill">
      {options.map((o) => {
        const on = current !== undefined && current !== null && JSON.stringify(current) === JSON.stringify(o.value);
        return (
          <button key={o.key} type="button" aria-pressed={on} className={on ? "cd-seg__btn cd-seg__btn--on" : "cd-seg__btn"} onClick={() => onPick(o.value)}>
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

export function FieldControl({ field: f, bag, shown, own, put, entries, placeholder, texts }: Props) {
  const lang = useLang();
  const label = tr(f.label, lang);
  const v = shown(f.key);
  const cls = own(f.key) ? "cd-input cd-input--edited" : "cd-input";

  switch (f.type) {
    case "text":
      return <input type="text" className={cls} aria-label={label} value={(bag[f.key] as string) ?? (v as string) ?? ""} placeholder={placeholder ?? ""} onChange={(e) => put(f.key, e.target.value)} />;

    case "number":
    case "margin":
      return (
        <input
          type="number"
          className={cls}
          aria-label={label}
          value={(v as number | undefined) ?? ""}
          placeholder={tr(texts.asDrawn, lang)}
          step={f.step ?? 1}
          min={f.min}
          max={f.max}
          onChange={(e) => put(f.key, e.target.value === "" ? "" : Number(e.target.value))}
        />
      );

    case "select":
      return (
        <select
          className={cls}
          aria-label={label}
          value={v === undefined || v === null ? "" : String(v)}
          onChange={(e) => {
            const hit = (f.choices || []).find((c) => String(c.value) === e.target.value);
            put(f.key, hit ? hit.value : "");
          }}
        >
          <option value="">{tr(texts.asDrawn, lang)}</option>
          {(f.choices || []).map((c) => (
            <option key={String(c.value)} value={String(c.value)}>
              {tr(c.label, lang)}
            </option>
          ))}
        </select>
      );

    case "seg":
      return <Seg label={label} current={v} options={(f.choices || []).map((c) => ({ key: String(c.value), text: tr(c.label, lang), value: c.value }))} onPick={(x) => put(f.key, x)} />;

    case "boolean":
      // as drawn / on / off: a plot's own default is not known here, so "as drawn" is a state of its own
      return (
        <div role="group" aria-label={label} className="cd-seg cd-seg--fill">
          {[
            { key: "asdrawn", text: tr(texts.asDrawn, lang), value: undefined },
            { key: "yes", text: tr(texts.yes, lang), value: true },
            { key: "no", text: tr(texts.no, lang), value: false }
          ].map((o) => {
            const on = o.value === undefined ? v === undefined || v === null || v === "" : v === o.value;
            return (
              <button key={o.key} type="button" aria-pressed={on} className={on ? "cd-seg__btn cd-seg__btn--on" : "cd-seg__btn"} onClick={() => put(f.key, o.value === undefined ? "" : o.value)}>
                {o.text}
              </button>
            );
          })}
        </div>
      );

    case "color":
      return (
        <span className="cd-color">
          <input type="color" className="cd-color__pick" aria-label={label} value={HEX.test((v as string) || "") ? (v as string) : "#ffffff"} onChange={(e) => put(f.key, e.target.value)} />
          <span className="cd-color__text">{own(f.key) || v ? (v as string) : tr(texts.asDrawn, lang)}</span>
        </span>
      );

    case "limits": {
      const pair = ((v as (number | null)[]) || [null, null]).slice(0, 2);
      const set = (i: number, raw: string) => {
        const next: (number | null)[] = [pair[0] ?? null, pair[1] ?? null];
        next[i] = raw === "" ? null : Number(raw);
        put(f.key, next);
      };
      return (
        <span className="cd-pair">
          <input type="number" className={cls} aria-label={`${label}: ${tr(texts.min, lang)}`} placeholder={tr(texts.min, lang)} value={pair[0] ?? ""} onChange={(e) => set(0, e.target.value)} />
          <input type="number" className={cls} aria-label={`${label}: ${tr(texts.max, lang)}`} placeholder={tr(texts.max, lang)} value={pair[1] ?? ""} onChange={(e) => set(1, e.target.value)} />
        </span>
      );
    }

    case "entries":
      return <Entries bag={bag} shown={shown} put={put} entries={entries} texts={texts} />;
  }
  return null;
}

// Legend entries (text and colour) and axis categories (text): named maps keyed by what the plot draws
function Entries({ bag, shown, put, entries, texts }: { bag: CustomizeValues; shown: Props["shown"]; put: Props["put"]; entries?: CustomizeEntries; texts: Texts }) {
  const lang = useLang();
  const map = (key: string) => ({ ...((shown(key) as Record<string, string>) || {}), ...((bag[key] as Record<string, string>) || {}) });
  const set = (group: "legend_labels" | "colors" | "category_labels", key: string, value: string) => {
    const next = { ...map(group) };
    if (value === "") delete next[key];
    else next[key] = value;
    put(group, next);
  };
  const labels = map("legend_labels");
  const colours = map("colors");
  const cats = map("category_labels");

  return (
    <div className="cd-cc__entries">
      {(entries?.legend || []).length > 0 && <div className="cd-cc__sub">{tr(texts.entriesLegend, lang)}</div>}
      {(entries?.legend || []).map((e) => (
        <div key={`l-${e.key}`} className="cd-entry">
          <input
            type="color"
            className="cd-color__pick"
            aria-label={`${tr(texts.entryColor, lang)}: ${e.shown}`}
            value={HEX.test(colours[e.key] || "") ? colours[e.key] : HEX.test(e.color || "") ? (e.color as string) : "#ffffff"}
            onChange={(ev) => set("colors", e.key, ev.target.value)}
          />
          <input type="text" className={labels[e.key] ? "cd-input cd-input--edited" : "cd-input"} aria-label={`${tr(texts.entryText, lang)}: ${e.shown}`} value={labels[e.key] ?? ""} placeholder={e.shown} onChange={(ev) => set("legend_labels", e.key, ev.target.value)} />
        </div>
      ))}
      {(entries?.categories || []).length > 0 && <div className="cd-cc__sub">{tr(texts.entriesCategories, lang)}</div>}
      {(entries?.categories || []).map((e) => (
        <div key={`c-${e.key}`} className="cd-entry">
          <input type="text" className={cats[e.key] ? "cd-input cd-input--edited" : "cd-input"} aria-label={`${tr(texts.entryText, lang)}: ${e.shown}`} value={cats[e.key] ?? ""} placeholder={e.shown} onChange={(ev) => set("category_labels", e.key, ev.target.value)} />
        </div>
      ))}
    </div>
  );
}
