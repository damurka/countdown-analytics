import React, { useState } from "react";
import { tr } from "../lang";
import type { LocalText } from "../lang";
import type { CustomizeTab } from "./ChartCustomize";
import type { CustomizeField, CustomizeValues } from "./ChartCustomizeFields";

// A chart's settings by element, as PowerPoint's Format pane: Chart title, Subtitle, Source note, the axes' titles and
// labels, Legend, Legend title, Data labels, Gridlines... Each element is a section that opens to its settings; its
// first choice, in its header, is whether it is shown at all (a switch: hiding it leaves no space for it). Used by the
// charts' Customize panel on the pages and by the report builder's.

export function ChartElements({ tabs, fields, bag, put, changed, renderField, lang, texts }: {
  tabs: CustomizeTab[];
  fields: CustomizeField[];
  bag: CustomizeValues;
  put: (key: string, value: unknown) => void;
  changed: (f: CustomizeField) => boolean;
  /** One setting: its label and control (the caller's own look). */
  renderField: (f: CustomizeField) => React.ReactNode;
  lang: string;
  texts: { show: LocalText; hidden: LocalText; changed: LocalText };
}) {
  // the first element open; then whichever the user opens (several may be open)
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ [tabs[0]?.key || "title"]: true }));
  return (
    <div className="cd-ce">
      {tabs.map((el) => {
        const own = fields.filter((f) => f.tab === el.key);
        if (!own.length && !el.show) return null;
        const hidden = !!el.show && bag[el.show] === false;
        const n = own.filter(changed).length + (el.show && bag[el.show] !== undefined ? 1 : 0);
        const isOpen = !!open[el.key] && !hidden && own.length > 0;
        // the settings, under a small heading whenever their group changes
        const rows: React.ReactNode[] = [];
        let last = "";
        own.forEach((f) => {
          const g = typeof f.group === "string" ? f.group : JSON.stringify(f.group);
          if (g !== last && own.length > 3) {
            last = g;
            rows.push(
              <div key={"g" + g} className="cd-ce__group">
                {tr(f.group, lang)}
              </div>
            );
          }
          rows.push(<React.Fragment key={f.key}>{renderField(f)}</React.Fragment>);
        });
        return (
          <section key={el.key} className={["cd-ce__el", isOpen ? "cd-ce__el--open" : "", hidden ? "cd-ce__el--hidden" : ""].join(" ")}>
            <div className="cd-ce__head">
              <button type="button" className="cd-ce__toggle" aria-expanded={isOpen} disabled={hidden || !own.length} onClick={() => setOpen({ ...open, [el.key]: !open[el.key] })}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {el.icon.filter(Boolean).map((d, i) => (
                    <path key={i} d={d} />
                  ))}
                </svg>
                <span className="cd-ce__name">{tr(el.label, lang)}</span>
                {n > 0 && <span className="cd-cc__dot" aria-label={tr(texts.changed, lang)} />}
                {hidden && <span className="cd-ce__state">{tr(texts.hidden, lang)}</span>}
                {own.length > 0 && !hidden && (
                  <svg className="cd-ce__chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                )}
              </button>
              {el.show && (
                <label className="cd-ce__show" title={tr(texts.show, lang) + ": " + tr(el.label, lang)}>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={tr(texts.show, lang) + ": " + tr(el.label, lang)}
                    checked={!hidden}
                    // shown is "as drawn" (nothing kept); hidden is kept
                    onChange={(e) => put(el.show as string, e.target.checked ? undefined : false)}
                  />
                  <span className="cd-ce__switch" aria-hidden="true" />
                </label>
              )}
            </div>
            {isOpen && <div className="cd-ce__body">{rows}</div>}
          </section>
        );
      })}
    </div>
  );
}
