import React, { useEffect, useRef, useState } from "react";
import { InputAdapter } from "@/shiny.react";
import { tr, useLang, useMountSignal } from "../lang";
import type { LocalText } from "../lang";

// An inline labeled numeric field (label above, input, a hint line below -- see .cd-field-stack/.cd-field-hint
// in styles.css) with the same live validation ChipNumber.tsx already does for filter-chip numbers: as the
// value changes, it's checked against min/max, an out-of-range entry turns the field red with an inline error
// in place of the hint, and only a *valid* value gets pushed to Shiny (debounced), rather than pushing
// whatever's on every keystroke the way shiny::numericInput() itself does. Built as its own component rather
// than reusing ChipNumber directly: ChipNumber is a popover-triggered chip (ChipFrame), not an always-visible
// inline field, which is what a grid of National Rates fields needs.
//
// type="text", not type="number": the design's own reference markup uses a plain text input (inputMode
// "decimal" still gets the numeric keyboard on mobile) -- type="number" draws the browser's native spin-button
// arrows, which weren't part of the design and, combined with the round-trip note below, could look like the
// value was "looping"/cycling on its own while typing.

export interface FieldNumberProps {
  id?: string;
  label: LocalText;
  hint?: LocalText;
  value?: number | null;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  invalidLabel?: LocalText;
  requiredLabel?: LocalText;
  /** A short unit shown as a trailing addon inside the field itself ("%"), not just named in the hint line
   *  below -- the design's own "Number with unit" token (Patterns.dc.html). Plain text, not LocalText: a "%"
   *  (the only unit any field here actually uses) is the same symbol in every language this app supports,
   *  so there's no per-language variant to carry. Omit it and the field renders exactly as before -- a plain
   *  bordered input, no addon box -- so every existing caller is unaffected. */
  unit?: string;
  onChange?: (value: number) => void;
}

