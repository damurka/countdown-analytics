import { useEffect, useRef, useState } from "react";

// Moving the view when it is bigger than the window (zoomed in), as Word's and PowerPoint's hand: drag with the Hand
// tool on, with Space held, or with the middle mouse button. The scrollbars still work too.

export function usePan(ref: React.RefObject<HTMLElement | null>, hand: boolean) {
  const [space, setSpace] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // Space held (not while typing): the hand, as long as it is held
  useEffect(() => {
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable=true]");
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e) || e.repeat) return;
      const el = ref.current;
      if (!el || !el.isConnected) return;
      setSpace(true);
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    const blur = () => setSpace(false);
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const start = (e: PointerEvent) => {
      if (!(hand || space || e.button === 1)) return;
      // the view moves; what is under the mouse is not clicked
      e.preventDefault();
      e.stopPropagation();
      drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      setDragging(true);
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      el.scrollLeft = d.left - (e.clientX - d.x);
      el.scrollTop = d.top - (e.clientY - d.y);
    };
    const end = () => {
      if (!drag.current) return;
      drag.current = null;
      setDragging(false);
    };
    // the middle button would otherwise start the browser's own scrolling
    const aux = (e: MouseEvent) => e.button === 1 && e.preventDefault();
    el.addEventListener("pointerdown", start, true);
    el.addEventListener("mousedown", aux, true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      el.removeEventListener("pointerdown", start, true);
      el.removeEventListener("mousedown", aux, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, [hand, space, ref.current]);

  const on = hand || space;
  /** A class for the view: the hand's cursor. */
  const className = dragging ? "cd-rb-panning cd-rb-panning--drag" : on ? "cd-rb-panning" : "";
  return { on, dragging, className };
}
