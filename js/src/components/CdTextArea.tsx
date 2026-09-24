import React from "react";
import { InputAdapter } from "@/shiny.react";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// A labelled multi-line text field.
// A Shiny input: its text is input$<id>; R can push new text with cd_update_input().
export interface CdTextAreaProps {
  id?: string;
  label?: LocalText;
  placeholder?: LocalText;
  value?: string;
  /** Visible height in px. */
  height?: number;
  onChange?: (value: string) => void;
}

function CdTextArea({ id, label, placeholder, value, height = 150, onChange }: CdTextAreaProps) {
  const lang = useLang();
  return (
    <label className="cd-field-stack">
      {label ? <span className="cd-field-label">{tr(label, lang)}</span> : null}
      <textarea
        id={id}
        className="cd-field-input cd-textarea"
        style={{ height }}
        value={value ?? ""}
        placeholder={tr(placeholder, lang) || undefined}
        onChange={(e) => onChange && onChange(e.target.value)}
      />
    </label>
  );
}

export default InputAdapter<CdTextAreaProps, string>(CdTextArea, (value, setValue) => ({
  value,
  onChange: (v: string) => setValue(v),
}));
