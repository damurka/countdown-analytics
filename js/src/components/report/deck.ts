import { blockSig } from "./layout";
import type { RbBlock, RbDesign, RbDesignText, RbProject, RbSlide, RbSlideDesign, RbSlideItem, SlideLayout } from "./types";

// Slide decks (PowerPoint's model): slides of a fixed size, each made from a layout whose placeholders are text boxes
// and content boxes, and whose items can then be moved and resized anywhere. cd2030.core::export_deck() writes the
// PowerPoint file from the same slides (every item at its box) and report_deck_layouts() has the same layouts.

/** The slide's size in inches: wide (16:9) or standard (4:3). */
export const slideSize = (design: RbDesign): [number, number] => (design.slide_size === "4:3" ? [10, 7.5] : [13.333, 7.5]);

export interface LayoutPlaceholder {
  x: number;
  y: number;
  w: number;
  h: number;
  role: "title" | "subtitle" | "heading" | "body" | "picture";
}

/** The layouts' placeholders, as fractions of the slide (cd2030.core::report_deck_layouts()). */
export const LAYOUTS: Record<SlideLayout, LayoutPlaceholder[]> = {
  title: [
    { x: 0.125, y: 0.1637, w: 0.75, h: 0.3481, role: "title" },
    { x: 0.125, y: 0.5252, w: 0.75, h: 0.2414, role: "subtitle" }
  ],
  title_content: [
    { x: 0.0688, y: 0.0532, w: 0.8625, h: 0.1933, role: "title" },
    { x: 0.0688, y: 0.2662, w: 0.8625, h: 0.6345, role: "body" }
  ],
  two_content: [
    { x: 0.0688, y: 0.0532, w: 0.8625, h: 0.1933, role: "title" },
    { x: 0.0688, y: 0.2662, w: 0.425, h: 0.6345, role: "body" },
    { x: 0.5063, y: 0.2662, w: 0.425, h: 0.6345, role: "body" }
  ],
  three_content: [
    { x: 0.0688, y: 0.0532, w: 0.8625, h: 0.1933, role: "title" },
    { x: 0.0688, y: 0.2662, w: 0.2775, h: 0.6345, role: "body" },
    { x: 0.3613, y: 0.2662, w: 0.2775, h: 0.6345, role: "body" },
    { x: 0.6538, y: 0.2662, w: 0.2775, h: 0.6345, role: "body" }
  ],
  comparison: [
    { x: 0.0688, y: 0.0532, w: 0.8625, h: 0.1933, role: "title" },
    { x: 0.0688, y: 0.2451, w: 0.4231, h: 0.1204, role: "heading" },
    { x: 0.0688, y: 0.3655, w: 0.4231, h: 0.5383, role: "body" },
    { x: 0.5063, y: 0.2451, w: 0.425, h: 0.1204, role: "heading" },
    { x: 0.5063, y: 0.3655, w: 0.425, h: 0.5383, role: "body" }
  ],
  title_only: [{ x: 0.0688, y: 0.0532, w: 0.8625, h: 0.1933, role: "title" }],
  picture_caption: [
    { x: 0.0688, y: 0.1333, w: 0.3563, h: 0.2, role: "title" },
    { x: 0.4688, y: 0.1111, w: 0.4625, h: 0.7778, role: "picture" },
    { x: 0.0688, y: 0.3533, w: 0.3563, h: 0.5356, role: "body" }
  ],
  content_caption: [
    { x: 0.0688, y: 0.1333, w: 0.3563, h: 0.2, role: "title" },
    { x: 0.4688, y: 0.1111, w: 0.4625, h: 0.7778, role: "body" },
    { x: 0.0688, y: 0.3533, w: 0.3563, h: 0.5356, role: "body" }
  ],
  picture_left: [
    { x: 0, y: 0, w: 0.5, h: 1, role: "picture" },
    { x: 0.54, y: 0.08, w: 0.42, h: 0.18, role: "title" },
    { x: 0.54, y: 0.3, w: 0.42, h: 0.6, role: "body" }
  ],
  full_picture: [
    { x: 0, y: 0, w: 1, h: 1, role: "picture" },
    { x: 0.05, y: 0.72, w: 0.9, h: 0.18, role: "title" }
  ],
  section: [
    { x: 0.0688, y: 0.2493, w: 0.8625, h: 0.416, role: "title" },
    { x: 0.0688, y: 0.6692, w: 0.8625, h: 0.2187, role: "subtitle" }
  ],
  blank: []
};

