import React, { useLayoutEffect, useState } from "react";
import { svg } from "./ChipFrame";
import { tr, useLang, useMountSignal } from "../lang";
import type { LocalText } from "../lang";
import { usePopover } from "../usePopover";

// The icon button and popover the chart tools share (label editor, "this chart only" view).

export const IconType = () => svg(["M5 7V4h14v3", "M12 4v16", "M9 20h6"], 18);
export const IconPalette = () => svg(["M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z", "M7.5 11h.01", "M10 7.5h.01", "M14.5 7.5h.01"], 18);
export const IconSliders = () => svg(["M4 7h9", "M17 7h3", "M4 17h3", "M11 17h9", "M15 5v4", "M9 15v4"], 18);

interface Props {
  id?: string;
  icon: React.ReactNode;
  tooltip: LocalText;
  /** Shows a gold dot: something on this chart differs from its default. */
  changed?: boolean;
  title: LocalText;
  hint?: LocalText;
  footer?: React.ReactNode;
  /** A wider popover for a tool with many fields: fixed to the viewport, so it never adds to the page's scroll. */
  wide?: boolean;
  /** The children draw the whole popover body (title, hint and footer included). */
  bare?: boolean;
  children: React.ReactNode;
}

export function ToolFrame({ id, icon, tooltip, changed, title, hint, footer, wide, bare, children }: Props) {
  const lang = useLang();
  useMountSignal(id);
  const { open, setOpen, align, rootRef, triggerRef, popRef } = usePopover();
  const popId = `${id || "cd-tool"}-popover`;

  // A wide popover is placed against the viewport (position: fixed) from the trigger's rectangle, so its height is bounded
  // by the window, it scrolls inside, and it cannot make the page or the card scroll. Under 720px it becomes a bottom sheet.
  const [place, setPlace] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!open || !wide) return undefined;
    const compute = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw < 720) {
        setPlace({ position: "fixed", left: 8, right: 8, bottom: 8, top: "auto", width: "auto", maxWidth: "none", maxHeight: Math.round(vh * 0.72) });
      } else {
        const top = Math.round(r.bottom + 8);
        setPlace({ position: "fixed", top, left: "auto", right: Math.max(12, Math.round(vw - r.right)), width: Math.min(400, vw - 24), maxWidth: "none", maxHeight: Math.max(260, vh - top - 12) });
      }
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open, wide]);
  return (
    <span ref={rootRef} className="cd-chipwrap">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={`cd-tool${open ? " cd-tool--open" : ""}`}
        aria-label={tr(tooltip, lang)}
        title={tr(tooltip, lang)}
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen(!open)}
      >
        {icon}
        {changed && <span className="cd-tool__dot" />}
      </button>
      {open && (
        <div ref={popRef} id={popId} role="dialog" aria-label={tr(title, lang)} className={`cd-pop cd-pop--tool${wide ? " cd-pop--wide" : ""}${align === "right" ? " cd-pop--right" : ""}`} style={wide ? place : undefined}>
          {bare ? (
            children
          ) : (
            <>
              <div className="cd-pop__title">{tr(title, lang)}</div>
              {hint && <div className="cd-pop__hint">{tr(hint, lang)}</div>}
              {children}
              {footer && <div className="cd-pop__foot">{footer}</div>}
            </>
          )}
        </div>
      )}
    </span>
  );
}
