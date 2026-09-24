import React from "react";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// The app's own button, for buttons and text links alike.
//
// A click is a one-shot Shiny event, not a counter: `id` is the full (ns()'d) input id, and the input has NO
// value until the first click -- so `observeEvent(input$<id>, ...)` never fires on load, and never needs
// ignoreInit. Same convention as EmptyState.tsx's action and FieldNumber.tsx's `_cleared`.
export interface CdButtonProps {
  id?: string;
  /** Always supplied translated from R (cd_text()), like every other text-carrying component. */
  label?: LocalText;
  /** A Font Awesome class ("far fa-circle-question"), resolved in R by cd_icon_class(). */
  icon?: string;
  /** "default" (outlined), "primary" (filled), "link" (text only), "bare" (no look of its own -- the caller's
   *  `className` styles it entirely). */
  variant?: "default" | "primary" | "link" | "bare";
  size?: "sm" | "md";
  /** Extra classes from the caller (e.g. "cd-wizard-footer__cta"). */
  className?: string;
  disabled?: boolean;
  /** Full width. */
  block?: boolean;
  title?: LocalText;
}

function CdButton({ id, label, icon, variant = "default", size = "md", className, disabled, block, title }: CdButtonProps) {
  const lang = useLang();
  const cls = [
    "cd-button",
    `cd-button--${variant}`,
    size === "sm" ? "cd-button--sm" : "",
    block ? "cd-button--block" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");
  const text = tr(label, lang);
  const tip = tr(title, lang);

  return (
    <button
      type="button"
      id={id}
      className={cls}
      disabled={disabled}
      title={tip || undefined}
      onClick={() => {
        if (!disabled && id) window.Shiny?.setInputValue?.(id, Date.now(), { priority: "event" });
      }}
    >
      {icon ? <i className={icon} aria-hidden="true" /> : null}
      {text ? <span className="cd-button__label">{text}</span> : null}
    </button>
  );
}

export default CdButton;
