import type { RbBlock, RbDesign, RbPreview } from "./types";

// How blocks flow onto pages on screen. The exported file is laid out by Word, so this is the same flow with estimated
// heights: close, not exact ("Final pages" shows the real ones). Page and block sizes follow the same rules as
// cd2030.core::report_page() and report_block_size(). Sizes are CSS px at 96 per inch.

export const PX = 96;
export const PT = 96 / 72;

/** The page in inches, as cd2030.core::report_page() works it out. */
/** Paper sizes, portrait, in inches (cd2030.core's .rb_page_sizes). */
export const PAGE_SIZES: Record<string, [number, number]> = { a4: [8.27, 11.69], letter: [8.5, 11], a3: [11.69, 16.54], chartbook: [13.93, 22], poster: [17, 22] };

export function pageInches(design: RbDesign) {
  let [w, h] = PAGE_SIZES[design.size] || PAGE_SIZES.a4;
  if (design.orientation === "landscape") [w, h] = [h, w];
  const m = design.margins === "narrow" ? { top: 0.6, bottom: 0.6, side: 0.5 } : design.margins === "wide" ? { top: 1, bottom: 1, side: 1 } : { top: 0.8, bottom: 0.75, side: 0.75 };
  return { width: w, height: h, top: m.top, bottom: m.bottom, side: m.side, textWidth: w - 2 * m.side, textHeight: h - m.top - m.bottom - 0.6 };
}

