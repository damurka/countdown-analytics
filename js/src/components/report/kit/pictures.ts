import { useEffect, useRef } from "react";
import type { RbDesign, RbTheme } from "../types";

// What every builder does with pictures and themes, written once.

let seq = 0;
const newAssetId = () => "a" + Date.now().toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1296).toString(36);

/** Pictures are kept once in the dataset ("asset:<id>" in a block's src), not inside the report. A picture read in the
 *  browser is sent to R at once; a web address is downloaded by R, and `fromUrl`'s callback runs when it has it (or its
 *  `onFail` when it could not). */
export function usePictureStore(o: {
  onAsset: (id: string, src: string) => void;
  onAssetUrl: (id: string, url: string) => void;
  assetDone: { id: string; ratio: number } | null;
  assetFailed?: { id: string; message: string } | null;
}) {
  const pending = useRef<Record<string, { done: (src: string, ratio: number) => void; fail?: (message: string) => void }>>({});
  const assetOf = (src: string) => {
    const id = newAssetId();
    o.onAsset(id, src);
    return "asset:" + id;
  };
  const fromUrl = (url: string, done: (src: string, ratio: number) => void, fail?: (message: string) => void) => {
    const id = newAssetId();
    pending.current[id] = { done, fail };
    o.onAssetUrl(id, url);
  };
  useEffect(() => {
    const d = o.assetDone;
    const p = d && pending.current[d.id];
    if (!d || !p) return;
    delete pending.current[d.id];
    p.done("asset:" + d.id, d.ratio);
  }, [o.assetDone]);
  useEffect(() => {
    const f = o.assetFailed;
    const p = f && pending.current[f.id];
    if (!f || !p) return;
    delete pending.current[f.id];
    p.fail?.(f.message);
  }, [o.assetFailed]);
  return { assetOf, fromUrl };
}

/** A theme's look, as the design settings it sets (colours, fonts, sizes, palette). */
export const themeDesign = (th: RbTheme): Partial<RbDesign> => ({
  theme: th.theme, accent: th.accent, heading_color: th.heading_color, text_color: th.text_color, muted_color: th.muted_color,
  note_fill: th.note_fill, note_border: th.note_border, heading_font: th.heading_font, body_font: th.body_font,
  title_size: th.title_size, h1_size: th.h1_size, h2_size: th.h2_size, body_size: th.body_size, note_size: th.note_size,
  caption_size: th.caption_size, palette: th.palette, apply_palette: th.apply_palette,
  // a theme made from an Office file brings its file (the built-in themes clear it)
  template: th.template, template_kind: th.template_kind, template_ext: th.template_ext, background: th.background,
  slide_designs: th.slide_designs,
  // a Word template's page (size, orientation, margins): only when it has one, so a built-in theme keeps the page as set
  ...(th.size ? { size: th.size } : {}),
  ...(th.orientation ? { orientation: th.orientation } : {}),
  ...(th.margins ? { margins: th.margins } : {})
});

/** A theme's colours only. */
export const themeColours = (th: RbTheme): Partial<RbDesign> => ({
  accent: th.accent, heading_color: th.heading_color, text_color: th.text_color, muted_color: th.muted_color,
  note_fill: th.note_fill, note_border: th.note_border, palette: th.palette
});
