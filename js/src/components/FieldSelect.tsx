import React from "react";
import { InputAdapter } from "@/shiny.react";
import { tr, useLang, useMountSignal } from "../lang";
import type { LocalText } from "../lang";
import type { ChipOption } from "../types";

// An inline labeled <select> (label above, dropdown, a hint line below -- see .cd-field-stack/.cd-field-hint
// in styles.css), matching FieldNumber.tsx's own layout: a picker among a fixed set of choices instead of a
// free-typed number (e.g. Load Data's "Survey data start year", constrained to the years actually present in
// the loaded dataset). A plain native <select>, not ChipSelect's popover+OptionList: the design's own "Select"
// token (Patterns.dc.html) IS a plain, appearance:none <select> with a background-image chevron, not a custom
// overlay -- and a native select's own dropdown is drawn by the browser outside normal document flow, so it
// can never be clipped by an ancestor's overflow:hidden. This replaced shiny::selectInput(): that secretly
// still initializes selectize client-side unless selectize=FALSE is passed (Shiny's own default), which is why
// it rendered differently-sized from every other field here and needed a dropdownParent:"body" workaround to
// escape .cd-card's own overflow:hidden (its rounded corners) clipping the open list -- both problems this
// sidesteps entirely by not using selectize at all.

export interface FieldSelectProps {
  id?: string;
  label: LocalText;
  hint?: LocalText;
  options?: ChipOption[];
  value?: string | null;
  onChange?: (value: string) => void;
}

function FieldSelect({ id, label, hint, options = [], value, onChange }: FieldSelectProps) {
  // Sends input$<id>__mounted so a caller can safely gate a value push on cd_mounted() (_shared/R/core (and components/)) --
  // FieldNumber.tsx was missing this same call and it turned out to matter directly: a national_rates.R gate on
  // cd_mounted() for a field built without it waits on a signal that never arrives, permanently, not a race.
  // No current caller of cd_field_select() gates on cd_mounted() yet, but there's no reason this one field should
  // be the exception once something does.
  useMountSignal(id);
  const lang = useLang();
  const current = value == null ? "" : String(value);

  return (
    <label className="cd-field-stack">
      <span className="cd-field-label">{tr(label, lang)}</span>
      <select
        id={id}
        className="cd-field-input cd-field-select"
        value={current}
        onChange={(e) => onChange && onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={String(o.key)} value={String(o.key)}>
            {tr(o.text, lang)}
          </option>
        ))}
      </select>
      {hint ? <span className="cd-field-hint">{tr(hint, lang)}</span> : null}
    </label>
  );
}

export default InputAdapter<FieldSelectProps, string>(FieldSelect, (value, setValue) => ({
  value,
  onChange: (v: string) => setValue(v),
}));
