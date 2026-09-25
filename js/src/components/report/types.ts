import type { LocalText } from "../../lang";
import type { CustomizeEntries, CustomizeField } from "../ChartCustomizeFields";
import type { CustomizeTab } from "../ChartCustomize";

// The report builder's data. A report is a list of blocks plus a design (theme and page) and a cover; charts and tables
// are described by what to draw and are drawn by R (cd2030.core::render_report_block()), which sends back a preview for
// each. The same fields are documented in cd2030.core's R/report-builder.R and R/report-theme.R.

/** list: a bulleted or numbered list, nested (<ul>/<ol> in `text`); quote: a quotation (<p> in `text`); pre: preformatted
 *  text, kept as typed (plain `text`). */
export type BlockType = "heading" | "paragraph" | "list" | "note" | "quote" | "pre" | "pagebreak" | "chart" | "table" | "image" | "canvas";
export type Align = "left" | "center" | "right" | "justify";

export interface RbBlock {
  id: string;
  type: BlockType;
  /** A slide's text box: the size of its text (pt), its colour, and where the text sits in the box. */
  font_size?: number;
  color?: string;
  valign?: "top" | "middle" | "bottom";
  /** A text box's fill (over a picture, a band of colour: `fill_opacity` 0 to 1) and outline. */
  fill?: string;
  fill_opacity?: number;
  outline?: string;
  /** A slide's text box: bold, and its font (a family; none: the theme's). */
  bold?: boolean;
  font?: string;
  /** A picture's (or chart's) style, as PowerPoint's picture styles. */
  pic_style?: "shadow" | "frame" | "soft" | "reflection";
  /** A chart on a slide: the size it is drawn at (its box), inches. */
  box?: [number, number];
  /** A free-layout page ("canvas"): what is on it (inches from the top-left of the text area) and its height (inches;
   *  none: the page's text area). */
  items?: RbSlideItem[];
  h?: number;
  /** Heading: plain text. Paragraph and note: a small subset of HTML (b, i, u, coloured spans, br). */
  text?: string;
  level?: number;
  align?: Align;
  /** A list block: bulleted or numbered. (Older reports: a paragraph or note shown as a list, one item per line.) */
  list?: "bullet" | "number";
  /** Paragraph settings of this block (over the theme's): indents in cm, spacing in pt, line spacing (1 = single). */
  indent_left?: number;
  indent_right?: number;
  space_before?: number;
  space_after?: number;
  line?: number;
  // charts and tables
  kind?: string;
  indicator?: string;
  admin_level?: string;
  region?: string;
  year?: number;
  variant?: string;
  size?: "full" | "half" | "third";
  title?: string;
  /** Charts: FALSE hides the chart's own caption. Images: the caption text. */
  caption?: boolean | string;
  /** Chart options for this chart only (the chart customize panel's values). */
  options?: Record<string, unknown>;
  /** What the chart looks like (layout.ts blockSig()); R redraws a chart when it changes. */
  sig?: string;
  // images
  /** The picture: "asset:<id>", kept once in the dataset (cache$set_report_asset()); older reports: a data URL. */
  src?: string;
  /** Height / width of the picture. */
  ratio?: number;
  /** Percent of its column (5 to 100). */
  width?: number;
  shape?: "rect" | "rounded" | "circle";
  border?: boolean;
  /** The border's colour and width (pt). */
  border_color?: string;
  border_width?: number;
  alt?: string;
  /** The space kept around a picture (pt): above, below, and beside it when the text wraps around it. */
  space_top?: number;
  space_bottom?: number;
  space_side?: number;
  /** A full-width picture the text wraps around, at the left or right of the text. */
  wrap?: "inline" | "left" | "right";
  /** Turned by quarter turns, then flipped, then cropped: percent cut off the top, right, bottom and left. */
  rotate?: 0 | 90 | 180 | 270;
  flip_h?: boolean;
  flip_v?: boolean;
  crop?: [number, number, number, number];
  /** Stretched by a side handle: its height over the height its shape gives (1 = not stretched). */
  stretch?: number;
  /** Colour: brightness and contrast from -100 to 100 (0 = as it is), and greyscale. */
  brightness?: number;
  contrast?: number;
  greyscale?: boolean;
}

