import React, { useEffect, useState } from "react";
import { tr } from "../../../lang";
import { fillCrop, isEmptyText, newId, round } from "../deck";
import { BoxCanvas, canvasFields, useBoxEditing } from "../kit/BoxCanvas";
import { blockSig, pageBox, pageInches, PX } from "../layout";
import type { RbBlock, RbDesign, RbSlideItem } from "../types";
import { Icon, ICONS, kindIcon } from "../ui";
import type { FlowCtx } from "./BlockView";

// A free-layout page of a document (block type "canvas"): a whole page of text boxes, charts, tables and pictures placed
// anywhere, as on a slide (kit/BoxCanvas). cd2030.core writes it as Word floating objects at the same places, on a page
// of its own. Its boxes are inches from the top-left of the page's text area.

/** The size of a document's free page: the text area (a little less high, so it fits the page as laid out). */
export const canvasSize = (design: RbDesign, b?: RbBlock): [number, number] => [pageInches(design).textWidth, b?.h || pageBox(design).contentH / PX - 0.12];

/** A new free page: a title across the top and an empty box under it for text, a chart, a table or a picture. */
export function newCanvas(design: RbDesign): Partial<RbBlock> {
  const [W, H] = canvasSize(design);
  const title = newId("i");
  const body = newId("i");
  return {
    type: "canvas",
    items: [
      { id: title, x: 0, y: 0, w: round(W), h: 0.7, role: "title", block: { id: title, type: "paragraph", text: "", font_size: 24 } },
      { id: body, x: 0, y: 0.9, w: round(W), h: round(Math.min(4, H - 1)), role: "body", block: { id: body, type: "paragraph", text: "", font_size: 11 } }
    ]
  };
}

/** A text box for a free page: a document's text size, not a slide's. */
export const canvasTextBox = (design: RbDesign): RbSlideItem => {
  const [W, H] = canvasSize(design);
  const id = newId("i");
  return { id, x: round(W * 0.25), y: round(H * 0.4), w: round(W * 0.5), h: 0.8, block: { id, type: "paragraph", text: "", font_size: 11 } };
};

