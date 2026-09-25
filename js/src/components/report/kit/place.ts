// Where a floating box goes next to what it is about (a selection, a chart), inside the window. Shared by the toolbars
// over selected text and over a selected chart or picture, and the Customize pop-up.

interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

/** Above the thing, centred on it (under it when there is no room above `minTop`), kept inside the window. */
export function placeAbove(r: Rect, w: number, h: number, gap = 10, minTop = 8): { top: number; left: number } {
  const top = r.top - h - gap >= minTop ? r.top - h - gap : Math.min(window.innerHeight - h - 8, r.bottom + gap);
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  return { top, left };
}

/** To the right of the thing (to its left when there is no room), from its top, kept inside the window. */
export function placeBeside(r: Rect, w: number, minTop = 70, tall = 320): { top: number; left: number; maxHeight: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = r.right + 12;
  if (left + w > vw - 12) left = r.left - 12 - w;
  if (left < 12) left = Math.max(12, vw - w - 12);
  const top = Math.min(Math.max(r.top, minTop), Math.max(minTop, vh - tall));
  return { top, left, maxHeight: vh - top - 12 };
}