/** Page size and printable area in px. */
export function pageBox(design: RbDesign) {
  const p = pageInches(design);
  // the text area is the page less its margins: Word puts the header and footer inside the margins (textHeight, a little
  // less, is what charts and pictures are sized against, as cd2030.core::report_page()$text_height)
  return { w: p.width * PX, h: p.height * PX, padX: p.side * PX, padTop: p.top * PX, padBottom: p.bottom * PX, contentH: (p.height - p.top - p.bottom) * PX };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

// The kinds drawn taller than wide (maps, charts faceted by district): R says which (report_block_kinds()$tall)
let TALL = new Set<string>(["map", "reporting_rate", "threshold", "mortality_region", "health_system_region"]);
export function setTallKinds(kinds: string[]) {
  TALL = new Set(kinds);
}

/** How much of each side of a picture is cut off, as fractions (top, right, bottom, left), as cd2030.core's
 *  .rb_image_crop(): a tenth of the picture is always left. */
export function imageCrop(b: RbBlock): [number, number, number, number] {
  const c = b.crop;
  if (!c || c.length !== 4 || c.some((x) => typeof x !== "number" || isNaN(x))) return [0, 0, 0, 0];
  const f = c.map((x) => Math.min(90, Math.max(0, x)) / 100) as [number, number, number, number];
  if (f[0] + f[2] > 0.9) {
    const k = 0.9 / (f[0] + f[2]);
    f[0] *= k;
    f[2] *= k;
  }
  if (f[1] + f[3] > 0.9) {
    const k = 0.9 / (f[1] + f[3]);
    f[1] *= k;
    f[3] *= k;
  }
  return f;
}

/** How much a picture is stretched (its height over the height its shape gives), as cd2030.core's .rb_image_stretch(). */
export const imageStretch = (b: RbBlock): number => (typeof b.stretch === "number" && isFinite(b.stretch) && b.stretch > 0 ? Math.min(10, Math.max(0.1, b.stretch)) : 1);

/** A picture's height over its width once turned, cropped and stretched (cd2030.core's .rb_image_ratio()). */
export function imageRatio(b: RbBlock): number {
  if (b.shape === "circle") return imageStretch(b);
  let ratio = b.ratio && b.ratio > 0 ? b.ratio : 0.6;
  if ((b.rotate || 0) % 180 === 90) ratio = 1 / ratio;
  const c = imageCrop(b);
  return ((ratio * (1 - c[0] - c[2])) / (1 - c[1] - c[3])) * imageStretch(b);
}

/** How a picture or chart sits in the text: "left" or "right" when the text wraps around it (full-width ones only). */
export const wrapOf = (b: RbBlock): "inline" | "left" | "right" =>
  (b.type === "image" || b.type === "chart") && (b.size || "full") === "full" && (b.wrap === "left" || b.wrap === "right") ? b.wrap : "inline";

/** A chart as the picture it is shown as: its drawing (made at blockInches()) given a picture's width, crop, turn,
 *  shape and colours (cd2030.core's .rb_shown_size()). Anything else is returned as it is. */
export function asPicture(b: RbBlock, design: RbDesign): RbBlock {
  if (b.type !== "chart") return b;
  const [w, h] = blockInches(b, design);
  return { ...b, type: "image", ratio: h / w };
}

/** The size a chart or picture is shown at on the page, inches. */
export const shownInches = (b: RbBlock, design: RbDesign): [number, number] => blockInches(asPicture(b, design), design);

/** The width of the column a chart or picture is in (inches): the text width, or its half or third. */
export function columnInches(b: RbBlock, design: RbDesign): number {
  const full = pageInches(design).textWidth - 0.27;
  return b.size === "half" ? (full - 0.2) / 2 : b.size === "third" ? (full - 0.4) / 3 : full;
}

/** A chart's or image's size in inches, as cd2030.core::report_block_size() works it out. */
export function blockInches(b: RbBlock, design: RbDesign): [number, number] {
  const page = pageInches(design);
  const full = page.textWidth - 0.27;
  const size = b.size || "full";
  let w = size === "half" ? (full - 0.2) / 2 : size === "third" ? (full - 0.4) / 3 : full;
  if (b.type === "image") {
    w = (w * Math.min(100, Math.max(5, b.width || 100))) / 100;
    let h = w * imageRatio(b);
    const cap = page.textHeight * 0.8;
    if (h > cap) {
      w = (w * cap) / h;
      h = cap;
    }
    return [round3(w), round3(h)];
  }
  const tall = TALL.has(b.kind || "");
  const ratio = size === "half" ? (tall ? 1.143 : 0.825) : size === "third" ? (tall ? 1 : 0.7) : tall ? 0.8 : 0.569;
  // wide pages (chartbook, poster) would make very tall charts: the height stops at what an A4 page gives
  const h = Math.min(w * ratio, tall ? 5.2 : 3.7, page.textHeight * 0.8);
  return [round3(w), round3(h)];
}

/** What a chart or table looks like: its settings, the parts of the design that change how it is drawn, and the
 *  language its labels are in. R draws a chart again when this changes, and a preview drawn for an older one is shown
 *  as "updating". */
export function blockSig(b: RbBlock, design: RbDesign, region?: string, lang?: string): string {
  return JSON.stringify([
    lang || "",
    b.kind, b.indicator, b.admin_level, b.region === "@report" ? "@" + (region || "") : b.region, b.year, b.variant, b.size, b.title, b.caption === false ? 0 : 1, b.options || null,
    design.body_font, design.text_color, design.apply_palette ? design.palette : null, design.size, design.orientation, design.margins,
    // a chart on a slide is drawn at its box's size
    ...(b.box ? [b.box.map((v) => Math.round(v * 100) / 100)] : [])
  ]);
}

/** The blocks with their sig set; the same array when nothing changed. */
export function signBlocks(blocks: RbBlock[], design: RbDesign, region?: string, lang?: string): RbBlock[] {
  let changed = false;
  const out = blocks.map((b) => {
    if (!isData(b)) return b;
    const sig = blockSig(b, design, region, lang);
    if (b.sig === sig) return b;
    changed = true;
    return { ...b, sig };
  });
  return changed ? out : blocks;
}

export const isData = (b: RbBlock) => b.type === "chart" || b.type === "table";
export const isText = (b: RbBlock) => b.type === "heading" || b.type === "paragraph" || b.type === "note";
/** Half- and third-width charts and pictures share rows: two halves, or three thirds. */
export const isHalf = (b: RbBlock) => (b.type === "chart" || b.type === "image") && (b.size === "half" || b.size === "third");
export const perRow = (b: RbBlock) => (b.size === "third" ? 3 : 2);

/** The rows of blocks, as cd2030.core's .rb_rows() makes them: indices of blocks that share a row. */
export function rowsOf(blocks: RbBlock[], indices: number[]): number[][] {
  const rows: number[][] = [];
  let k = 0;
  while (k < indices.length) {
    const b = blocks[indices[k]];
    const row = [indices[k]];
    if (isHalf(b)) {
      while (row.length < perRow(b) && k + row.length < indices.length) {
        const next = blocks[indices[k + row.length]];
        if (!isHalf(next) || next.size !== b.size) break;
        row.push(indices[k + row.length]);
      }
    }
    rows.push(row);
    k += row.length;
  }
  return rows;
}

/** Rough plain length of formatted text. */
const plainLength = (html: string | undefined) => (html || "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").length;
const lineCount = (html: string | undefined) => (html || "").split(/<br\s*\/?>|<\/div>/).length;

export function blockHeight(b: RbBlock, design: RbDesign, preview?: RbPreview): number {
  const textW = pageInches(design).textWidth * PX;
  const lines = (text: string | undefined, sizePt: number, extraLines = 0) => {
    const perLine = Math.max(20, textW / (sizePt * PT * 0.5));
    return Math.max(1, Math.ceil(plainLength(text) / perLine)) + extraLines;
  };
  switch (b.type) {
    case "heading":
      return (b.level === 1 ? design.h1_size : design.h2_size) * PT * 1.3 + (b.level === 1 ? 26 : 18);
    case "paragraph":
      return lines(b.text, design.body_size, b.list ? lineCount(b.text) - 1 : 0) * design.body_size * PT * 1.45 + 8;
    case "note":
      return lines(b.text, design.note_size, b.list ? lineCount(b.text) - 1 : 0) * design.note_size * PT * 1.4 + 26;
    case "pagebreak":
      return 18;
    case "table":
      return preview ? preview.h * PX : 220;
    case "image": {
      const h = blockInches(b, design)[1] * PX;
      return h + (b.caption ? design.caption_size * PT * 1.6 : 0) + 10;
    }
    case "chart": {
      const h = shownInches(b, design)[1] * (preview && !preview.error ? preview.h / blockInches(b, design)[1] : 1);
      return h * PX + 12;
    }
  }
  return 24;
}

export interface PageLayout {
  /** Page numbers are counted from the first page, including the cover and contents. */
  pages: { n: number; indices: number[] }[];
  pageOf: Record<string, number>;
  total: number;
  firstContentPage: number;
}

export function paginate(blocks: RbBlock[], design: RbDesign, previews: Record<string, RbPreview>): PageLayout {
  const budget = pageBox(design).contentH;
  const textW = pageInches(design).textWidth * PX;
  const raw: number[][] = [];
  let cur: number[] = [];
  let used = 0;
  // a picture the text wraps around: the height of it still beside the text, and how much longer text is there (it is
  // narrower)
  let beside = 0;
  let stretch = 1;
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === "pagebreak") {
      cur.push(i);
      raw.push(cur);
      cur = [];
      used = 0;
      beside = 0;
      i += 1;
      continue;
    }
    const row = [i];
    let h = blockHeight(b, design, previews[b.id]);
    if (beside > 0 && isText(b)) {
      // the part of it beside the picture is inside the picture's height, already counted
      const along = Math.min(beside, h * stretch);
      h -= along / stretch;
      beside -= along;
    } else if (beside > 0) {
      // anything else starts under the picture
      used += beside;
      beside = 0;
    }
    while (isHalf(b) && row.length < perRow(b) && i + row.length < blocks.length && isHalf(blocks[i + row.length]) && blocks[i + row.length].size === b.size) {
      const next = blocks[i + row.length];
      row.push(i + row.length);
      h = Math.max(h, blockHeight(next, design, previews[next.id]));
    }
    // a heading goes with what follows it
    const next = blocks[i + row.length];
    const keep = b.type === "heading" && next ? Math.min(blockHeight(next, design, previews[next.id]), 200) : 0;
    if (used + h + keep > budget && cur.length) {
      raw.push(cur);
      cur = [];
      used = 0;
      beside = 0;
    }
    row.forEach((k) => cur.push(k));
    used += h + 8;
    if (wrapOf(b) !== "inline") {
      const w = shownInches(b, design)[0] * PX + 12;
      beside = h;
      stretch = textW / Math.max(60, textW - w);
    }
    i += row.length;
  }
  raw.push(cur);
  const first = 1 + (design.cover ? 1 : 0) + (design.contents ? 1 : 0);
  const pageOf: Record<string, number> = {};
  raw.forEach((idx, p) => idx.forEach((k) => (pageOf[blocks[k].id] = first + p)));
  return { pages: raw.map((indices, p) => ({ n: first + p, indices })), pageOf, total: first + raw.length - 1, firstContentPage: first };
}

