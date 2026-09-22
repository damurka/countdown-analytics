import React from "react";
import { InputAdapter } from "@/shiny.react";
import { ChipFrame, IconReset } from "./ChipFrame";
import { OptionList } from "./OptionList";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";
import type { ChipOption } from "../types";

// The compact single-choice filter chip from the app-shell design. It is a Shiny input (its value is
// input$<inputId>) built with shiny.react's InputAdapter, so R can push a new value or new options with
// updateReactInput(). Ports R's cdChipSelect() (apps/rmncah/ui/react/cd-react.R).

export interface ChipSelectProps {
  id?: string;
  label: LocalText;
  title?: LocalText;
  hint?: LocalText;
  options?: ChipOption[];
  value?: string | null;
  /** When set and different from the current value, the chip shows a gold dot and the popover offers a Reset. */
  defaultValue?: string | null;
  disabled?: boolean;
  onChange?: (value: string) => void;
  resetLabel?: LocalText;
  searchLabel?: LocalText;
  emptyLabel?: LocalText;
}

function ChipSelect({
  id,
  label,
  title,
  hint,
  options = [],
  value,
  defaultValue,
  disabled,
  onChange,
  resetLabel,
  searchLabel,
  emptyLabel,
}: ChipSelectProps) {
  const lang = useLang();
  const current = value == null ? "" : String(value);
  const selected = options.find((o) => String(o.key) === current);
  const changed = defaultValue != null && String(defaultValue) !== current;

  return (
    <ChipFrame
      id={id}
      label={label}
      title={title}
      hint={hint}
      disabled={disabled}
      changed={changed}
      valueText={selected ? tr(selected.text, lang) : current || "—"}
      footer={
        changed
          ? (close) => (
              <button
                type="button"
                className="cd-reset"
                onClick={() => {
                  if (onChange) onChange(String(defaultValue));
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
      {(close) => (
        <OptionList
          options={options}
          label={label}
          searchLabel={searchLabel}
          emptyLabel={emptyLabel}
          isSelected={(key) => String(key) === current}
          onPick={(key) => {
            if (onChange) onChange(String(key));
            close(true);
          }}
        />
      )}
    </ChipFrame>
  );
}

export default InputAdapter<ChipSelectProps, string>(ChipSelect, (value, setValue) => ({ value, onChange: setValue }));
