import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RbBlock } from "../types";
import { ICONS } from "../ui";
import { Big, Drop, Item, keep, Small } from "../kit/controls";
import { OPACITIES, PicStyleGallery, RotateMenu, SHAPES, SwatchGrid, WrapMenu } from "../kit/menus";
import { placeAbove } from "../kit/place";

// The toolbar over a chart, table or picture selected on the page (or a text box of a slide or free page), as Word's
// floating toolbar: its style and shape, crop, border, wrapping, turning, position and width, Customize, moving it,
// duplicating and deleting it. It is put in the builder's root (.cd-rb) so the pages' zoom does not scale it.

interface Props {
  /** The ribbon's element: the toolbar is put in the builder (.cd-rb) it is in. */
  anchor: React.RefObject<HTMLDivElement>;
  /** The chart, table or picture selected on the page. */
  selected?: RbBlock | null;
  /** A text box selected (on a slide or a free page, not being typed in): its fill and outline. */
  textBox?: { id: string; fill?: string; fill_opacity?: number; outline?: string; onPatch: (patch: Partial<RbBlock>) => void };
  /** The colours offered: the theme's. */
  swatches: string[];
  /** A box on a slide or a free page: no wrapping, position or widths, and up and down are its stacking order. */
  boxed: boolean;
  cropping?: boolean;
  onCropMode?: () => void;
  onSelected: (patch: Partial<RbBlock>) => void;
  onCustomize: () => void;
  onMove?: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  t: (k: string) => string;
}