let counter = 0;
export function newId(): string {
  counter += 1;
  return "b" + Date.now().toString(36) + counter.toString(36);
}

/** Put field values into text ({country} -> Benin). `html`: the text is HTML, so values are escaped. */
export function fillFields(text: string | undefined, fields: Record<string, string>, html = false): string {
  return (text || "").replace(/\{([a-z0-9_]+)\}/g, (m, key) => {
    const v = fields[key];
    if (v === undefined) return m;
    return html ? escapeHtml(v) : v;
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text of formatted text. */
export function plainText(html: string | undefined): string {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n+$/, "");
}

/** A font as CSS, with fallbacks. */
/** The serif faces among the report fonts (cd2030.core::report_fonts("serif")); the others are sans serif. */
export const SERIF_FONTS = ["Cambria", "Georgia", "Garamond", "Palatino Linotype", "Book Antiqua", "Constantia", "Times New Roman"];
export const isSerif = (f: string) => SERIF_FONTS.includes(f) || /Times|Garamond|Palatino|Georgia|Cambria|Serif/i.test(f);
export const cssFont = (f: string) => `'${f}', ${isSerif(f) ? "Georgia, serif" : "Arial, sans-serif"}`;

/** Heading sizes (pt) as cd2030.core's .rb_heading_size(): H1 and H2 from the theme, H3 between H2 and body text, H4 to
 *  H6 at body size (H5 italic, H6 in the muted colour). */
export function headingSize(level: number, design: RbDesign): number {
  if (level <= 1) return design.h1_size;
  if (level === 2) return design.h2_size;
  if (level === 3) return Math.round((design.h2_size + design.body_size)) / 2;
  return design.body_size;
}