export interface RbDesign {
  theme: string;
  accent: string;
  heading_color: string;
  text_color: string;
  muted_color: string;
  note_fill: string;
  note_border: string;
  heading_font: string;
  body_font: string;
  title_size: number;
  h1_size: number;
  h2_size: number;
  body_size: number;
  note_size: number;
  caption_size: number;
  /** Body text: line spacing (1 = single) and the space after a paragraph (pt). */
  line_spacing: number;
  paragraph_after: number;
  palette: string[];
  apply_palette: boolean;
  size: "a4" | "letter" | "a3" | "chartbook" | "poster";
  /** A slide deck's slides: wide (16:9, 13.33 x 7.5 in) or standard (4:3, 10 x 7.5 in). */
  slide_size?: "16:9" | "4:3";
  /** A theme made from an Office file: the file ("asset:<id>", kept in the dataset), what it is, and a slide's
   *  background colour. The Word or PowerPoint file is written from it (its masters, styles, logos come with it). */
  template?: string;
  template_kind?: "pptx" | "docx";
  template_ext?: string;
  background?: string;
  /** A PowerPoint file's look, as its slides have it (cd2030.core R/report-slide-design.R): the title slide's and the
   *  other slides'. */
  slide_designs?: { title?: RbSlideDesign | null; content?: RbSlideDesign | null };
  orientation: "portrait" | "landscape";
  margins: "normal" | "narrow" | "wide";
  cover: boolean;
  contents: boolean;
  page_numbers: boolean;
  header: string;
  footer: string;
}

export interface RbEditor {
  name: string;
  role?: string;
}

export interface RbCover {
  layout: "band" | "full" | "photo" | "minimal";
  kicker: string;
  title: string;
  subtitle: string;
  show_flag: boolean;
  logos: { src: string; name?: string }[];
  photo?: string | null;
  editors: RbEditor[];
  date_mode: "month" | "today" | "custom";
  date: string;
  reference: string;
}

export interface RbProject {
  id: string;
  name: string;
  design: RbDesign;
  cover: RbCover;
  /** The region a one-region report is about; blocks with region "@report" use it. */
  region?: string;
  /** The report's language: its charts, tables and dates are drawn in it. None: the app's language (older reports). */
  lang?: "en" | "fr" | "pt";
  blocks: RbBlock[];
  /** A document (pages, written as Word) or a slide deck (slides, written as PowerPoint). */
  kind?: "document" | "deck";
  /** A slide deck's slides. */
  slides?: RbSlide[];
}

/** A slide's layout (PowerPoint's): where its placeholders are when it is made or reset. */
export type SlideLayout = "title" | "title_content" | "two_content" | "three_content" | "comparison" | "title_only" | "section" | "blank" | "picture_caption" | "content_caption" | "picture_left" | "full_picture";

/** One slide: its layout, what is on it (anywhere, in inches from its top-left corner) and the speaker's notes. */
export interface RbSlide {
  id: string;
  layout: SlideLayout;
  items: RbSlideItem[];
  notes?: string;
  /** Which of the theme's slide designs it is drawn on (default: "title" for the title and section layouts). */
  design?: "title" | "content";
}

/** The style of a slide design's title, subtitle or body text, and its box (inches). */
export interface RbDesignText {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string | null;
  fill_opacity?: number;
  color?: string;
  font_size?: number;
  bold?: boolean;
  align?: Align;
  font?: string | null;
}

/** A slide design: a background colour, what is drawn behind the items (logos, bands; `src`: the picture) and the
 *  style of its text. */
export interface RbSlideDesign {
  background?: string | null;
  decor?: { type: "image" | "rect"; src?: string; fill?: string; fill_opacity?: number; outline?: string | null; x: number; y: number; w: number; h: number; from?: string }[];
  title?: RbDesignText | null;
  subtitle?: RbDesignText | null;
  body?: RbDesignText | null;
}

/** A text box, chart, table or picture on a slide: its box, what it is for (a title, a body...) and what is in it. The
 *  first items are at the back. */
export interface RbSlideItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  role?: "title" | "subtitle" | "heading" | "body" | "picture";
  block: RbBlock;
}

export interface RbTheme extends Omit<RbDesign, "theme"> {
  theme: string;
  name: LocalText;
}

export interface RbOption {
  value: string;
  label: LocalText;
}

