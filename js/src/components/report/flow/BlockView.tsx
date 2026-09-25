import React, { createContext, useContext } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { tr } from "../../../lang";
import { asPicture, blockInches, blockSig, columnInches, fillFields, PT, PX, shownInches, wrapOf } from "../layout";
import { Picture } from "../Picture";
import type { RbBlock, RbDesign, RbKind, RbPreview, RbSlideItem } from "../types";
import { CanvasPage } from "./CanvasPage";
import { Icon, ICONS } from "../ui";

// A chart, table or picture inside the document (the rbBlock node, flow/extensions.ts): drawn as before from R's
// preview, with its tools when selected. What it needs from the editor comes through FlowContext.

export interface FlowCtx {
  previews: Record<string, RbPreview>;
  /** The report's pictures by id ("asset:<id>" in a block's src). */
  assets: Record<string, string>;
  design: RbDesign;
  region?: string;
  lang: string;
  kinds: RbKind[];
  fields: Record<string, string>;
  zoom: number;
  preview: boolean;
  styleFor: string | null;
  /** The picture or chart in crop mode. */
  cropFor: string | null;
  setCropFor: (id: string | null) => void;
  t: (k: string) => string;
  setStyleFor: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<RbBlock>) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  years?: number[];
  /** A picture read in the browser, kept in the dataset: its "asset:<id>". */
  assetOf?: (src: string) => string;
  /** The free page being edited, and what is selected on it (the ribbon acts on it). */
  canvasFor?: string | null;
  setCanvasFor?: (id: string | null) => void;
  onCanvasSel?: (sel: { canvas: string; item: RbSlideItem | null; editing: boolean }) => void;
  /** Change a free page's boxes from the page as it is now (what is typed in a text box). */
  onUpdateLive?: (id: string, make: (items: RbSlideItem[]) => RbSlideItem[]) => void;
}

export const FlowContext = createContext<FlowCtx | null>(null);

