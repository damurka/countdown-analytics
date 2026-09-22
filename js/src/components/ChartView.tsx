import React from "react";
import { InputAdapter } from "@/shiny.react";
import { IconReset } from "./ChipFrame";
import { IconSliders, ToolFrame } from "./ToolFrame";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// "This chart only" options that every chart supports, whatever it plots: which way round it is drawn, the
// text size and where the legend sits. Only what differs from the default is reported to Shiny, as an
// object, or null when nothing differs. Orientation is "auto" by default: a chart with many regions on its
// horizontal axis is turned so the regions run down the side (R decides; see apply_chart_options()).

export interface ChartViewValue {
  /** null/undefined = automatic. */
  flip?: boolean | null;
  size?: "s" | "m" | "l";
  legend?: "right" | "bottom" | "hidden";
}

export interface ChartViewTexts {
  tool: LocalText;
  title: LocalText;
  hint: LocalText;
  reset: LocalText;
  orientation: LocalText;
  auto: LocalText;
  swap: LocalText;
  keep: LocalText;
  size: LocalText;
  legend: LocalText;
  right: LocalText;
  bottom: LocalText;
  hidden: LocalText;
}

export interface ChartViewProps {
  id?: string;
  value?: ChartViewValue | null;
  /** What Auto did for this chart right now, shown next to it, e.g. "regions down". */
  autoNote?: LocalText;
  texts: ChartViewTexts;
  onChange?: (value: ChartViewValue | null) => void;
}

interface SegProps<T extends string> {
  label: LocalText;
  value: T;
  options: { key: T; text: LocalText }[];
  onPick: (key: T) => void;
  note?: LocalText;
}

function Seg<T extends string>({ label, value, options, onPick, note }: SegProps<T>) {
  const lang = useLang();
  return (
    <div className="cd-seg-row">
      <div className="cd-seg-row__label">
        {tr(label, lang)}
        {note ? <span className="cd-seg-row__note"> · {tr(note, lang)}</span> : null}
      </div>
      <div role="group" aria-label={tr(label, lang)} className="cd-seg">
        {options.map((o) => (
          <button key={o.key} type="button" aria-pressed={value === o.key ? "true" : "false"} className={value === o.key ? "cd-seg__btn cd-seg__btn--on" : "cd-seg__btn"} onClick={() => onPick(o.key)}>
            {tr(o.text, lang)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChartView({ id, value, autoNote, texts, onChange }: ChartViewProps) {
  const lang = useLang();
  const v = value || {};
  const orientation: "auto" | "swap" | "keep" = v.flip == null ? "auto" : v.flip ? "swap" : "keep";
  const size = v.size || "m";
  const legend = v.legend || "right";
  const changed = v.flip != null || size !== "m" || legend !== "right";

  const emit = (patch: ChartViewValue) => {
    const next: ChartViewValue = { ...v, ...patch };
    const clean: ChartViewValue = {};
    if (next.flip != null) clean.flip = next.flip;
    if (next.size && next.size !== "m") clean.size = next.size;
    if (next.legend && next.legend !== "right") clean.legend = next.legend;
    if (onChange) onChange(Object.keys(clean).length ? clean : null);
  };

  return (
    <ToolFrame
      id={id}
      icon={<IconSliders />}
      tooltip={texts.tool}
      changed={changed}
      title={texts.title}
      hint={texts.hint}
      footer={
        <button type="button" className="cd-reset" disabled={!changed} onClick={() => onChange && onChange(null)}>
          <IconReset />
          <span>{tr(texts.reset, lang)}</span>
        </button>
      }
    >
      <Seg
        label={texts.orientation}
        value={orientation}
        note={orientation === "auto" ? autoNote : undefined}
        options={[
          { key: "auto", text: texts.auto },
          { key: "swap", text: texts.swap },
          { key: "keep", text: texts.keep },
        ]}
        onPick={(k) => emit({ flip: k === "auto" ? null : k === "swap" })}
      />
      <Seg
        label={texts.size}
        value={size}
        options={[
          { key: "s", text: "S" },
          { key: "m", text: "M" },
          { key: "l", text: "L" },
        ]}
        onPick={(k) => emit({ size: k })}
      />
      <Seg
        label={texts.legend}
        value={legend}
        options={[
          { key: "right", text: texts.right },
          { key: "bottom", text: texts.bottom },
          { key: "hidden", text: texts.hidden },
        ]}
        onPick={(k) => emit({ legend: k })}
      />
    </ToolFrame>
  );
}

export default InputAdapter<ChartViewProps, ChartViewValue | null>(ChartView, (value, setValue) => ({ value, onChange: setValue }));
