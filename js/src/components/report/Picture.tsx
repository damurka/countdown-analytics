import React, { useEffect, useRef, useState } from "react";
import { imageCrop, imageStretch, PT, PX } from "./layout";
import type { RbBlock } from "./types";

// A picture block (or a chart shown as a picture) on the page as the Word file will have it: turned, flipped and
// cropped (drawn on a canvas once, then kept), its colours changed with CSS filters that do the same arithmetic as
// cd2030.core's .rb_image_file(), its shape and border; and, when selected, handles at its corners to resize it by
// dragging. In crop mode (Word's Crop) the whole picture shows, dimmed outside the part kept, with crop handles.

const drawn = new Map<string, string>();

type Crop = [number, number, number, number];

/** The picture's source turned, flipped and cropped; the source itself when none of these is set. Nothing when not
 *  `active`. */
function useGeometry(b: RbBlock, active = true): string | undefined {
  const crop = imageCrop(b);
  const rotate = (b.rotate || 0) % 360;
  const square = b.shape === "circle";
  const plain = !rotate && !b.flip_h && !b.flip_v && !crop.some((c) => c > 0) && !square;
  const key = b.src && !plain ? [b.src.length, b.src.slice(-40), rotate, b.flip_h ? 1 : 0, b.flip_v ? 1 : 0, crop.join(","), square ? 1 : 0].join("|") : "";
  const [url, setUrl] = useState<string | undefined>(() => (!active ? undefined : plain ? b.src : drawn.get(key)));
  useEffect(() => {
    if (!active) return undefined;
    if (!b.src || plain) {
      setUrl(b.src);
      return undefined;
    }
    const hit = drawn.get(key);
    if (hit) {
      setUrl(hit);
      return undefined;
    }
    let live = true;
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth || 800;
      const h0 = img.naturalHeight || 600;
      const quarter = rotate % 180 === 90;
      // the frame once turned, then the part of it kept
      const fw = quarter ? h0 : w0;
      const fh = quarter ? w0 : h0;
      let cw = Math.max(1, Math.round(fw * (1 - crop[1] - crop[3])));
      let ch = Math.max(1, Math.round(fh * (1 - crop[0] - crop[2])));
      // a circle: the middle square of what is kept
      const side = Math.min(cw, ch);
      const sx = square ? (cw - side) / 2 : 0;
      const sy = square ? (ch - side) / 2 : 0;
      if (square) cw = ch = side;
      // a drawing (a chart's SVG) is drawn larger, so it stays sharp
      const svg = /^data:image\/svg/.test(b.src || "") || /\.svg($|\?)/.test(b.src || "");
      const k = Math.min(svg ? 4 : 1, 2400 / Math.max(cw, ch));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(cw * k));
      canvas.height = Math.max(1, Math.round(ch * k));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(k, k);
      ctx.translate(-fw * crop[3] - sx, -fh * crop[0] - sy);
      // turned about the centre, then flipped (as magick's image_rotate() then image_flop() / image_flip())
      ctx.translate(fw / 2, fh / 2);
      ctx.scale(b.flip_h ? -1 : 1, b.flip_v ? -1 : 1);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.drawImage(img, -w0 / 2, -h0 / 2, w0, h0);
      const out = canvas.toDataURL(/^data:image\/jpe?g/.test(b.src || "") ? "image/jpeg" : "image/png", 0.92);
      drawn.set(key, out);
      if (live) setUrl(out);
    };
    img.src = b.src;
    return () => {
      live = false;
    };
  }, [key, plain, b.src, active]);
  return active ? url : undefined;
}

const CORNERS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const pullOf = (corner: string): [number, number] => [corner.includes("e") ? 1 : corner.includes("w") ? -1 : 0, corner.includes("s") ? 1 : corner.includes("n") ? -1 : 0];

