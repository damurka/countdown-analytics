import React from "react";
import { InputAdapter } from "@/shiny.react";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// A labelled checkbox. A Shiny input like the
// chips are: its value (TRUE/FALSE) is input$<id>, and R can push a new one with cd_update_input().
export interface CdCheckboxProps {
  id?: string;
  label: LocalText;
  value?: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}

function CdCheckbox({ id, label, value, disabled, onChange }: CdCheckboxProps) {
  const lang = useLang();
  return (
    <label className={"cd-check" + (disabled ? " cd-check--disabled" : "")}>
      <input
        type="checkbox"
        id={id}
        checked={!!value}
        disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.checked)}
      />
      <span className="cd-check__label">{tr(label, lang)}</span>
    </label>
  );
}

export default InputAdapter<CdCheckboxProps, boolean>(CdCheckbox, (value, setValue) => ({
  value,
  onChange: (v: boolean) => setValue(v),
}));