export function CanvasPage({ b, ctx }: { b: RbBlock; ctx: FlowCtx }) {
  const [W, H] = canvasSize(ctx.design, b);
  const own = b.items || [];
  // the charts and tables signed as drawn (their box is their size), so a preview drawn for an older box shows as updating
  const items = own.map((it) =>
    it.block.type === "chart" || it.block.type === "table"
      ? (() => {
          const block = { ...it.block, id: it.id, box: [round(it.w), round(it.h)] as [number, number] };
          return { ...it, block: { ...block, sig: blockSig(block, ctx.design, ctx.region, ctx.lang) } };
        })()
      : it
  );
  const active = !ctx.preview && ctx.canvasFor === b.id;
  const setItems = (make: (items: RbSlideItem[]) => RbSlideItem[]) => ctx.onUpdate(b.id, { items: make(own) });
  const boxes = useBoxEditing({
    items: own,
    size: [W, H],
    zoom: ctx.zoom,
    active,
    onBox: (id, box) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...box } : x))),
    onRemove: (id) => setItems((list) => list.filter((x) => x.id !== id)),
    onDuplicate: (id) =>
      setItems((list) => {
        const src = list.find((x) => x.id === id);
        if (!src) return list;
        const nid = newId("i");
        return list.concat([{ ...src, id: nid, role: undefined, x: round(src.x + 0.2), y: round(src.y + 0.2), block: { ...src.block, id: nid } }]);
      }),
    onPaste: (pasted) => setItems((list) => list.concat(pasted)),
    cropFor: ctx.cropFor,
    setCropFor: ctx.setCropFor
  });
  // the builder knows which box is selected: its ribbon tabs and toolbar act on it
  useEffect(() => {
    if (active) ctx.onCanvasSel?.({ canvas: b.id, item: own.find((x) => x.id === boxes.selected) || null, editing: !!boxes.editing });
  }, [active, boxes.selected, boxes.editing, b.items]);
  useEffect(() => {
    if (!active) boxes.clear();
  }, [active]);
  // an empty box filled with a chart or table (picked from a list) or a picture
  const [pick, setPick] = useState<{ item: string; type: "chart" | "table" } | null>(null);
  const fill = (itemId: string, block: Partial<RbBlock>) => setItems((list) => list.map((x) => (x.id === itemId ? { ...x, block: { ...block, id: itemId } as RbBlock } : x)));
  const t = ctx.t;
  return (
    <div
      className={active ? "cd-rb-canvaspage cd-rb-canvaspage--on" : "cd-rb-canvaspage"}
      contentEditable={false}
      onPointerDownCapture={() => {
        if (ctx.preview) return;
        if (!active) ctx.setCanvasFor?.(b.id);
        // the document's text lets go of the keys: Delete, the arrows... are the boxes' now
        const el = document.activeElement as HTMLElement | null;
        if (el && el.classList.contains("ProseMirror")) el.blur();
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("cd-rb-slide")) boxes.clear();
      }}
    >
      <BoxCanvas
        slide={{ items }}
        size={[W, H]}
        look="page"
        design={ctx.design}
        fields={canvasFields(own, ctx.fields, ctx.kinds, ctx.years || [], ctx.lang, t("and"))}
        previews={ctx.previews}
        assets={ctx.assets}
        t={t}
        interactive={!ctx.preview}
        selected={active ? boxes.selected : null}
        editing={active ? boxes.editing : null}
        editAt={boxes.editAt}
        live={boxes.live}
        cropFor={ctx.cropFor}
        zoom={ctx.zoom}
        guides={boxes.guides}
        onItemDown={boxes.onItemDown}
        onHandleDown={boxes.onHandleDown}
        onText={(it, html) => ctx.onUpdateLive?.(b.id, (items) => items.map((x) => (x.id === it.id ? { ...x, block: { ...x.block, text: html } } : x)))}
        onFill={(it, what, img) => {
          // the picture takes the box, cut to its shape (as a picture placeholder is filled)
          if (what === "picture" && img) fill(it.id, { type: "image", src: ctx.assetOf ? ctx.assetOf(img.src) : img.src, ratio: img.ratio, shape: "rect", crop: fillCrop(img.ratio, it.w, it.h) });
          else if (what !== "picture") setPick({ item: it.id, type: what });
        }}
        onCrop={(it, crop) => {
          const old = it.block.crop || [0, 0, 0, 0];
          const nw = crop || [0, 0, 0, 0];
          const kx = (100 - nw[1] - nw[3]) / Math.max(5, 100 - old[1] - old[3]);
          const ky = (100 - nw[0] - nw[2]) / Math.max(5, 100 - old[0] - old[2]);
          setItems((list) => list.map((x) => (x.id === it.id ? { ...x, w: round(x.w * kx), h: round(x.h * ky), block: { ...x.block, crop } } : x)));
        }}
        onCropDone={() => ctx.setCropFor(null)}
      />
      {pick && (
        <div className="cd-rb-overlay" role="presentation" onPointerDown={() => setPick(null)}>
          <div className="cd-rb-dialog cd-rb-kindpick" role="dialog" aria-label={t(pick.type)} onPointerDown={(e) => e.stopPropagation()}>
            <div className="cd-rb-dialog__head">
              <b>{t(pick.type === "chart" ? "insertChart" : "insertTable")}</b>
              <button type="button" className="cd-rb-icon" aria-label={t("close")} onClick={() => setPick(null)}>
                <Icon d={ICONS.close} />
              </button>
            </div>
            <div className="cd-rb-kindpick__list">
              {ctx.kinds
                .filter((k) => k.type === pick.type)
                .map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    className="cd-rb-mitem"
                    onClick={() => {
                      fill(pick.item, { type: k.type, kind: k.kind, ...k.defaults });
                      setPick(null);
                    }}
                  >
                    <Icon d={kindIcon(k.type, k.kind)} size={16} />
                    <span>{tr(k.label, ctx.lang)}</span>
                    <small>{tr(k.groupLabel, ctx.lang)}</small>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {!ctx.preview && !active && own.every((it) => isEmptyText(it.block)) && <span className="cd-rb-canvaspage__hint">{t("freePageHint")}</span>}
    </div>
  );
}
