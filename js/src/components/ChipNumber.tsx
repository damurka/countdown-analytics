import React, { useEffect, useState } from "react";
import { InputAdapter } from "@/shiny.react";
import { ChipFrame, IconReset } from "./ChipFrame";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// A filter chip holding one number, for example a threshold. The popover has the number field and optional
// quick picks; a value is sent once it is valid (inside min..max), after a short pause while typing.

export interface ChipNumberProps {
  id?: string;
  label: LocalText;
  title?: LocalText;
  hint?: LocalText;
  value?: number | null;
  defaultValue?: number | null;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  picks?: number[];
  disabled?: boolean;
  onChange?: (value: number) => void;
  resetLabel?: LocalText;
  invalidLabel?: LocalText;
}

function ChipNumber({
  id,
  label,
  title,
  hint,
  value,
  defaultValue,
  min,
  max,
  step,
  unit = "",
  picks = [],
  disabled,
  onChange,
  resetLabel,
  invalidLabel,
}: ChipNumberProps) {
  const lang = useLang();
  const current = value == null ? null : Number(value);
  const [text, setText] = useState(current == null ? "" : String(current));
  const changed = defaultValue != null && current !== defaultValue;

  // follow the value when it changes from outside (R pushes a value, or a pick / reset)
  useEffect(() => {
    setText(current == null ? "" : String(current));
  }, [current]);

  const parsed = text.trim() === "" ? NaN : Number(text);
  const valid = Number.isFinite(parsed) && (min == null || parsed >= min) && (max == null || parsed <= max);

  useEffect(() => {
    if (!valid || parsed === current) return undefined;
    const timer = setTimeout(() => onChange && onChange(parsed), 400);
    return () => clearTimeout(timer);
  }, [text]);

  const commit = (n: number) => {
    setText(String(n));
    if (onChange) onChange(n);
  };

  return (
    <ChipFrame
      id={id}
      label={label}
      title={title}
      hint={hint}
      disabled={disabled}
      changed={changed}
      valueText={current == null ? "—" : `${current}${unit}`}
      footer={
        changed
          ? (close) => (
              <button
                type="button"
                className="cd-reset"
                onClick={() => {
                  commit(Number(defaultValue));
                  close(true);
                }}
              >
                <IconReset />
                <span>{tr(resetLabel, lang) || "Reset"}</span>
              </button>
            )
          : undefined
      }
    >
      {() => (
        <div className="cd-number">
          <label className={`cd-number__field${valid || text === "" ? "" : " cd-number__field--bad"}`}>
            <input
              type="number"
              inputMode="decimal"
              data-autofocus="true"
              value={text}
              min={min}
              max={max}
              step={step}
              aria-invalid={valid || text === "" ? undefined : "true"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid) commit(parsed);
              }}
            />
            {unit && <span className="cd-number__unit">{unit}</span>}
          </label>
          {!valid && text !== "" && (
            <div className="cd-number__error" role="alert">
              {tr(invalidLabel, lang) || `${min ?? ""} – ${max ?? ""}`}
            </div>
          )}
          {picks.length > 0 && (
            <div className="cd-picks">
              {picks.map((p) => (
                <button key={p} type="button" className={`cd-pick${current === p ? " cd-pick--on" : ""}`} onClick={() => commit(p)}>
                  {p}
                  {unit}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </ChipFrame>
  );
}

export default InputAdapter<ChipNumberProps, number | null>(ChipNumber, (value, setValue) => ({
  value,
  onChange: (v: number) => setValue(v),
}));
