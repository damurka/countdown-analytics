import { useEffect, useRef, useState } from "react";

// Popover behaviour shared by the filter chips and the chart tools: closes on an outside click or Escape
// (returning focus to the trigger), flips to the right edge when it would overflow, and moves focus into its
// content on open.
export function usePopover() {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"left" | "right">("left");
  // Vertical counterpart to `align` -- "below" (the default) unless the popover would run off the
  // bottom of the viewport, in which case it opens upward instead. Confirmed live: a tooltip trigger
  // low in a long checklist (Data Quality's own per-check explanations, Tooltip.tsx) had nowhere to
  // go below it and got cut off at the viewport edge with no way to flip, the same problem `align`
  // already solves for the right edge -- this is that same fix, the other axis.
  const [vAlign, setVAlign] = useState<"below" | "above">("below");
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus && triggerRef.current) triggerRef.current.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const pop = popRef.current;
    if (trigger && pop) {
      const r = trigger.getBoundingClientRect();
      setAlign(r.left + pop.offsetWidth > window.innerWidth - 16 ? "right" : "left");
      // The popover's own ALREADY-RENDERED position (its default "below" placement, since the
      // --above class hasn't been applied yet this render) -- not an approximation reconstructed
      // from the trigger's rect + offsetHeight, which was off by exactly whatever fixed CSS offset
      // each caller uses (Tooltip.tsx's 24px, ChipFrame.tsx's 40px) and could still let a popover
      // creep a few pixels past the intended margin even when that cruder check thought it was
      // fine -- confirmed live, measuring pop.getBoundingClientRect() directly instead.
      setVAlign(pop.getBoundingClientRect().bottom > window.innerHeight - 16 ? "above" : "below");
    }
    if (pop) {
      const target =
        pop.querySelector<HTMLElement>('[data-autofocus="true"]') ||
        pop.querySelector<HTMLElement>('[aria-selected="true"]') ||
        pop.querySelector<HTMLElement>('[role="option"], input, button');
      if (target) target.focus();
    }
  }, [open]);

  return { open, setOpen, close, align, vAlign, rootRef, triggerRef, popRef };
}
