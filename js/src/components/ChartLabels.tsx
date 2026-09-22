import React, { useEffect, useRef, useState } from "react";
import { InputAdapter } from "@/shiny.react";
import { IconReset } from "./ChipFrame";
import { IconType, ToolFrame } from "./ToolFrame";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// Edit the words on one chart: its title, caption, axis titles and legend title. The chart's own text is shown
// as the placeholder, so an empty field means "as drawn". Only what the user changed is reported to Shiny,
// as an object, or null when nothing is changed. It changes labels, not data, and applies to this chart only.

export type LabelKey = "title" | "caption" | "x" | "y" | "legend";
export type LabelValues = Partial<Record<LabelKey, string>>;

export interface ChartLabelsTexts {
  tool: LocalText;
  title: LocalText;
  hint: LocalText;
  reset: LocalText;
  resetAll: LocalText;
  note: LocalText;
  unavailable: LocalText;
  fields: Record<LabelKey, LocalText>;
}

export interface ChartLabelsProps {
  id?: string;
  value?: LabelValues | null;
  /** The chart's own text, from R, used as placeholders. */
  defaults?: LabelValues;
  /** False for a chart whose text cannot be edited (drawn with base graphics). */
  editable?: boolean;
  texts: ChartLabelsTexts;
  onChange?: (value: LabelValues | null) => void;
}

const KEYS: LabelKey[] = ["title", "caption", "x", "y", "legend"];

function ChartLabels({ id, value, defaults = {}, editable = true, texts, onChange }: ChartLabelsProps) {
  const lang = useLang();
  const [draft, setDraft] = useState<LabelValues>(value || {});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setDraft(value || {});
  }, [JSON.stringify(value || {})]);

  const emit = (next: LabelValues) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const clean: LabelValues = {};
      KEYS.forEach((k) => {
        const v = (next[k] || "").trim();
        if (v) clean[k] = v;
      });
      if (onChange) onChange(Object.keys(clean).length ? clean : null);
    }, 350);
  };
  const setField = (k: LabelKey, v: string) => {
    const next = { ...draft, [k]: v };
    setDraft(next);
    emit(next);
  };
  const editedKeys = KEYS.filter((k) => (draft[k] || "").trim() !== "");
  const shown = KEYS.filter((k) => k === "title" || k === "caption" || defaults[k] != null || editedKeys.includes(k));

  return (
    <ToolFrame
      id={id}
      icon={<IconType />}
      tooltip={texts.tool}
      changed={editedKeys.length > 0}
      title={texts.title}
      hint={editable ? texts.hint : undefined}
      footer={
        editable ? (
          <>
            <button
              type="button"
              className="cd-reset"
              disabled={editedKeys.length === 0}
              onClick={() => {
                setDraft({});
                if (timer.current) clearTimeout(timer.current);
                if (onChange) onChange(null);
              }}
            >
              <IconReset />
              <span>{tr(texts.resetAll, lang)}</span>
            </button>
            <div className="cd-note">{tr(texts.note, lang)}</div>
          </>
        ) : undefined
      }
    >
      {editable ? (
        <div className="cd-fields">
          {shown.map((k) => {
            const edited = (draft[k] || "").trim() !== "";
            return (
              <label key={k} className="cd-field">
                <span className="cd-field__label">
                  {tr(texts.fields[k], lang)}
                  {edited && (
                    <button
                      type="button"
                      className="cd-field__reset"
                      aria-label={`${tr(texts.reset, lang)}: ${tr(texts.fields[k], lang)}`}
                      title={tr(texts.reset, lang)}
                      onClick={(e) => {
                        e.preventDefault();
                        setField(k, "");
                      }}
                    >
                      <IconReset />
                    </button>
                  )}
                </span>
                <input
                  type="text"
                  className={edited ? "cd-input cd-input--edited" : "cd-input"}
                  value={draft[k] || ""}
                  placeholder={defaults[k] ?? ""}
                  onChange={(e) => setField(k, e.target.value)}
                />
              </label>
            );
          })}
        </div>
      ) : (
        <div className="cd-note">{tr(texts.unavailable, lang)}</div>
      )}
    </ToolFrame>
  );
}

export default InputAdapter<ChartLabelsProps, LabelValues | null>(ChartLabels, (value, setValue) => ({ value, onChange: setValue }));