/** The picture, chart or table itself (also used for the pages shown side by side, where nothing is selected). */
export function BlockBody({ b, ctx, selected }: { b: RbBlock; ctx: FlowCtx; selected: boolean }) {
  const { previews, design, t, lang } = ctx;
  if (b.type === "canvas") return <CanvasPage b={b} ctx={ctx} />;
  const pv = previews[b.id];
  const kind = ctx.kinds.find((k) => k.kind === b.kind);
  const captionStyle: React.CSSProperties = { fontSize: design.caption_size * PT, color: design.muted_color };
  if (b.type === "image") {
    const [w, h] = blockInches(b, design);
    const src = typeof b.src === "string" && b.src.startsWith("asset:") ? ctx.assets[b.src.slice(6)] : b.src;
    return (
      <figure className="cd-rb-figure" style={{ textAlign: wrapOf(b) === "inline" ? b.align || "center" : "center" }}>
        {src ? (
          <Picture
            b={{ ...b, src }}
            w={w}
            h={h}
            selected={selected}
            zoom={ctx.zoom}
            column={columnInches(b, design)}
            alt={b.alt || ""}
            onResize={(width, stretch) => ctx.onUpdate(b.id, stretch === undefined ? { width } : { width, stretch: Math.abs(stretch - 1) < 0.005 ? undefined : stretch })}
            cropping={selected && ctx.cropFor === b.id}
            onCrop={(crop, width) => ctx.onUpdate(b.id, { crop, width })}
            onCropDone={() => ctx.setCropFor(null)}
          />
        ) : b.src ? (
          <div className="cd-rb-drawing" style={{ width: w * PX, height: h * PX }}>
            <span className="cd-ring" />
          </div>
        ) : (
          <div className="cd-rb-missing" style={{ height: 120 }}>
            <Icon d={ICONS.image} size={18} />
            <span>{t("chooseImage")}</span>
          </div>
        )}
        {typeof b.caption === "string" && b.caption && <figcaption style={captionStyle}>{fillFields(b.caption, ctx.fields)}</figcaption>}
      </figure>
    );
  }
  const [w, h] = pv && !pv.error ? [pv.w, pv.h] : blockInches(b, design);
  const fresh = pv && pv.sig === blockSig(b, design, ctx.region, lang);
  let body: React.ReactNode;
  if (pv && pv.error) {
    body = (
      <div className="cd-rb-missing" style={{ height: Math.min(h * PX, 160) }}>
        <Icon d={ICONS.warn} size={18} />
        <span>
          <b>{tr(kind?.label, lang)}</b>
          <br />
          {t("notDrawn")}: {pv.error}
        </span>
      </div>
    );
  } else if (pv && pv.html) {
    body = <div className={fresh ? "cd-rb-table" : "cd-rb-table cd-rb-stale"} dangerouslySetInnerHTML={{ __html: pv.html }} />;
  } else if (pv && pv.src && b.type === "chart") {
    // a chart is shown as a picture of its drawing: resized, cropped, turned, recoloured and shaped as pictures are
    const pic: RbBlock = { ...asPicture(b, design), src: pv.src, ratio: pv.h / pv.w };
    const [pw, ph] = blockInches(pic, design);
    body = (
      <div className={fresh ? "cd-rb-figure" : "cd-rb-figure cd-rb-stale"} style={{ textAlign: wrapOf(b) === "inline" ? b.align || "center" : "center" }}>
        <Picture
          b={pic}
          w={pw}
          h={ph}
          selected={selected}
          zoom={ctx.zoom}
          column={columnInches(b, design)}
          alt={b.title || tr(kind?.label, lang)}
          onResize={(width, stretch) => ctx.onUpdate(b.id, stretch === undefined ? { width } : { width, stretch: Math.abs(stretch - 1) < 0.005 ? undefined : stretch })}
          cropping={selected && ctx.cropFor === b.id}
          onCrop={(crop, width) => ctx.onUpdate(b.id, { crop, width })}
          onCropDone={() => ctx.setCropFor(null)}
        />
      </div>
    );
  } else if (pv && pv.src) {
    body = <img className={fresh ? "cd-rb-img" : "cd-rb-img cd-rb-stale"} src={pv.src} alt={b.title || tr(kind?.label, lang)} style={{ width: w * PX, height: h * PX }} draggable={false} />;
  } else {
    body = (
      <div className="cd-rb-drawing" style={{ width: w * PX, height: (b.type === "table" ? 2 : h) * PX }}>
        <span className="cd-ring" />
        {t("drawing")}
      </div>
    );
  }
  if (pv && !fresh && !pv.error) body = <div className="cd-rb-updating">{body}<span className="cd-rb-updating__tag">{t("updating")}</span></div>;
  if (selected && b.type === "chart") {
    body = (
      <div className="cd-rb-chartwrap">
        <input className="cd-rb-titleedit" type="text" value={b.title || ""} placeholder={t("titleAuto")} aria-label={t("title")} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => ctx.onUpdate(b.id, { title: e.target.value })} />
        {body}
      </div>
    );
  }
  return <>{body}</>;
}

export function BlockView({ node, selected }: NodeViewProps) {
  const ctx = useContext(FlowContext);
  const b: RbBlock = { ...(node.attrs.block as RbBlock), id: node.attrs.bid as string };
  if (!ctx) return <NodeViewWrapper />;
  const { t, design } = ctx;
  const sel = selected && !ctx.preview;
  const wrap = wrapOf(b);
  // sizes and wrapping are on the node's own element (extensions.ts), which floats
  const cls = ["cd-rb-block", "cd-rb-block--view", sel ? "cd-rb-block--sel" : ""].join(" ");
  const style: React.CSSProperties = { ...(sel ? { outlineColor: design.accent } : {}), ...(wrap !== "inline" ? { width: shownInches(b, design)[0] * PX + 6 } : {}) };
  return (
    <NodeViewWrapper id={"rb-" + b.id} className={cls} style={style} data-bid={b.id} onDoubleClick={() => !ctx.preview && b.type === "chart" && ctx.setStyleFor(b.id)}>
      <BlockBody b={b} ctx={ctx} selected={sel} />
      {!ctx.preview && (
        <div className={sel ? "cd-rb-tools cd-rb-tools--on" : "cd-rb-tools"} contentEditable={false}>
          <span className="cd-rb-tools__grip" title={t("dragToMove")} data-drag-handle="" draggable>
            <Icon d={ICONS.grip} size={14} />
          </span>
        </div>
      )}
    </NodeViewWrapper>
  );
}