export function ObjectToolbar(props: Props) {
  const { swatches, boxed, t } = props;
  const sel = props.selected || null;
  const miniHost = props.anchor.current?.closest(".cd-rb") || null;
  // the toolbar of a selected chart, table or picture: above it (under it when there is no room), kept in place as the
  // pages move
  const objRef = useRef<HTMLDivElement>(null);
  const [objAt, setObjAt] = useState<{ top: number; left: number } | null>(null);
  const objId = sel?.id || props.textBox?.id || null;
  useEffect(() => {
    if (!objId) {
      setObjAt(null);
      return undefined;
    }
    const place = () => {
      const el = document.getElementById("rb-" + objId);
      if (!el) return setObjAt(null);
      const r = el.getBoundingClientRect();
      if (r.bottom < 60 || r.top > window.innerHeight - 20) return setObjAt(null);
      const w = objRef.current?.offsetWidth || 520;
      const h = objRef.current?.offsetHeight || 70;
      const { top, left } = placeAbove(r, w, h, 12, 70);
      setObjAt((cur) => (cur && Math.abs(cur.top - top) < 0.5 && Math.abs(cur.left - left) < 0.5 ? cur : { top, left }));
    };
    place();
    const timer = setInterval(place, 250);
    const near = (e: MouseEvent) => {
      const bar = objRef.current;
      const thing = document.getElementById("rb-" + objId);
      if (!bar || !thing) return;
      const dist = (r: DOMRect) => Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
      const d = Math.min(dist(bar.getBoundingClientRect()), dist(thing.getBoundingClientRect()));
      bar.style.opacity = String(d < 30 ? 1 : Math.max(0, 1 - (d - 30) / 200));
      bar.style.pointerEvents = d > 200 ? "none" : "";
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousemove", near);
    return () => {
      clearInterval(timer);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousemove", near);
    };
  }, [objId]);

  return (
    <>
      {!sel &&
        props.textBox &&
        objAt &&
        miniHost &&
        createPortal(
          <div ref={objRef} className="cd-rb-mini cd-rb-objbar" style={{ top: objAt.top, left: objAt.left }} role="toolbar" aria-label={t("textBox")} onMouseDown={(e) => (e.target as HTMLElement).tagName !== "INPUT" && keep(e)}>
            <Drop width={230} trigger={(open, toggle) => <Big icon={["M5 16l6-11 6 11z", "M4 20h16"]} label={t("shapeFill")} menu on={open || !!props.textBox?.fill} tone="amber" onClick={toggle} />}>
              {(close) => (
                <div className="cd-rb-swatchmenu">
                  <Item
                    label={t("noFill")}
                    on={!props.textBox?.fill}
                    onClick={() => {
                      props.textBox?.onPatch({ fill: undefined, fill_opacity: undefined });
                      close();
                    }}
                  />
                  <SwatchGrid colours={["#000000", "#ffffff"].concat(swatches)} onPick={(c) => props.textBox?.onPatch({ fill: c, fill_opacity: props.textBox?.fill_opacity ?? 1 })} />
                  <div className="cd-rb-fieldmenu__head">{t("transparency")}</div>
                  {OPACITIES.map(([v, label]) => (
                    <Item key={v} label={label} on={!!props.textBox?.fill && (props.textBox?.fill_opacity ?? 1) === v} onClick={() => props.textBox?.onPatch({ fill: props.textBox?.fill || "#000000", fill_opacity: v })} />
                  ))}
                </div>
              )}
            </Drop>
            <Drop width={220} trigger={(open, toggle) => <Big icon={["M4 4h16v16H4z"]} label={t("shapeOutline")} menu on={open || !!props.textBox?.outline} tone="blue" onClick={toggle} />}>
              {(close) => (
                <div className="cd-rb-swatchmenu">
                  <Item
                    label={t("noOutline")}
                    on={!props.textBox?.outline}
                    onClick={() => {
                      props.textBox?.onPatch({ outline: undefined });
                      close();
                    }}
                  />
                  <SwatchGrid colours={["#000000", "#ffffff"].concat(swatches)} onPick={(c) => props.textBox?.onPatch({ outline: c })} />
                </div>
              )}
            </Drop>
            <span className="cd-rb-mini__sep" />
            <div className="cd-rb-mini__rows">
              <div className="cd-rb-mini__row">
                <Small icon={ICONS.up} label={t("bringForward")} onClick={() => props.onMove?.(-1)} />
                <Small icon={ICONS.down} label={t("sendBackward")} onClick={() => props.onMove?.(1)} />
              </div>
              <div className="cd-rb-mini__row">
                <Small icon={ICONS.copy} label={t("duplicate")} onClick={props.onDuplicate} />
                <Small icon={ICONS.trash} label={t("delete")} tone="red" onClick={props.onRemove} />
              </div>
            </div>
          </div>,
          miniHost
        )}
      {sel &&
        objAt &&
        miniHost &&
        createPortal(
          <div ref={objRef} className="cd-rb-mini cd-rb-objbar" style={{ top: objAt.top, left: objAt.left }} role="toolbar" aria-label={t("arrange")} onMouseDown={(e) => (e.target as HTMLElement).tagName !== "INPUT" && keep(e)}>
            {(sel.type === "image" || sel.type === "chart") && (
              <>
                <Drop width={210} trigger={(open, toggle) => <Big icon={["M5 5h14v14H5z", "M9 9h6v6H9z"]} label={t("pictureStyles")} menu on={open} tone="purple" onClick={toggle} />}>
                  {(close) => (
                    <>
                      <PicStyleGallery now={sel.pic_style} t={t} onPick={(ps) => props.onSelected({ pic_style: ps })} />
                      <div className="cd-rb-fieldmenu__head">{t("shapeGroup")}</div>
                      {SHAPES.map(([k, key]) => [k, t(key)] as [NonNullable<RbBlock["shape"]>, string]).map(([k, label]) => (
                        <Item
                          key={k}
                          label={label}
                          on={(sel.shape || "rect") === k}
                          onClick={() => {
                            props.onSelected({ shape: k === "rect" ? undefined : k });
                            close();
                          }}
                        />
                      ))}
                    </>
                  )}
                </Drop>
                <Big icon={["M7 3v14h14", "M3 7h14v14"]} label={t("crop")} on={!!props.cropping} tone="teal" onClick={props.onCropMode} />
                <Drop width={230} trigger={(open, toggle) => <Big icon={["M4 4h16v16H4z", "M7 7h10v10H7z"]} label={t("border")} menu on={open || !!sel.border} tone="blue" onClick={toggle} />}>
                  {(close) => (
                    <div className="cd-rb-swatchmenu">
                      <Item
                        label={t("noBorder")}
                        on={!sel.border}
                        onClick={() => {
                          props.onSelected({ border: undefined });
                          close();
                        }}
                      />
                      <SwatchGrid colours={swatches} onPick={(c) => props.onSelected({ border: true, border_color: c })} />
                      <div className="cd-rb-fieldmenu__head">{t("borderWidth")}</div>
                      {[0.5, 1, 1.5, 2.25, 3, 4.5, 6].map((v) => (
                        <Item key={v} label={v + " pt"} on={!!sel.border && (sel.border_width ?? 2.25) === v} onClick={() => props.onSelected({ border: true, border_width: v })} />
                      ))}
                    </div>
                  )}
                </Drop>
                {!boxed && (
    <WrapMenu b={sel} t={t} tone="blue" onSelected={props.onSelected} />
    )}
                <RotateMenu b={sel} t={t} tone="teal" onSelected={props.onSelected} />
              </>
            )}
            {!boxed && sel.type !== "canvas" && (
    <Drop width={220} trigger={(open, toggle) => <Big icon={["M4 5h16", "M8 9h8v7H8z", "M4 20h16"]} label={t("position")} menu on={open} tone="blue" onClick={toggle} />}>
              {(close) => (
                <>
                  {(["left", "center", "right"] as const).map((al) => {
                    const key = "align" + al[0].toUpperCase() + al.slice(1);
                    return (
                      <Item
                        key={al}
                        icon={ICONS[key]}
                        label={t(key)}
                        on={(sel.align || "center") === al}
                        onClick={() => {
                          props.onSelected({ align: al });
                          close();
                        }}
                      />
                    );
                  })}
                  {sel.type !== "table" && (
                    <>
                      <div className="cd-rb-fieldmenu__head">{t("chartLayouts")}</div>
                      {([
                        ["full", t("fullWidth")],
                        ["half", t("half")],
                        ["third", t("third")]
                      ] as [NonNullable<RbBlock["size"]>, string][]).map(([k, label]) => (
                        <Item
                          key={k}
                          label={label}
                          on={(sel.size || "full") === k}
                          onClick={() => {
                            props.onSelected(k === "full" ? { size: k } : { size: k, wrap: undefined });
                            close();
                          }}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </Drop>
    )}
            {sel.type === "chart" && <Big icon={["M4 7h9", "M17 7h3", "M4 17h3", "M11 17h9", "M15 5v4", "M9 15v4"]} label={t("customize")} tone="purple" onClick={props.onCustomize} />}
            <span className="cd-rb-mini__sep" />
            <div className="cd-rb-mini__rows">
              <div className="cd-rb-mini__row">
                <Small icon={ICONS.up} label={boxed ? t("bringForward") : t("moveUp")} onClick={() => props.onMove?.(-1)} />
                <Small icon={ICONS.down} label={boxed ? t("sendBackward") : t("moveDown")} onClick={() => props.onMove?.(1)} />
              </div>
              <div className="cd-rb-mini__row">
                <Small icon={ICONS.copy} label={t("duplicate")} onClick={props.onDuplicate} />
                <Small icon={ICONS.trash} label={t("delete")} tone="red" onClick={props.onRemove} />
              </div>
            </div>
          </div>,
          miniHost
        )}
    </>
  );
}