export function Picture({ b, w, h, selected, zoom, column, alt, onResize, cropping, onCrop, onCropDone }: {
  b: RbBlock;
  /** Its size on the page, inches. */
  w: number;
  h: number;
  selected: boolean;
  zoom: number;
  /** The width of its column, inches: the width is kept as a percent of it. */
  column: number;
  alt: string;
  /** Resized: the width (percent of the column), and how much it is stretched when a side handle was dragged. */
  onResize: (widthPercent: number, stretch?: number) => void;
  /** Crop mode is on. */
  cropping?: boolean;
  /** The crop chosen (percent cut off the top, right, bottom and left) and the width that keeps the picture's scale. */
  onCrop?: (crop: Crop | undefined, widthPercent: number) => void;
  /** Crop mode should end (Enter, Esc, a click elsewhere). */
  onCropDone?: () => void;
}) {
  const src = useGeometry(b);
  const whole = useGeometry({ ...b, crop: undefined }, !!cropping);
  const rootRef = useRef<HTMLSpanElement>(null);
  const [live, setLive] = useState<{ w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number; w: number; h: number; dx: number; dy: number; last: { w: number; h: number } } | null>(null);
  const width = (live ? live.w : w) * PX;
  const height = (live ? live.h : h) * PX;
  const bright = 1 + (b.brightness || 0) / 100;
  const contrast = 1 + (b.contrast || 0) / 100;
  const filter = [b.greyscale ? "grayscale(1)" : "", bright !== 1 ? `brightness(${bright})` : "", contrast !== 1 ? `contrast(${contrast})` : ""].filter(Boolean).join(" ");
  const style: React.CSSProperties = {
    width,
    height,
    // drawn to fill its box: a picture stretched by a side handle is stretched
    objectFit: "fill",
    boxSizing: "border-box",
    border: b.border ? `${(b.border_width ?? 2.25) * PT}px solid ${b.border_color || "#5c6670"}` : undefined,
    borderRadius: b.shape === "circle" ? "50%" : b.shape === "rounded" ? Math.min(width, height) * 0.06 : undefined,
    filter: filter || undefined,
    visibility: cropping ? "hidden" : undefined
  };
  // the picture's style (PowerPoint's picture styles): the picture is a little smaller inside its box, the style around it
  const ps = b.pic_style;
  if (ps === "shadow") {
    Object.assign(style, { width: width * 0.96, height: height * 0.95, boxShadow: "3px 4px 9px rgba(0, 0, 0, 0.38)" });
  } else if (ps === "frame") {
    const f = Math.max(3, Math.min(width, height) * 0.05);
    Object.assign(style, { width: width * 0.95, height: height * 0.94, border: `${f}px solid #fff`, boxShadow: "0 0 0 1px #c8c8c8, 3px 4px 9px rgba(0, 0, 0, 0.3)" });
  } else if (ps === "soft") {
    const m = "linear-gradient(to right, transparent, #000 7%, #000 93%, transparent), linear-gradient(to bottom, transparent, #000 7%, #000 93%, transparent)";
    Object.assign(style, { WebkitMaskImage: m, maskImage: m, WebkitMaskComposite: "source-in", maskComposite: "intersect" });
  } else if (ps === "reflection") {
    Object.assign(style, { height: height * 0.75, WebkitBoxReflect: "below 2px linear-gradient(transparent 55%, rgba(255, 255, 255, 0.4))" });
  }

  // ---- resizing ----
  // a handle dragged: a corner resizes the picture keeping its shape, a side stretches it (as Word's); it grows from the
  // opposite side (from its middle when centred); `dx`, `dy`: which way the handle pulls (-1, 0, 1)
  const start = (dx: number, dy: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, w, h, dx, dy, last: { w, h } };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const centred = (b.align || "center") === "center" && (b.wrap || "inline") === "inline";
    const byX = ((e.clientX - d.x) / zoom / PX) * d.dx * (centred ? 2 : 1);
    const byY = ((e.clientY - d.y) / zoom / PX) * d.dy;
    const clampW = (v: number) => Math.min(column, Math.max(column * 0.05, v));
    let next: { w: number; h: number };
    if (d.dx && d.dy) {
      // a corner: the shape is kept
      const grow = Math.abs(byX) > Math.abs((byY * d.w) / d.h) ? byX : (byY * d.w) / d.h;
      const nw = clampW(d.w + grow);
      next = { w: nw, h: (nw * d.h) / d.w };
    } else if (d.dx) {
      // the left or right side: wider or narrower, the same height
      next = { w: clampW(d.w + byX), h: d.h };
    } else {
      // the top or bottom side: taller or shorter, the same width
      next = { w: d.w, h: Math.min(d.w * 10 * (d.h / d.w), Math.max(0.2, d.h + byY)) };
    }
    d.last = next;
    setLive(next);
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    setLive(null);
    if (!d || (Math.abs(d.last.w - d.w) < 0.01 && Math.abs(d.last.h - d.h) < 0.01)) return;
    const pct = Math.round((d.last.w / column) * 1000) / 10;
    if (d.dx && d.dy) return onResize(pct);
    // how much taller for its width than it was, on top of how stretched it was
    const stretch = imageStretch(b) * (d.last.h / d.last.w) / (d.h / d.w);
    onResize(pct, Math.round(stretch * 1000) / 1000);
  };

  // ---- cropping ----
  // the part kept while cropping (fractions: top, right, bottom, left of the picture as turned)
  const committed = imageCrop(b);
  const [cut, setCut] = useState<Crop | null>(null);
  const cutRef = useRef<Crop | null>(null);
  cutRef.current = cut;
  const was = useRef(false);
  const cropSig = committed.join(",");
  useEffect(() => {
    if (cropping) {
      setCut([...committed] as Crop);
    } else if (was.current && cutRef.current) {
      // crop mode ended (Enter, a click elsewhere, the Crop button): the crop is kept
      const k = cutRef.current;
      setCut(null);
      if (k.join(",") !== cropSig) {
        const pct = (x: number) => Math.round(x * 1000) / 10;
        const kept = (1 - k[1] - k[3]) / Math.max(0.05, 1 - committed[1] - committed[3]);
        const next = Math.min(100, Math.max(5, Math.round((b.width || 100) * kept * 10) / 10));
        onCrop?.(k.some((x) => x > 0.0005) ? (k.map(pct) as Crop) : undefined, next);
      }
    }
    was.current = !!cropping;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropping, cropSig]);
  useEffect(() => {
    if (!cropping) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        cutRef.current = null;
        setCut(null);
      }
      onCropDone?.();
    };
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || rootRef.current?.contains(el) || el.closest(".cd-rb-ribbon, .cd-rb-tools")) return;
      onCropDone?.();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [cropping, onCropDone]);
  // the whole picture's size on the page, and where it sits against the box the picture takes now
  const fw = (w * PX) / Math.max(0.1, 1 - committed[1] - committed[3]);
  const fh = (h * PX) / Math.max(0.1, 1 - committed[0] - committed[2]);
  const cropDrag = useRef<{ x: number; y: number; k: Crop; dx: number; dy: number; pan: boolean } | null>(null);
  const cropStart = (dx: number, dy: number, pan = false) => (e: React.PointerEvent) => {
    if (!cut) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    cropDrag.current = { x: e.clientX, y: e.clientY, k: [...cut] as Crop, dx, dy, pan };
  };
  const cropMove = (e: React.PointerEvent) => {
    const d = cropDrag.current;
    if (!d) return;
    const mx = (e.clientX - d.x) / zoom / fw;
    const my = (e.clientY - d.y) / zoom / fh;
    const k = [...d.k] as Crop;
    const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
    if (d.pan) {
      // the frame moved over the picture, keeping its size
      const sx = clamp(mx, d.k[1]) || -clamp(-mx, d.k[3]);
      const sy = clamp(my, d.k[2]) || -clamp(-my, d.k[0]);
      k[3] = d.k[3] + sx;
      k[1] = d.k[1] - sx;
      k[0] = d.k[0] + sy;
      k[2] = d.k[2] - sy;
    } else {
      // a tenth of the picture is always kept (as cd2030.core's .rb_image_crop())
      if (d.dx > 0) k[1] = clamp(d.k[1] - mx, 0.9 - k[3]);
      if (d.dx < 0) k[3] = clamp(d.k[3] + mx, 0.9 - k[1]);
      if (d.dy > 0) k[2] = clamp(d.k[2] - my, 0.9 - k[0]);
      if (d.dy < 0) k[0] = clamp(d.k[0] + my, 0.9 - k[2]);
    }
    setCut(k);
  };
  const cropEnd = () => {
    cropDrag.current = null;
  };
  let cropLayer: React.ReactNode = null;
  if (cropping && cut && whole) {
    const at: React.CSSProperties = { left: -committed[3] * fw, top: -committed[0] * fh, width: fw, height: fh, filter: filter || undefined };
    const frame: React.CSSProperties = {
      left: (cut[3] - committed[3]) * fw,
      top: (cut[0] - committed[0]) * fh,
      width: fw * (1 - cut[1] - cut[3]),
      height: fh * (1 - cut[0] - cut[2])
    };
    cropLayer = (
      <>
        <img className="cd-rb-crop__whole" src={whole} alt="" style={at} draggable={false} />
        <img className="cd-rb-crop__kept" src={whole} alt="" style={{ ...at, clipPath: `inset(${cut[0] * fh}px ${cut[1] * fw}px ${cut[2] * fh}px ${cut[3] * fw}px)` }} draggable={false} />
        <span className="cd-rb-crop__frame" style={frame} onPointerDown={cropStart(0, 0, true)} onPointerMove={cropMove} onPointerUp={cropEnd} onPointerCancel={cropEnd} onClick={(e) => e.stopPropagation()}>
          {CORNERS.map((corner) => {
            const [dx, dy] = pullOf(corner);
            return (
              <span
                key={corner}
                className={"cd-rb-crophandle cd-rb-crophandle--" + corner}
                onPointerDown={cropStart(dx, dy)}
                onPointerMove={cropMove}
                onPointerUp={cropEnd}
                onPointerCancel={cropEnd}
              />
            );
          })}
        </span>
      </>
    );
  }
  return (
    <span ref={rootRef} className={["cd-rb-pic", selected ? "cd-rb-pic--sel" : "", cropping ? "cd-rb-pic--crop" : ""].join(" ")} style={{ width, height }}>
      {src ? <img src={src} alt={alt} style={style} draggable={false} /> : null}
      {cropLayer}
      {selected &&
        !cropping &&
        CORNERS.map((corner) => (
          <span
            key={corner}
            className={"cd-rb-handle cd-rb-handle--" + corner}
            onPointerDown={start(...pullOf(corner))}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onClick={(e) => e.stopPropagation()}
          />
        ))}
      {live !== null && <span className="cd-rb-pic__size">{(live.w * 2.54).toFixed(1)} × {(live.h * 2.54).toFixed(1)} cm</span>}
    </span>
  );
}
