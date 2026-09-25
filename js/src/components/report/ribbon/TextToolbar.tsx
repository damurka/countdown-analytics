import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { editingText, format } from "../RichText";
import { ICONS } from "../ui";
import { Big, Drop, keep, Small } from "../kit/controls";
import { placeAbove } from "../kit/place";

// The mini toolbar, as Word's, over text selected on the page: font, size, case, the format painter, bold, italic,
// underline, highlight and colour, lists, styles, centring, line spacing and the paragraph. Its buttons are the
// ribbon's own (made once in Ribbon, passed here), so both act the same.

interface Props {
  /** The ribbon's element: the toolbar is put in the builder (.cd-rb) it is in. */
  anchor: React.RefObject<HTMLDivElement>;
  fontBox: React.ReactNode;
  sizeBox: React.ReactNode;
  caseDrop: React.ReactNode;
  painterButton: React.ReactNode;
  markSplit: React.ReactNode;
  colourSplit: React.ReactNode;
  /** The line and paragraph spacing button, with its menu. */
  lineSpacing: React.ReactNode;
  /** The style cards, in the Styles menu (a click closes it). */
  styleCards: (close: () => void) => React.ReactNode;
  /** The paragraph's settings, in the Paragraph menu. */
  paraMenu: (close: () => void) => React.ReactNode;
  /** The font a size bigger or smaller. */
  onStep: (dir: 1 | -1) => void;
  listNow: "bullet" | "number" | null;
  onList: (kind: "bullet" | "number") => void;
  /** The alignment of the paragraph the caret is in. */
  align?: string;
  onAlign: (align: "left" | "center") => void;
  t: (k: string) => string;
}

export function TextToolbar(props: Props) {
  const { fontBox, sizeBox, caseDrop, painterButton, markSplit, colourSplit, paraMenu, t } = props;
  // shown while text is selected on the page, kept while it is being used
  const miniRef = useRef<HTMLDivElement>(null);
  const [mini, setMini] = useState<{ top: number; left: number } | null>(null);
  const miniHost = props.anchor.current?.closest(".cd-rb") || null;
  // it goes away, as Word's, when typing starts or the mouse moves well away from it, and comes back with the next
  // selection made with the mouse (or Shift and the arrows)
  const miniGone = useRef(false);
  useEffect(() => {
    const on = () => {
      if (miniRef.current && miniRef.current.contains(document.activeElement)) return;
      if (miniGone.current) return setMini(null);
      const sel = window.getSelection();
      const host = editingText();
      if (!sel || !sel.rangeCount || sel.isCollapsed || !host || host.getAttribute("aria-multiline") !== "true") {
        setMini(null);
        return;
      }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (!r.width) return setMini(null);
      const w = miniRef.current?.offsetWidth || 470;
      const h = miniRef.current?.offsetHeight || 72;
      setMini(placeAbove(r, w, h));
    };
    // as Word's, it fades as the mouse moves away from it
    const fade = (e: MouseEvent) => {
      const el = miniRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
      el.style.opacity = String(d < 24 ? 1 : Math.max(0.15, 1 - (d - 24) / 180));
      if (d > 220) {
        miniGone.current = true;
        setMini(null);
      }
    };
    const typed = (e: KeyboardEvent) => {
      if (miniRef.current && miniRef.current.contains(e.target as Node)) return;
      if (e.shiftKey && e.key.startsWith("Arrow")) {
        miniGone.current = false;
        return;
      }
      if (["Shift", "Control", "Meta", "Alt"].includes(e.key)) return;
      miniGone.current = true;
      setMini(null);
    };
    const pressed = (e: MouseEvent) => {
      if (miniRef.current && miniRef.current.contains(e.target as Node)) return;
      miniGone.current = false;
    };
    const released = () => setTimeout(on, 0);
    document.addEventListener("selectionchange", on);
    window.addEventListener("scroll", on, true);
    document.addEventListener("mousemove", fade);
    document.addEventListener("keydown", typed, true);
    document.addEventListener("mousedown", pressed, true);
    document.addEventListener("mouseup", released);
    return () => {
      document.removeEventListener("selectionchange", on);
      window.removeEventListener("scroll", on, true);
      document.removeEventListener("mousemove", fade);
      document.removeEventListener("keydown", typed, true);
      document.removeEventListener("mousedown", pressed, true);
      document.removeEventListener("mouseup", released);
    };
  }, []);

  return (
    <>
      {mini &&
        miniHost &&
        createPortal(
          <div ref={miniRef} className="cd-rb-mini" style={{ top: mini.top, left: mini.left }} role="toolbar" aria-label={t("text")} onMouseDown={(e) => (e.target as HTMLElement).tagName !== "INPUT" && (e.target as HTMLElement).tagName !== "SELECT" && keep(e)}>
            <div className="cd-rb-mini__rows">
              <div className="cd-rb-mini__row">
                {fontBox}
                {sizeBox}
                <Small icon={ICONS.fontGrow} label={t("growFont")} keys="Ctrl+Shift+>" onClick={() => props.onStep(1)} />
                <Small icon={ICONS.fontShrink} label={t("shrinkFont")} keys="Ctrl+Shift+<" onClick={() => props.onStep(-1)} />
                {caseDrop}
                {painterButton}
              </div>
              <div className="cd-rb-mini__row">
                <Small icon={ICONS.bold} label={t("bold")} keys="Ctrl+B" onClick={() => format("bold")} />
                <Small icon={ICONS.italic} label={t("italic")} keys="Ctrl+I" onClick={() => format("italic")} />
                <Small icon={ICONS.underline} label={t("underline")} keys="Ctrl+U" onClick={() => format("underline")} />
                {markSplit}
                {colourSplit}
                <Small icon={ICONS.bullets} label={t("bullets")} keys="Ctrl+Shift+8" on={props.listNow === "bullet"} onClick={() => props.onList("bullet")} />
                <Small icon={ICONS.numbering} label={t("numbering")} keys="Ctrl+Shift+7" on={props.listNow === "number"} onClick={() => props.onList("number")} />
              </div>
            </div>
            <span className="cd-rb-mini__sep" />
            <Drop width={300} trigger={(open, toggle) => <Big icon={["M5 19h4", "M7 19L12 5l5 14", "M9 14h6", "M16 8l3-3 2 2-3 3"]} label={t("styles")} menu on={open} tone="purple" onClick={toggle} />}>
              {(close) => <div className="cd-rb-mini__styles">{props.styleCards(close)}</div>}
            </Drop>
            <Big icon={ICONS.alignCenter} label={t("alignCenter")} keys="Ctrl+Shift+E" on={(props.align || "left") === "center"} onClick={() => props.onAlign((props.align || "left") === "center" ? "left" : "center")} />
            {props.lineSpacing}
            <Drop width={250} trigger={(open, toggle) => <Big icon={ICONS.paragraph} label={t("paragraphGroup")} menu on={open} tone="blue" onClick={toggle} />}>
              {paraMenu}
            </Drop>
          </div>,
          miniHost
        )}
    </>
  );
}