export const LAYOUT_IDS = Object.keys(LAYOUTS) as SlideLayout[];

/** The layouts as cd2030.core::report_deck_layouts() has them (sent by R), over the ones above. */
export function setLayouts(list: { id: string; items: { role?: string; x: number; y: number; w: number; h: number }[] }[] | undefined) {
  (list || []).forEach((l) => {
    if (!(l.id in LAYOUTS) || !Array.isArray(l.items)) return;
    LAYOUTS[l.id as SlideLayout] = l.items.map((it) => ({
      x: Number(it.x), y: Number(it.y), w: Number(it.w), h: Number(it.h),
      role: (["title", "subtitle", "heading", "picture"].includes(it.role || "") ? it.role : "body") as LayoutPlaceholder["role"]
    }));
  });
}

/** The size of a text box's text (pt) when it has none of its own. */
export const roleSize = (role?: string) => (role === "title" ? 32 : role === "subtitle" || role === "heading" ? 20 : 18);

let seq = 0;
export const newId = (prefix: string) => prefix + Date.now().toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1296).toString(36);

/** The theme's slide design a slide is drawn on (a PowerPoint file's logos, bands and text styles), or null. */
export function slideDesignOf(slide: { layout?: string; design?: string }, design: RbDesign): RbSlideDesign | null {
  const designs = design.slide_designs;
  if (!designs) return null;
  const which = slide.design === "title" || slide.design === "content" ? slide.design : slide.layout === "title" || slide.layout === "section" ? "title" : "content";
  return designs[which] || null;
}

const DESIGNED: (keyof RbDesignText & keyof RbBlock)[] = ["fill", "fill_opacity", "color", "font_size", "align", "bold", "font"];

/** A text item's block with the slide design's style for its role where it sets none (as the export writes it:
 *  .rb_designed_item() in cd2030.core). */
export function designedBlock(it: RbSlideItem, sd: RbSlideDesign | null): RbBlock {
  const st = sd && (it.role === "title" || it.role === "subtitle" || it.role === "body") ? sd[it.role] : null;
  if (!st || !isTextItem(it)) return it.block;
  const b: RbBlock = { ...it.block };
  const unset = (v: unknown) => v === undefined || v === null || v === "";
  DESIGNED.forEach((f) => {
    if (unset(b[f]) && !unset(st[f])) (b as unknown as Record<string, unknown>)[f] = st[f];
  });
  return b;
}

/** The items of a new slide of this layout: its placeholders, empty (a title slide's are centred). A theme with slide
 *  designs places the title (and a title slide's subtitle, a title and content slide's body) where its file has them. */
export function layoutItems(layout: SlideLayout, design: RbDesign): RbSlideItem[] {
  const [W, H] = slideSize(design);
  const sd = slideDesignOf({ layout }, design);
  return LAYOUTS[layout].map((p) => {
    const id = newId("i");
    const block: RbBlock = { id, type: "paragraph", text: "" };
    const at =
      sd && (layout === "title" && (p.role === "title" || p.role === "subtitle") ? sd[p.role] : p.role === "title" && p.y < 0.2 ? sd.title : layout === "title_content" && p.role === "body" ? sd.body : null);
    if (at && at.w > 0 && at.h > 0) return { id, x: round(at.x), y: round(at.y), w: round(at.w), h: round(at.h), role: p.role, block: layout === "title" && !at.align ? { ...block, align: "center" } : block };
    if (layout === "title") block.align = "center";
    // the title over a full picture: white on a dark band, as PowerPoint's picture layouts
    if (layout === "full_picture" && p.role === "title") Object.assign(block, { fill: "#000000", fill_opacity: 0.45, color: "#ffffff" });
    if (p.role === "title" && (layout === "picture_caption" || layout === "content_caption")) block.font_size = 24;
    if (p.role === "body" && (layout === "picture_caption" || layout === "content_caption") && p.y > 0.3) block.font_size = 14;
    return { id, x: round(p.x * W), y: round(p.y * H), w: round(p.w * W), h: round(p.h * H), role: p.role, block };
  });
}