// step stays in the props type (cd_field_number() on the R side still accepts/passes it) for API symmetry with
// cd_chip_number(), even though type="text" (see above) means there's no native step behavior left to apply it
// to -- validation is entirely the min/max check below, not the browser's own number-input stepping.
function FieldNumber({ id, label, hint, value, min, max, required, invalidLabel, requiredLabel, unit, onChange }: FieldNumberProps) {
  // Sends input$<id>__mounted the moment this field exists in the DOM -- was missing entirely, unlike every
  // other React input in this app (ChipFrame/Sidebar/HeaderBar/ToolFrame all call this). cd_mounted() (R side,
  // _shared/R/core (and components/)) waits on exactly this signal before treating a field as safe to push a value to; a
  // caller that gates a push on cd_mounted() for a field built from THIS component would wait on a signal that
  // never arrives, i.e. the push never happens at all -- not a race, a permanent block. (national_rates.R hit
  // this directly: gating its own value-push on cd_mounted() for these fields made every one of them stay
  // empty forever, worse than the race it was meant to fix, until this was added.)
  useMountSignal(id);
  const lang = useLang();
  const current = value == null ? null : Number(value);
  const [text, setText] = useState(current == null ? "" : String(current));
  const [focused, setFocused] = useState(false);
  // True once the user has actually typed in this field -- distinct from `missing` (empty + required),
  // which is *also* true of a required field's own starting state, before anyone has touched it or R has
  // ever pushed it a value. Confirmed live: national_rates.R pushes a real, correct auto-extracted value
  // (e.g. anc1 = 78.1) to a field that starts empty+required, and the sync effect below used to refuse to
  // apply it -- `missing` was already true from the field's very first render, so the guard meant for
  // protecting a user's own rejected entry ("don't erase what's on screen") fired for a field nobody had
  // ever put anything into, permanently. Every National Rates field stayed on "Not set" forever, no matter
  // what a real survey upload extracted, until a user manually typed into that exact field first (which
  // reset `text` to non-empty, making `missing` false, unblocking the sync for good). `touched` narrows the
  // guard to its actual intent: keep a REJECTED EDIT visible, not block a field that has simply never heard
  // from the user at all.
  const [touched, setTouched] = useState(false);

  // Follows the value when it changes from *outside* -- but never while the field is focused. R pushes a
  // value on every cache change, including the one caused by this very field's own edit committing a moment
  // ago (see national_rates_server()'s observe() block: all of a group's fields share one observeEvent()/
  // set_survey_estimates() call, so committing *any one* field re-syncs every field in the group, not just the
  // one that changed) -- comparing the echoed value against what's locally typed (by parsed-number equality)
  // isn't reliable enough to guard against that: it still glitched, most likely from an R <-> JS round-trip on
  // a non-integer value (a float that reads identically but doesn't compare bit-for-bit equal) landing back as
  // a "different" number and resetting the field's text mid-keystroke, which reads as the value looping/
  // stuttering while typing. Gating on focus instead sidesteps the comparison question entirely: nothing
  // external can touch the field while the user's actively in it, and it syncs cleanly the moment they leave.
  const empty = text.trim() === "";
  const parsed = empty ? NaN : Number(text);
  const valid = Number.isFinite(parsed) && (min == null || parsed >= min) && (max == null || parsed <= max);
  const bad = !empty && !valid;
  const missing = empty && !!required;

  // Never silently snap back to the last accepted value while what's on screen is invalid, or (for a
  // required field) empty *because the user cleared it themselves* -- syncing straight back to `current` the
  // moment focus left the field, the previous behavior, erased the rejected input immediately: its red
  // border/error hint vanished along with it, so anyone not watching closely at exactly that moment had
  // nothing left to tell them their entry hadn't been accepted. Keeping the bad text (and its error/warning
  // styling) on screen until the user actually fixes it themselves, or a genuine new value arrives from
  // outside (current changes), makes the rejection unmistakable instead of invisible -- `missing` alone isn't
  // enough to know that's what's happening (see `touched`'s own comment above).
  useEffect(() => {
    if (focused || bad || (missing && touched)) return;
    setText(current == null ? "" : String(current));
  }, [current, focused, bad, missing, touched]);

  // A ref, not just the setTimeout return value local to the effect: onBlur (below) needs to reach in and
  // cancel a still-pending timer synchronously, from a different callback than the one that created it.
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!valid || parsed === current) return undefined;
    commitTimer.current = setTimeout(() => {
      onChange && onChange(parsed);
      commitTimer.current = null;
    }, 400);
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, [text]);

  // A required field the user just CLEARED is a real edit too -- one the server needs to hear about, not
  // just this component's own display. `onChange` (above) only ever fires for a *valid* value: its own guard
  // (`if (!valid...) return`) skips scheduling anything the moment the field goes empty, so clearing a field
  // was previously invisible past the browser -- whatever value was last committed stayed in cache()
  // forever, no matter how plainly "Not set. Needed for denominators." the field showed on screen, and
  // step_national_rates_complete() (step_status.R) kept reporting the step as done, leaving Continue enabled.
  // A plain custom Shiny input, `${id}_cleared`, not a second onChange call: onChange's own type is
  // `(value: number) => void`, and there's no real number that means "empty" -- a sentinel like NaN would
  // just serialize to JSON null and be indistinguishable, server-side, from this field never having echoed
  // at all (exactly the ambiguity `touched`, above, exists to avoid). Firing a dedicated event, the same
  // `${id}_<verb>` pattern FileUploadZone.tsx's own Reset icon already uses, gives the server an
  // unambiguous, explicit "the user cleared this" signal instead of overloading the value channel.
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!(empty && current != null)) return undefined;
    clearTimer.current = setTimeout(() => {
      window.Shiny?.setInputValue?.(`${id}_cleared`, Date.now(), { priority: "event" });
      clearTimer.current = null;
    }, 400);
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, [empty, current, id]);

  // Type a valid value and tab away fast (inside the 400ms debounce window above) and, without this, the
  // value was silently lost: blur flips `focused` to false, which fires the sync-from-outside effect above
  // immediately -- but `current` is still the OLD value (the debounced onChange hasn't fired yet), so that
  // effect resets the field's text right back to it. The debounce effect then re-runs too (its own dependency,
  // `text`, just changed), sees text now matches current again, and never schedules a new timer -- the typed
  // value is gone with nothing left to commit it. Flushing immediately on blur, instead of waiting for the
  // debounce, means `current` is already the new value by the time the sync effect runs, so it has nothing to
  // revert.
  const commitPending = () => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    if (valid && parsed !== current && onChange) {
      onChange(parsed);
    } else if (empty && current != null) {
      window.Shiny?.setInputValue?.(`${id}_cleared`, Date.now(), { priority: "event" });
    }
  };

  const stateClass = bad ? " cd-field-input--bad" : missing ? " cd-field-input--warn" : "";
  const input = (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      className={unit ? "cd-field-input-group__control" : `cd-field-input${stateClass}`}
      value={text}
      aria-invalid={bad ? "true" : undefined}
      onChange={(e) => {
        setTouched(true);
        setText(e.target.value);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        commitPending();
        setFocused(false);
      }}
    />
  );

  return (
    <label className="cd-field-stack">
      <span className="cd-field-label">{tr(label, lang)}</span>
      {unit ? (
        <span className={`cd-field-input-group${stateClass}`}>
          {input}
          <span className="cd-field-input-group__unit">{unit}</span>
        </span>
      ) : (
        input
      )}
      {bad ? (
        <span className="cd-field-hint cd-field-hint--bad" role="alert">
          {tr(invalidLabel, lang) || `${min ?? ""}–${max ?? ""}`}
        </span>
      ) : missing ? (
        <span className="cd-field-hint cd-field-hint--warn">{tr(requiredLabel, lang)}</span>
      ) : (
        <span className="cd-field-hint">{tr(hint, lang)}</span>
      )}
    </label>
  );
}

export default InputAdapter<FieldNumberProps, number | null>(FieldNumber, (value, setValue) => ({
  value,
  onChange: (v: number) => setValue(v),
}));
