import React, { useEffect, useRef, useState } from "react";
import { placeBeside } from "./place";

/** The chart Customize pop-up: next to the chart it edits (to its right, or its left when there is no room), placed
 *  against the window so the pages' zoom does not move it. Escape or a click elsewhere closes it. */
export function ChartStylePop({ anchorId, deps, onClose, children }: { anchorId: string; deps: unknown[]; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<React.CSSProperties>({ visibility: "hidden" });
  useEffect(() => {
    const compute = () => {
      const anchor = document.getElementById(anchorId);
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const width = Math.min(380, window.innerWidth - 24);
      const { top, left, maxHeight } = placeBeside(r, width);
      setPlace({ position: "fixed", left, top, width, maxHeight });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [anchorId, ...deps]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const anchor = document.getElementById(anchorId);
      if (ref.current && !ref.current.contains(target) && !(anchor && anchor.contains(target))) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorId]);
  return (
    <div ref={ref} role="dialog" className="cd-pop cd-pop--tool cd-pop--wide cd-rb-stylepop" style={place}>
      {children}
    </div>
  );
}

