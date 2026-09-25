import React, { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { tr } from "../../../lang";
import { designedBlock, isEmptyText, isTextItem, newId, roleSize, round, slideDesignOf, slideSize } from "../deck";
import { Field, joinAnd } from "../flow/extensions";
import { cssFont, fillFields, PT, PX } from "../layout";
import { ImagePicker } from "../panels";
import { Picture } from "../Picture";
import { popActiveEditor, pushActiveEditor } from "../RichText";
import type { RbBlock, RbDesign, RbKind, RbPreview, RbSlideItem } from "../types";
import { Icon, ICONS } from "../ui";

// A canvas of boxes (PowerPoint's slide; a free-layout page in a document): text boxes, charts, tables and pictures, each
// at its box (inches from the canvas's top-left), drawn as the file will have them. BoxCanvas draws it (for editing,
// thumbnails, the slide show); useBoxEditing selects, moves, resizes and types in its boxes. Any builder or page can be
// made from them: give it the items, their previews and pictures, and what to do when a box changes.

export type Box = { x: number; y: number; w: number; h: number };

export const boxTextExtensions = () => [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, horizontalRule: false, code: false, codeBlock: false, blockquote: false, link: { openOnClick: false, autolink: true } }),
  TextStyleKit.configure({ lineHeight: false }),
  TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
  Subscript,
  Superscript,
  Field
];

/** The fields of a canvas (a slide, a free page): the report's, {chart_indicator} / {chart_year} of the first chart or
 *  table on it and {chart_indicators} of all of them (`and`: the word that lists them). */
export function canvasFields(items: RbSlideItem[], fields: Record<string, string>, kinds: RbKind[], years: number[], lang: string, and = "and"): Record<string, string> {
  const charts = items.filter((it) => it.block.type === "chart" || it.block.type === "table").map((it) => it.block);
  const chart = charts[0];
  if (!chart) return fields;
  const nameOf = (b: RbBlock) => {
    const opt = kinds.find((k) => k.kind === b.kind)?.indicators?.find((x) => x.value === b.indicator);
    return b.indicator ? (opt ? tr(opt.label, lang) : b.indicator) : "";
  };
  const names = charts.map(nameOf).filter((n, i, all) => n && all.indexOf(n) === i);
  return {
    ...fields,
    ...(chart.indicator ? { chart_indicator: nameOf(chart) } : {}),
    ...(names.length ? { chart_indicators: joinAnd(names, and) } : {}),
    chart_year: chart.year ? String(chart.year) : years.length ? String(years[years.length - 1]) : ""
  };
}

/** How a text box looks: the theme's fonts and colours by what it is for, its own size, colour, alignment. */
export function textStyle(it: RbSlideItem, design: RbDesign): React.CSSProperties {
  const title = it.role === "title" || it.role === "heading";
  const size = it.block.font_size || roleSize(it.role);
  return {
    fontFamily: cssFont(it.block.font || (title ? design.heading_font : design.body_font)),
    fontSize: size * PT,
    fontWeight: it.block.bold === true || (it.block.bold === undefined && it.role === "heading") ? 700 : it.block.bold === false ? 400 : undefined,
    color: it.block.color || (it.role === "title" ? design.heading_color : it.role === "subtitle" ? design.muted_color : design.text_color),
    background: it.block.fill ? hexAlpha(it.block.fill, it.block.fill_opacity ?? 1) : undefined,
    boxShadow: it.block.outline ? `inset 0 0 0 1px ${it.block.outline}` : undefined,
    textAlign: it.block.align || "left",
    justifyContent: (it.block.valign || (it.role === "title" || it.role === "subtitle" ? "middle" : "top")) === "middle" ? "center" : it.block.valign === "bottom" ? "flex-end" : "flex-start",
    lineHeight: 1.15
  };
}

