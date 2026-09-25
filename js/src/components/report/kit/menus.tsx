import React from "react";
import type { RbBlock } from "../types";
import { Big, Drop, Item, keep } from "./controls";

// Menus for a picture or chart that appear in more than one place (its toolbar above it, the Picture Format tab):
// written once here.

type T = (k: string) => string;
type Patch = (patch: Partial<RbBlock>) => void;

/** The shapes a picture (or a chart shown as a picture) can be cut to. */
export const SHAPES: [NonNullable<RbBlock["shape"]>, string, string[]][] = [
  ["rect", "shapeRect", ["M5 5h14v14H5z"]],
  ["rounded", "shapeRounded", ["M8 5h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z"]],
  ["circle", "shapeCircle", ["M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"]]
];

/** How the text sits around a block now: beside it (left, right) only when it is full width. */
export const wrapOf = (b: RbBlock) => ((b.size || "full") === "full" ? b.wrap || "inline" : "inline");

/** The settings that make the text wrap as asked: text wraps beside a full-width block only, so a narrow picture is
 *  made so (45% of the column unless it is narrow already). */
export const wrapPatch = (b: RbBlock, k: "inline" | "left" | "right"): Partial<RbBlock> =>
  k === "inline" ? { wrap: undefined } : { wrap: k, size: "full", width: (b.size || "full") === "full" && (b.width || 100) <= 70 ? b.width : 45 };

/** Wrap Text: in line with the text, or the text beside it on the left or right. */
export function WrapMenu({ b, t, tone, width = 220, onSelected }: { b: RbBlock; t: T; tone?: string; width?: number; onSelected: Patch }) {
  const now = wrapOf(b);
  return (
    <Drop width={width} trigger={(open, toggle) => <Big icon={["M4 6h16", "M4 10h7", "M4 14h7", "M4 18h16", "M14 9h6v6h-6z"]} label={t("wrapText")} menu on={open || now !== "inline"} tone={tone} onClick={toggle} />}>
      {(close) => (
        <>
          {([
            ["inline", t("wrapInline")],
            ["left", t("wrapLeft")],
            ["right", t("wrapRight")]
          ] as ["inline" | "left" | "right", string][]).map(([k, label]) => (
            <Item
              key={k}
              label={label}
              on={now === k}
              onClick={() => {
                onSelected(wrapPatch(b, k));
                close();
              }}
            />
          ))}
        </>
      )}
    </Drop>
  );
}

/** A quarter turn either way, or a flip. */
export const rotatePatch = (b: RbBlock, by: 90 | 270): Partial<RbBlock> => ({ rotate: ((((b.rotate || 0) + by) % 360) || undefined) as RbBlock["rotate"] });

/** Rotate: right or left 90 degrees, flip vertical or horizontal. */
export function RotateMenu({ b, t, tone, width = 210, onSelected }: { b: RbBlock; t: T; tone?: string; width?: number; onSelected: Patch }) {
  return (
    <Drop width={width} trigger={(open, toggle) => <Big icon={["M20 11a8 8 0 1 0-2.3 5.7", "M20 5v6h-6"]} label={t("rotate")} menu on={open} tone={tone} onClick={toggle} />}>
      {(close) => (
        <>
          {([
            [t("rotateRight"), () => onSelected(rotatePatch(b, 90))],
            [t("rotateLeft"), () => onSelected(rotatePatch(b, 270))],
            [t("flipV"), () => onSelected({ flip_v: !b.flip_v || undefined })],
            [t("flipH"), () => onSelected({ flip_h: !b.flip_h || undefined })]
          ] as [string, () => void][]).map(([label, act]) => (
            <Item
              key={label}
              label={label}
              onClick={() => {
                act();
                close();
              }}
            />
          ))}
        </>
      )}
    </Drop>
  );
}

/** A picture's styles (PowerPoint's picture styles gallery), each drawn small. */
export const PIC_STYLES: [NonNullable<RbBlock["pic_style"]> | "", string][] = [
  ["", "picStyleNone"],
  ["shadow", "picStyleShadow"],
  ["frame", "picStyleFrame"],
  ["soft", "picStyleSoft"],
  ["reflection", "picStyleReflection"]
];

/** The styles as a small gallery of cards. */
export function PicStyleGallery({ now, t, onPick }: { now?: string; t: (k: string) => string; onPick: (style: RbBlock["pic_style"]) => void }) {
  return (
    <div className="cd-rb-picstyles" role="group" aria-label={t("picStyles")}>
      {PIC_STYLES.map(([k, key]) => (
        <button
          key={k || "none"}
          type="button"
          title={t(key)}
          aria-label={t(key)}
          aria-pressed={(now || "") === k}
          className={(now || "") === k ? "cd-rb-picstyle cd-rb-picstyle--on" : "cd-rb-picstyle"}
          onMouseDown={keep}
          onClick={() => onPick((k || undefined) as RbBlock["pic_style"])}
        >
          <i className={"cd-rb-picstyle__img cd-rb-picstyle__img--" + (k || "none")} />
        </button>
      ))}
    </div>
  );
}

/** Colours to fill a text box with, and how much of what is under it shows through. */
export const OPACITIES: [number, string][] = [
  [1, "0%"],
  [0.75, "25%"],
  [0.55, "45%"],
  [0.35, "65%"]
];

/** A grid of colours to pick from (the theme's, the highlighter's...). */
export function SwatchGrid({ colours, onPick, titled = true }: { colours: string[]; onPick: (c: string) => void; titled?: boolean }) {
  return (
    <div className="cd-rb-swatchmenu__grid">
      {colours.map((c) => (
        <button key={c} type="button" className="cd-rb-swatch cd-rb-swatch--square" style={{ background: c }} aria-label={c} title={titled ? c : undefined} onMouseDown={keep} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}
