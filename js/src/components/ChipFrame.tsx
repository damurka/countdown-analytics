import React from "react";
import { tr, useLang, useMountSignal } from "../lang";
import type { LocalText } from "../lang";
import { usePopover } from "../usePopover";

// The shell every filter chip shares: the pill button and its popover (see usePopover for the behaviour).

export const svg = (paths: string[], size: number) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {paths.map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);
export const IconChevron = () => svg(["M6 9l6 6 6-6"], 14);
export const IconCheck = () => svg(["M5 12l4 4 10-10"], 14);
export const IconReset = () => svg(["M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8", "M3 3v5h5"], 14);
export const IconSearch = () => svg(["M11 4a7 7 0 100 14 7 7 0 000-14z", "M20 20l-4-4"], 16);

export interface ChipFrameProps {
  id?: string;
  label: LocalText;
  valueText: string;
  /** Shows a gold dot: the value differs from its default. */
  changed?: boolean;
  disabled?: boolean;
  title?: LocalText;
  hint?: LocalText;
  /** Rendered under the content, e.g. a Reset button. */
  footer?: (close: (returnFocus?: boolean) => void) => React.ReactNode;
  children: (close: (returnFocus?: boolean) => void) => React.ReactNode;
}

export function ChipFrame({ id, label, valueText, changed, disabled, title, hint, footer, children }: ChipFrameProps) {
  const lang = useLang();
  useMountSignal(id);
  const { open, setOpen, close, align, rootRef, triggerRef, popRef } = usePopover();
  const popId = `${id || "cd-chip"}-popover`;
  const heading = tr(title ?? label, lang);

  return (
    <span ref={rootRef} className="cd-chipwrap">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={!!disabled}
        className={`cd-chip${open ? " cd-chip--open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {changed && <span className="cd-chip__dot" />}
        <span className="cd-chip__key">{tr(label, lang)}</span>
        <strong className="cd-chip__value">{valueText}</strong>
        <span className="cd-chip__chev">
          <IconChevron />
        </span>
      </button>
      {open && (
        <div
          ref={popRef}
          id={popId}
          role="dialog"
          aria-label={heading}
          className={`cd-pop${align === "right" ? " cd-pop--right" : ""}`}
        >
          <div className="cd-pop__title">{heading}</div>
          {hint && <div className="cd-pop__hint">{tr(hint, lang)}</div>}
          {children(close)}
          {footer && <div className="cd-pop__foot">{footer(close)}</div>}
        </div>
      )}
    </span>
  );
}
