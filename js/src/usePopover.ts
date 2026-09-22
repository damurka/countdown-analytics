import { useEffect, useRef, useState } from "react";

// Popover behaviour shared by the filter chips and the chart tools: closes on an outside click or Escape
// (returning focus to the trigger), flips to the right edge when it would overflow, and moves focus into its
// content on open.
export function usePopover() {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"left" | "right">("left");
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
    }
    if (pop) {
      const target =
        pop.querySelector<HTMLElement>('[data-autofocus="true"]') ||
        pop.querySelector<HTMLElement>('[aria-selected="true"]') ||
        pop.querySelector<HTMLElement>('[role="option"], input, button');
      if (target) target.focus();
    }
  }, [open]);

  return { open, setOpen, close, align, rootRef, triggerRef, popRef };
}
