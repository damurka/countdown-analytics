import React from "react";
import { svg } from "./ChipFrame";
import { tr, useLang, useMountSignal } from "../lang";
import type { LocalText } from "../lang";
import { usePopover } from "../usePopover";

// The icon button and popover the chart tools share (label editor, "this chart only" view).

export const IconType = () => svg(["M5 7V4h14v3", "M12 4v16", "M9 20h6"], 18);
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
  children: React.ReactNode;
}

export function ToolFrame({ id, icon, tooltip, changed, title, hint, footer, children }: Props) {
  const lang = useLang();
  useMountSignal(id);
  const { open, setOpen, align, rootRef, triggerRef, popRef } = usePopover();
  const popId = `${id || "cd-tool"}-popover`;
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
        <div ref={popRef} id={popId} role="dialog" aria-label={tr(title, lang)} className={`cd-pop cd-pop--tool${align === "right" ? " cd-pop--right" : ""}`}>
          <div className="cd-pop__title">{tr(title, lang)}</div>
          {hint && <div className="cd-pop__hint">{tr(hint, lang)}</div>}
          {children}
          {footer && <div className="cd-pop__foot">{footer}</div>}
        </div>
      )}
    </span>
  );
}
