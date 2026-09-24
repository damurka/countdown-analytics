import React from "react";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";
import { usePopover } from "../usePopover";

export interface TooltipProps {
  /** The explanation text shown in the popover. */
  text: LocalText;
  /** Accessible label for the trigger button -- not shown, read by screen readers/hover title only. */
  label?: LocalText;
  /** This check's own pass/fail state -- when given, the trigger IS the row's own status glyph
   *  (hovering, or focusing/clicking it for keyboard and touch, reveals the explanation) instead of
   *  a separate small "i" icon next to it. */
  status?: "pass" | "warn";
}

export default function Tooltip({ text, label, status }: TooltipProps) {
  const lang = useLang();
  const { open, setOpen, align, vAlign, rootRef, triggerRef, popRef } = usePopover();
  const labelText = label ? tr(label, lang) : undefined;
  const hoverProps = { onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false) };

  return (
    <span ref={rootRef} className="cd-tooltip" {...hoverProps}>
      <button
        ref={triggerRef}
        type="button"
        className={`cd-tooltip__trigger${status ? ` cd-tooltip__trigger--${status}` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        aria-label={labelText}
        title={labelText}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(!open)}
      >
        {status === "pass" && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12l3 3 5-6" />
          </svg>
        )}
        {status === "warn" && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M12 3l10 18H2z" />
            <path d="M12 10v4M12 17h.01" />
          </svg>
        )}
        {!status && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01M12 11v5" />
          </svg>
        )}
      </button>
      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={labelText}
          className={`cd-pop cd-tooltip__pop${align === "right" ? " cd-pop--right" : ""}${vAlign === "above" ? " cd-tooltip__pop--above" : ""}`}
          {...hoverProps}
        >
          {tr(text, lang)}
        </div>
      )}
    </span>
  );
}