export interface RbKind {
  kind: string;
  type: "chart" | "table";
  group: string;
  groupLabel: LocalText;
  label: LocalText;
  indicators?: RbOption[];
  levels?: RbOption[];
  variants?: RbOption[];
  year?: boolean;
  /** Drawn for one region (the report's, or one chosen). */
  regional?: boolean;
  /** Drawn taller than wide (maps, charts faceted by district). */
  tall?: boolean;
  /** Default block fields when added from the palette. */
  defaults: Partial<RbBlock>;
}

export interface RbPreview {
  sig: string;
  src?: string;
  html?: string;
  error?: string;
  /** Display size in inches. */
  w: number;
  h: number;
  /** A chart's legend entries and axis categories, to recolour or rename. */
  entries?: CustomizeEntries;
  /** A chart drawn as panels: how (cd2030.core::chart_facet_info()). */
  facets?: RbFacets | null;
}

export interface RbFacets {
  type: "wrap" | "grid";
  ncol?: number | null;
  nrow?: number | null;
  scales?: "fixed" | "free" | "free_x" | "free_y";
  strip_position?: "top" | "bottom" | "left" | "right";
  panels?: number | null;
}

export interface RbSummary {
  id: string;
  name: string;
  kind?: "document" | "deck";
  updated: string;
  charts: number;
  blocks: number;
}

export interface RbPreset {
  id: string;
  name: LocalText;
  description: LocalText;
  kind?: "document" | "deck";
  charts: number;
}

export interface RbField {
  key: string;
  group: string;
  label: LocalText;
}

export interface RbChartSchema {
  tabs: CustomizeTab[];
  fields: CustomizeField[];
  texts: Record<string, LocalText>;
}

export interface RbExportState {
  status: "running" | "done" | "error";
  format: "docx" | "pdf" | "pptx";
  pct?: number;
  stage?: LocalText;
  message?: string;
  url?: string;
  fileName?: string;
  /** What made the file: "word", "libreoffice", "browser" (PDF), or nothing. */
  madeBy?: string | null;
}

export interface RbFinalState {
  status: "running" | "done" | "error";
  pct?: number;
  pages?: string[];
  converter?: string;
  message?: string;
  noConverter?: boolean;
}

export type Texts = Record<string, LocalText>;

export const DEFAULT_DESIGN: RbDesign = {
  theme: "countdown",
  accent: "#7d3f40",
  heading_color: "#7d3f40",
  text_color: "#2b3138",
  muted_color: "#5c6670",
  note_fill: "#f7f1e3",
  note_border: "#e6d7b0",
  heading_font: "Georgia",
  body_font: "Calibri",
  title_size: 30,
  h1_size: 18,
  h2_size: 13,
  body_size: 10.5,
  note_size: 9.5,
  caption_size: 8.5,
  line_spacing: 1.15,
  paragraph_after: 6,
  palette: ["#1c4f9c", "#7d3f40", "#1b6b45", "#a8480f", "#6b4c9a", "#5c6670"],
  apply_palette: true,
  size: "a4",
  orientation: "portrait",
  margins: "normal",
  cover: true,
  contents: true,
  page_numbers: true,
  header: "{report_title}",
  footer: "Countdown to 2030 · {country}"
};

export const DEFAULT_COVER: RbCover = {
  layout: "band",
  kicker: "Countdown to 2030 · {country}",
  title: "",
  subtitle: "",
  show_flag: true,
  logos: [],
  photo: null,
  editors: [],
  date_mode: "month",
  date: "",
  reference: ""
};

/** A saved design with every field filled in (designs saved before themes had `font` = "serif" / "sans"). */
export function fullDesign(d: Partial<RbDesign> & { font?: string } | undefined): RbDesign {
  const out = { ...DEFAULT_DESIGN, ...(d || {}) } as RbDesign & { font?: string };
  if (d && !d.heading_font && d.font === "sans") out.heading_font = "Calibri";
  if (d && !d.heading_color && d.accent) out.heading_color = d.accent;
  delete out.font;
  if (!Array.isArray(out.palette)) out.palette = DEFAULT_DESIGN.palette;
  return out;
}

export function fullCover(c: Partial<RbCover> | undefined): RbCover {
  const out = { ...DEFAULT_COVER, ...(c || {}) };
  if (!Array.isArray(out.logos)) out.logos = [];
  if (!Array.isArray(out.editors)) out.editors = [];
  return out;
}