/** A colour with its opacity, for CSS. */
export function hexAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** A table drawn by R, shrunk to fit its box. */
export function TableFit({ html, w, h, stale }: { html: string; w: number; h: number; stale: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.zoom = "1";
    const nw = el.scrollWidth || 1;
    const nh = el.scrollHeight || 1;
    setK(Math.min(1.6, (w * PX) / nw, (h * PX) / nh));
  }, [html, w, h]);
  return <div ref={ref} className={stale ? "cd-rb-slidetable cd-rb-stale" : "cd-rb-slidetable"} style={{ zoom: k }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A text box being typed in: the ribbon's text commands act on it. */
export function BoxTextEditor({ html, at, onChange, onEditor }: { html: string; at: { x: number; y: number } | null; onChange: (html: string) => void; onEditor: (ed: Editor | null) => void }) {
  const made = useRef<Editor | null>(null);
  const editor = useEditor({
    extensions: boxTextExtensions(),
    content: html || "",
    editorProps: { attributes: { class: "cd-rb-slidetext__edit", role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor: ed }) => onChange(ed.isEmpty ? "" : ed.getHTML()),
    onCreate: ({ editor: ed }) => {
      made.current = ed;
      pushActiveEditor(ed);
      onEditor(ed);
      // the caret where the box was clicked (else at the end)
      const pos = at ? ed.view.posAtCoords({ left: at.x, top: at.y }) : null;
      if (pos) ed.chain().focus().setTextSelection(pos.pos).run();
      else ed.commands.focus("end");
    },
    onDestroy: () => {
      if (made.current) popActiveEditor(made.current);
      onEditor(null);
    }
  });
  return <EditorContent editor={editor} />;
}

export interface BoxCanvasProps {
  /** What is on the canvas (a slide's items, a free page's). */
  slide: { items: RbSlideItem[]; layout?: string; design?: string };
  /** Its size in inches (default: the deck's slide). */
  size?: [number, number];
  /** "slide" (white, with a shadow) or "page" (inside a page of a document). */
  look?: "slide" | "page";
  design: RbDesign;
  fields: Record<string, string>;
  previews: Record<string, RbPreview>;
  assets: Record<string, string>;
  t: (k: string) => string;
  /** Editing (the slide in the middle); thumbnails and the slide show are not. */
  interactive?: boolean;
  selected?: string | null;
  editing?: string | null;
  editAt?: { x: number; y: number } | null;
  live?: Record<string, Box>;
  cropFor?: string | null;
  zoom?: number;
  onItemDown?: (e: React.PointerEvent, it: RbSlideItem) => void;
  onHandleDown?: (e: React.PointerEvent, it: RbSlideItem, dx: number, dy: number) => void;
  onText?: (it: RbSlideItem, html: string) => void;
  onEditor?: (ed: Editor | null) => void;
  onFill?: (it: RbSlideItem, what: "chart" | "table" | "picture", img?: { src: string; ratio: number }) => void;
  onCrop?: (it: RbSlideItem, crop: RbBlock["crop"] | undefined) => void;
  onCropDone?: () => void;
  guides?: { x: number[]; y: number[] };
}

/** One slide: its boxes, drawn as the PowerPoint file will have them. */
export function BoxCanvas(p: BoxCanvasProps) {
  const { slide, design, previews, assets, t } = p;
  const [W, H] = p.size || slideSize(design);
  // a PowerPoint file's look: the slide's background, its logos and bands behind the items, its text styles
  const sd = p.look === "page" ? null : slideDesignOf(slide, design);
  const background = sd?.background || design.background;
  return (
    <div className={p.look === "page" ? "cd-rb-slide cd-rb-slide--page" : "cd-rb-slide"} style={{
      ...(p.look !== "page" && background ? { background } : {}), width: W * PX, height: H * PX, fontFamily: cssFont(design.body_font), color: design.text_color }}>
      {(sd?.decor || []).map((d, k) =>
        d.type === "image" ? (
          d.src && (!d.src.startsWith("asset:") || assets[d.src.slice(6)]) ? <img key={"d" + k} className="cd-rb-decor" src={d.src.startsWith("asset:") ? assets[d.src.slice(6)] : d.src} alt="" draggable={false} style={{ left: d.x * PX, top: d.y * PX, width: d.w * PX, height: d.h * PX }} /> : null
        ) : (
          <div key={"d" + k} className="cd-rb-decor" style={{ left: d.x * PX, top: d.y * PX, width: d.w * PX, height: d.h * PX, background: d.fill ? hexAlpha(d.fill, d.fill_opacity ?? 1) : undefined, boxShadow: d.outline ? `inset 0 0 0 1px ${d.outline}` : undefined }} />
        )
      )}
      {slide.items.map((raw) => {
        const it = sd && isTextItem(raw) ? { ...raw, block: designedBlock(raw, sd) } : raw;
        const box = p.live?.[it.id] || it;
        const sel = p.interactive && p.selected === it.id;
        const editing = p.interactive && p.editing === it.id && isTextItem(it);
        const style: React.CSSProperties = { left: box.x * PX, top: box.y * PX, width: box.w * PX, height: box.h * PX };
        const b = it.block;
        let body: React.ReactNode = null;
        if (isTextItem(it)) {
          const empty = isEmptyText(b);
          body = editing ? (
            <div className="cd-rb-slidetext cd-rb-slidetext--editing" style={textStyle(it, design)}>
              <BoxTextEditor html={b.text || ""} at={p.editAt || null} onChange={(html) => p.onText?.(raw, html)} onEditor={(ed) => p.onEditor?.(ed)} />
            </div>
          ) : empty ? (
            p.interactive ? (
              <div className="cd-rb-slidetext cd-rb-slidetext--placeholder" style={textStyle(it, design)}>
                <span>{t(it.role === "title" ? "clickTitle" : it.role === "subtitle" ? "clickSubtitle" : it.role === "picture" ? "clickPicture" : "clickText")}</span>
                {it.role === "picture" && (
                  <span className="cd-rb-slidefill" onPointerDown={(e) => e.stopPropagation()}>
                    <ImagePicker label={t("picture")} className="cd-rb-slidefill__pic cd-rb-slidefill__pic--big" onPick={(img) => p.onFill?.(raw, "picture", img)}>
                      <Icon d={ICONS.picture} size={26} />
                    </ImagePicker>
                  </span>
                )}
                {it.role === "body" && (
                  <span className="cd-rb-slidefill" onPointerDown={(e) => e.stopPropagation()}>
                    <button type="button" title={t("chart")} aria-label={t("chart")} onClick={() => p.onFill?.(raw, "chart")}>
                      <Icon d={ICONS.chartBar} size={20} />
                    </button>
                    <button type="button" title={t("table")} aria-label={t("table")} onClick={() => p.onFill?.(raw, "table")}>
                      <Icon d={ICONS.table} size={20} />
                    </button>
                    <ImagePicker label={t("picture")} className="cd-rb-slidefill__pic" onPick={(img) => p.onFill?.(raw, "picture", img)}>
                      <Icon d={ICONS.picture} size={20} />
                    </ImagePicker>
                  </span>
                )}
              </div>
            ) : null
          ) : (
            <div className="cd-rb-slidetext" style={textStyle(it, design)} dangerouslySetInnerHTML={{ __html: fillFields(b.text || "", p.fields, true) }} />
          );
        } else if (b.type === "image") {
          const src = typeof b.src === "string" && b.src.startsWith("asset:") ? assets[b.src.slice(6)] : b.src;
          body = src ? (
            <Picture
              b={{ ...b, src }}
              w={box.w}
              h={box.h}
              selected={false}
              zoom={p.zoom || 1}
              column={box.w}
              alt={b.alt || ""}
              onResize={() => undefined}
              cropping={!!p.interactive && p.cropFor === it.id}
              onCrop={(crop) => p.onCrop?.(raw, crop)}
              onCropDone={p.onCropDone}
            />
          ) : (
            <div className="cd-rb-drawing">
              <span className="cd-ring" />
            </div>
          );
        } else if (b.type === "chart" || b.type === "table") {
          const pv = previews[it.id];
          const stale = !!pv && pv.sig !== b.sig;
          if (pv && pv.error) {
            body = (
              <div className="cd-rb-missing">
                <Icon d={ICONS.warn} size={16} />
                <span>{pv.error}</span>
              </div>
            );
          } else if (pv && pv.html) {
            body = <TableFit html={pv.html} w={box.w} h={box.h} stale={stale} />;
          } else if (pv && pv.src) {
            body = (
              <div className={stale ? "cd-rb-stale" : ""} style={{ width: "100%", height: "100%" }}>
                <Picture
                  b={{ ...b, type: "image", src: pv.src, ratio: pv.h / pv.w }}
                  w={box.w}
                  h={box.h}
                  selected={false}
                  zoom={p.zoom || 1}
                  column={box.w}
                  alt={b.title || ""}
                  onResize={() => undefined}
                  cropping={!!p.interactive && p.cropFor === it.id}
                  onCrop={(crop) => p.onCrop?.(raw, crop)}
                  onCropDone={p.onCropDone}
                />
              </div>
            );
          } else {
            body = (
              <div className="cd-rb-drawing">
                <span className="cd-ring" />
                {p.interactive ? t("drawing") : null}
              </div>
            );
          }
        }
        const placeholder = isTextItem(it) && isEmptyText(b) && !editing;
        return (
          <div
            key={it.id}
            id={p.interactive ? "rb-" + it.id : undefined}
            className={["cd-rb-slideitem", sel ? "cd-rb-slideitem--sel" : "", editing ? "cd-rb-slideitem--editing" : "", placeholder && p.interactive ? "cd-rb-slideitem--ph" : ""].join(" ")}
            style={style}
            onPointerDown={p.interactive && !editing ? (e) => p.onItemDown?.(e, raw) : undefined}
          >
            {body}
            {sel && (
              <>
                {/* the box's edges: dragged to move it while its text is being typed */}
                {editing && (["t", "r", "b", "l"] as const).map((side) => <span key={side} className={"cd-rb-slideedge cd-rb-slideedge--" + side} onPointerDown={(e) => p.onItemDown?.(e, raw)} />)}
                {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((c) => (
                  <span
                    key={c}
                    className={"cd-rb-handle cd-rb-handle--" + c}
                    onPointerDown={(e) => p.onHandleDown?.(e, raw, c.includes("e") ? 1 : c.includes("w") ? -1 : 0, c.includes("s") ? 1 : c.includes("n") ? -1 : 0)}
                  />
                ))}
              </>
            )}
          </div>
        );
      })}
      {p.guides && (
        <>
          {p.guides.x.map((x, i) => (
            <span key={"x" + i} className="cd-rb-guide cd-rb-guide--v" style={{ left: x * PX }} />
          ))}
          {p.guides.y.map((y, i) => (
            <span key={"y" + i} className="cd-rb-guide cd-rb-guide--h" style={{ top: y * PX }} />
          ))}
        </>
      )}
    </div>
  );
}

// ---- editing the boxes: selecting, moving (with guides to the canvas's middle and edges and to the other boxes),
// resizing (a picture's or chart's corners keep its shape), typing in a text box, and the keys (PowerPoint's) ----

/** Boxes copied (Ctrl+C / X), pasted on any canvas (Ctrl+V). */
let clipboard: RbSlideItem[] | null = null;

export function useBoxEditing(o: {
  items: RbSlideItem[];
  size: [number, number];
  zoom: number;
  /** This canvas is the one being edited: its keys are listened to. */
  active: boolean;
  onBox: (id: string, box: Box) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPaste: (items: RbSlideItem[]) => void;
  cropFor?: string | null;
  setCropFor?: (id: string | null) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editAt, setEditAt] = useState<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<Record<string, Box>>({});
  const [guides, setGuides] = useState<{ x: number[]; y: number[] } | undefined>(undefined);
  const [W, H] = o.size;
  const zoom = o.zoom;
  const items = o.items;
  const cropFor = o.cropFor;
  const setCropFor = o.setCropFor || (() => undefined);
  const setItem = (id: string, box: Box) => o.onBox(id, box);
  // ---- moving and resizing with the mouse (inches; the slide is drawn at `zoom`)
  const drag = useRef<null | { id: string; mode: "move" | "size"; x0: number; y0: number; box: Box; dx: number; dy: number; moved: boolean; keep: boolean; text: boolean; wasSel: boolean }>(null);
  const toInches = (px: number) => px / zoom / PX;
  const SNAP = () => 7 / zoom / PX;
  const snapMove = (id: string, box: Box): { box: Box; gx: number[]; gy: number[] } => {
    const others = items.filter((it) => it.id !== id);
    const xs = [0, W / 2, W, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
    const ys = [0, H / 2, H, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
    const out = { ...box };
    const gx: number[] = [];
    const gy: number[] = [];
    const tol = SNAP();
    // the box's left, middle and right edges, whichever is nearest a guide
    let best: [number, number] | null = null;
    [0, box.w / 2, box.w].forEach((off) => xs.forEach((g) => {
      const d = g - (box.x + off);
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best[0]))) best = [d, g];
    }));
    if (best) {
      out.x = box.x + (best as [number, number])[0];
      gx.push((best as [number, number])[1]);
    }
    best = null;
    [0, box.h / 2, box.h].forEach((off) => ys.forEach((g) => {
      const d = g - (box.y + off);
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best[0]))) best = [d, g];
    }));
    if (best) {
      out.y = box.y + (best as [number, number])[0];
      gy.push((best as [number, number])[1]);
    }
    return { box: out, gx, gy };
  };
  const onItemDown = (e: React.PointerEvent, it: RbSlideItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (editing && editing !== it.id) setEditing(null);
    drag.current = { id: it.id, mode: "move", x0: e.clientX, y0: e.clientY, box: { x: it.x, y: it.y, w: it.w, h: it.h }, dx: 0, dy: 0, moved: false, keep: false, text: isTextItem(it) && it.role !== "picture", wasSel: selected === it.id };
    setSelected(it.id);
    if (cropFor && cropFor !== it.id) setCropFor(null);
  };
  const onHandleDown = (e: React.PointerEvent, it: RbSlideItem, dx: number, dy: number) => {
    e.stopPropagation();
    e.preventDefault();
    const picture = it.block.type === "image" || it.block.type === "chart";
    drag.current = { id: it.id, mode: "size", x0: e.clientX, y0: e.clientY, box: { x: it.x, y: it.y, w: it.w, h: it.h }, dx, dy, moved: false, keep: picture && !!dx && !!dy, text: false, wasSel: true };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const mx = toInches(e.clientX - d.x0);
      const my = toInches(e.clientY - d.y0);
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
      d.moved = true;
      if (d.mode === "move") {
        const snapped = snapMove(d.id, { ...d.box, x: d.box.x + mx, y: d.box.y + my });
        setLive({ [d.id]: snapped.box });
        setGuides({ x: snapped.gx, y: snapped.gy });
      } else {
        const b = { ...d.box };
        const min = 0.2;
        if (d.keep) {
          // a corner of a picture or chart: its shape is kept
          const grow = Math.abs(mx) * d.box.h > Math.abs(my) * d.box.w ? mx * d.dx : (my * d.dy * d.box.w) / d.box.h;
          const w = Math.max(min, d.box.w + grow);
          const h = (w * d.box.h) / d.box.w;
          b.w = w;
          b.h = h;
          if (d.dx < 0) b.x = d.box.x + d.box.w - w;
          if (d.dy < 0) b.y = d.box.y + d.box.h - h;
        } else {
          if (d.dx > 0) b.w = Math.max(min, d.box.w + mx);
          if (d.dx < 0) {
            b.w = Math.max(min, d.box.w - mx);
            b.x = d.box.x + d.box.w - b.w;
          }
          if (d.dy > 0) b.h = Math.max(min, d.box.h + my);
          if (d.dy < 0) {
            b.h = Math.max(min, d.box.h - my);
            b.y = d.box.y + d.box.h - b.h;
          }
        }
        setLive({ [d.id]: b });
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      setGuides(undefined);
      if (!d) return;
      const box = live[d.id];
      setLive({});
      if (d.moved && box) {
        setItem(d.id, { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) });
      } else if (!d.moved && d.text && d.mode === "move" && editing !== d.id) {
        // a click in a text box: type in it, the caret where it was clicked
        setEditAt({ x: e.clientX, y: e.clientY });
        setEditing(d.id);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });


  // the keys for the boxes (the builder has its own for the rest: slides, undo...)
  useEffect(() => {
    if (!o.active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = !!target.closest("input, textarea, select, [contenteditable=true]");
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        if (editing) {
          setEditing(null);
          e.preventDefault();
        } else if (selected) setSelected(null);
        return;
      }
      if (typing) return;
      const it = items.find((x) => x.id === selected);
      if (it && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        o.onRemove(it.id);
        setSelected(null);
      } else if (it && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = mod ? 0.01 : e.shiftKey ? 0.5 : 0.1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        setItem(it.id, { x: round(it.x + dx), y: round(it.y + dy), w: it.w, h: it.h });
      } else if (it && mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        o.onDuplicate(it.id);
      } else if (it && mod && (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "x")) {
        e.preventDefault();
        clipboard = [it];
        if (e.key.toLowerCase() === "x") {
          o.onRemove(it.id);
          setSelected(null);
        }
      } else if (mod && e.key.toLowerCase() === "v" && clipboard) {
        e.preventDefault();
        const pasted = clipboard.map((c) => {
          const id = newId("i");
          return { ...c, id, role: undefined, x: round(c.x + 0.2), y: round(c.y + 0.2), block: { ...c.block, id } };
        });
        o.onPaste(pasted);
        setSelected(pasted[pasted.length - 1].id);
      } else if (e.key === "Tab" && items.length) {
        e.preventDefault();
        const i = items.findIndex((x) => x.id === selected);
        setSelected(items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].id);
      } else if (it && e.key === "Enter" && isTextItem(it)) {
        e.preventDefault();
        setEditAt(null);
        setEditing(it.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const clear = () => {
    setSelected(null);
    setEditing(null);
    setCropFor(null);
  };
  return { selected, setSelected, editing, setEditing, editAt, setEditAt, live, guides, onItemDown, onHandleDown, clear };
}