export const newSlide = (layout: SlideLayout, design: RbDesign): RbSlide => ({ id: newId("s"), layout, items: layoutItems(layout, design) });

/** Another layout for a slide: what is in its placeholders moves to the new layout's (titles to the title, the rest in
 *  order); what has no place keeps its box. */
export function relayoutSlide(slide: RbSlide, layout: SlideLayout, design: RbDesign): RbSlide {
  const fresh = layoutItems(layout, design);
  const used = new Set<string>();
  const items: RbSlideItem[] = fresh.map((ph) => {
    const match = slide.items.find((it) => !used.has(it.id) && it.role && (it.role === ph.role || (ph.role === "body" && it.role === "body")));
    if (!match) return ph;
    used.add(match.id);
    return { ...match, x: ph.x, y: ph.y, w: ph.w, h: ph.h, role: ph.role };
  });
  // empty placeholders of the old layout go; anything else stays where it is
  slide.items.forEach((it) => {
    if (used.has(it.id)) return;
    if (it.role && isEmptyText(it.block)) return;
    items.push(it);
  });
  return { ...slide, layout, items };
}

/** Put the slide's placeholders back where its layout has them (Reset). */
export const resetSlide = (slide: RbSlide, design: RbDesign) => relayoutSlide(slide, slide.layout, design);

export const isEmptyText = (b: RbBlock) => (b.type === "paragraph" || b.type === "heading" || b.type === "list") && !plain(b.text).trim();
export const isTextItem = (it: RbSlideItem) => it.block.type === "paragraph" || it.block.type === "heading" || it.block.type === "list";
const plain = (html?: string) => (html || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");

export const round = (v: number) => Math.round(v * 1000) / 1000;

/** The crop (percent cut off the top, right, bottom and left) that makes a picture of this shape (height / width) fill a
 *  box, cut equally from both sides, as PowerPoint fills a picture placeholder; none when it fits already. */
export function fillCrop(ratio: number, w: number, h: number): [number, number, number, number] | undefined {
  const box = h / w;
  if (!ratio || Math.abs(ratio - box) / box < 0.01) return undefined;
  const pct = (x: number) => Math.round(x * 1000) / 10;
  if (ratio > box) {
    const c = pct((1 - box / ratio) / 2);
    return [c, 0, c, 0];
  }
  const c = pct((1 - ratio / box) / 2);
  return [0, c, 0, c];
}

/** A copy of a slide with new ids. */
export function copySlide(slide: RbSlide): RbSlide {
  return {
    ...slide,
    id: newId("s"),
    items: slide.items.map((it) => {
      const id = newId("i");
      return { ...it, id, block: { ...it.block, id } };
    })
  };
}

/** Boxes with their charts and tables signed (the size they are drawn at is their box); the same array when unchanged. */
export function signItems(items: RbSlideItem[], design: RbDesign, region?: string, lang?: string): RbSlideItem[] {
  let changed = false;
  const out = items.map((it) => {
    if (it.block.type !== "chart" && it.block.type !== "table") return it;
    const box: [number, number] = [round(it.w), round(it.h)];
    const b = { ...it.block, id: it.id, box };
    const sig = blockSig(b, design, region, lang);
    if (it.block.sig === sig && it.block.box && it.block.box[0] === box[0] && it.block.box[1] === box[1]) return it;
    changed = true;
    return { ...it, block: { ...b, sig } };
  });
  return changed ? out : items;
}

/** The deck with its charts and tables signed (the size they are drawn at is their box), so R draws what changed. */
export function signDeck(p: RbProject, appLang: string): RbProject {
  const slides = (p.slides || []).map((s) => {
    const items = signItems(s.items, p.design, p.region, p.lang || appLang);
    return items === s.items ? s : { ...s, items };
  });
  return { ...p, slides };
}

/** Every chart, table and picture of the deck, as blocks (their id is the item's). */
export const deckBlocks = (p: RbProject): RbBlock[] => (p.slides || []).flatMap((s) => s.items.map((it) => ({ ...it.block, id: it.id })));
