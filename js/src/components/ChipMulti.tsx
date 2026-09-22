import React from "react";
import { InputAdapter } from "@/shiny.react";
import { ChipFrame, IconCheck } from "./ChipFrame";
import { OptionList } from "./OptionList";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";
import type { ChipOption } from "../types";

// The multi-choice filter chip (for example, several years). Choosing nothing means "all", like the
// "All years" entry it replaces, and is reported to Shiny as "" so the server sees what it always saw.
// The value is otherwise the array of chosen keys.

type Value = string | string[] | null;

export interface ChipMultiProps {
  id?: string;
  label: LocalText;
  title?: LocalText;
  hint?: LocalText;
  options?: ChipOption[];
  value?: Value;
  disabled?: boolean;
  onChange?: (value: Value) => void;
  /** Shown on the chip, and on the button that clears the choice, when nothing is chosen. */
  allLabel?: LocalText;
  searchLabel?: LocalText;
  emptyLabel?: LocalText;
}

const asList = (v: Value | undefined): string[] =>
  v == null ? [] : (Array.isArray(v) ? v : [v]).map(String).filter((x) => x !== "");

function ChipMulti({ id, label, title, hint, options = [], value, disabled, onChange, allLabel, searchLabel, emptyLabel }: ChipMultiProps) {
  const lang = useLang();
  const chosen = asList(value);
  const text = (key: string) => {
    const o = options.find((x) => String(x.key) === key);
    return o ? tr(o.text, lang) : key;
  };
  const emit = (next: string[]) => {
    if (onChange) onChange(next.length ? next : "");
  };
  const toggle = (key: string) => emit(chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key]);

  // keep the options' own order in the summary
  const ordered = options.map((o) => String(o.key)).filter((k) => chosen.includes(k));
  const valueText =
    ordered.length === 0
      ? tr(allLabel, lang) || "All"
      : ordered.length <= 2
        ? ordered.map(text).join(", ")
        : `${ordered.slice(0, 2).map(text).join(", ")} +${ordered.length - 2}`;

  return (
    <ChipFrame
      id={id}
      label={label}
      title={title}
      hint={hint}
      disabled={disabled}
      changed={ordered.length > 0}
      valueText={valueText}
      footer={(close) => (
        <button
          type="button"
          className="cd-reset"
          onClick={() => {
            emit([]);
            close(true);
          }}
        >
          {ordered.length === 0 && <IconCheck />}
          <span>{tr(allLabel, lang) || "All"}</span>
        </button>
      )}
    >
      {() => (
        <OptionList
          multi
          options={options}
          label={label}
          searchLabel={searchLabel}
          emptyLabel={emptyLabel}
          isSelected={(key) => chosen.includes(String(key))}
          onPick={(key) => toggle(String(key))}
        />
      )}
    </ChipFrame>
  );
}

export default InputAdapter<ChipMultiProps, Value>(ChipMulti, (value, setValue) => ({ value, onChange: setValue }));
