import React from "react";
import { asPicture, blockInches, columnInches, imageRatio } from "../layout";
import { ImagePicker } from "../panels";
import type { RbBlock, RbDesign } from "../types";
import { Icon, ICONS } from "../ui";
import { Big, Col, Drop, Group, keep, NumCombo, Row, Small } from "../kit/controls";
import { PicStyleGallery, RotateMenu, SHAPES, WrapMenu } from "../kit/menus";

// The Picture Format tab of a selected picture (or chart, formatted as the picture of its drawing), as Word's:
// brightness and contrast, styles and shapes, borders, wrapping and turning, crop, size, alt text and caption.

/** Centimetres in an inch. */
export const CM = 2.54;

export function PictureFormatTab({ b: block, design, t, deck, cropping, onCropMode, onSelected, onDuplicate, onRemove }: { b: RbBlock; design: RbDesign; t: (k: string) => string; deck?: boolean; cropping: boolean; onCropMode?: () => void; onSelected: (patch: Partial<RbBlock>) => void; onDuplicate: () => void; onRemove: () => void }) {
  // a chart is formatted as the picture of its drawing (no replacing, alt text or caption: those are the chart's)
  const chart = block.type === "chart";
  const b = asPicture(block, design);
  const [w, h] = blockInches(b, design);
  const col = columnInches(b, design);
  const ratio = imageRatio(b);
  // a width in inches as the percent of its column the picture keeps
  const widthPct = (inches: number) => Math.min(100, Math.max(5, Math.round((inches / col) * 1000) / 10));
  const full = (b.size || "full") === "full";
  const wrap = full ? b.wrap || "inline" : "inline";
  // a crop to a shape (height / width), centred, of the picture as turned
  const cropTo = (target: number) => {
    const turned = imageRatio({ ...b, crop: undefined, shape: undefined });
    const pct = (x: number) => Math.round(x * 1000) / 10;
    if (target < turned) {
      const cut = (1 - target / turned) / 2;
      onSelected({ crop: [pct(cut), 0, pct(cut), 0], shape: b.shape === "circle" ? undefined : b.shape });
    } else {
      const cut = (1 - turned / target) / 2;
      onSelected({ crop: [0, pct(cut), 0, pct(cut)], shape: b.shape === "circle" ? undefined : b.shape });
    }
  };
  const signed = (v: number | undefined) => (v === undefined ? "0" : (v > 0 ? "+" : "") + v + " %");
  const adjust: [number | undefined, string][] = [-40, -20, 0, 20, 40].map((v) => [v === 0 ? undefined : v, signed(v)]);
  const formatted = !!(b.pic_style || b.rotate || b.flip_h || b.flip_v || b.crop || b.stretch || b.brightness || b.contrast || b.greyscale || b.border || b.shape || b.border_color || b.border_width);
  return (
    <>
      <Group label={t("adjust")}>
        {!chart && (
          <ImagePicker label={t("replaceImage")} className="cd-rb-big cd-rb-tone--blue" onPick={(img) => onSelected({ src: img.src, ratio: img.ratio })}>
            <Icon d={ICONS.picture} size={26} />
            <span>{t("replaceImage")}</span>
          </ImagePicker>
        )}
        <Col>
          <NumCombo icon={["M12 4v2", "M12 18v2", "M4 12h2", "M18 12h2", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"]} label={t("brightness")} unit="%" value={b.brightness} placeholder="0" min={-100} max={100} step={5} neutral={0} presets={adjust} onChange={(v) => onSelected({ brightness: v || undefined })} />
          <NumCombo icon={["M12 4a8 8 0 1 0 0 16z", "M12 4a8 8 0 0 1 0 16"]} label={t("contrast")} unit="%" value={b.contrast} placeholder="0" min={-90} max={100} step={5} neutral={0} presets={adjust} onChange={(v) => onSelected({ contrast: v || undefined })} />
        </Col>
        <Col>
          <Small wide icon={["M5 5h14v14H5z", "M5 19L19 5"]} label={t("greyscale")} on={!!b.greyscale} onClick={() => onSelected({ greyscale: !b.greyscale || undefined })} />
          <Small
            wide
            icon={ICONS.undo}
            label={t("resetPicture")}
            disabled={!formatted}
            onClick={() =>
              onSelected({ rotate: undefined, flip_h: undefined, flip_v: undefined, crop: undefined, stretch: undefined, brightness: undefined, contrast: undefined, greyscale: undefined, border: undefined, border_color: undefined, border_width: undefined, shape: undefined, pic_style: undefined })
            }
          />
        </Col>
      </Group>
      <Group label={t("pictureStyles")}>
        <PicStyleGallery now={b.pic_style} t={t} onPick={(ps) => onSelected({ pic_style: ps })} />
        {SHAPES.map(([k, key, icon]) => [k, t(key), icon] as [RbBlock["shape"], string, string[]]).map(([k, label, icon]) => (
          <Big key={k} icon={icon} label={label} on={(b.shape || "rect") === k} onClick={() => onSelected({ shape: k === "rect" ? undefined : k })} />
        ))}
        <Col>
          <Row>
            <Small wide icon={["M4 4h16v16H4z", "M7 7h10v10H7z"]} label={t("border")} on={!!b.border} onClick={() => onSelected({ border: !b.border || undefined })} />
            <input type="color" className="cd-rb-colorinput" aria-label={t("borderColour")} title={t("borderColour")} value={b.border_color || "#5c6670"} onChange={(e) => onSelected({ border: true, border_color: e.target.value })} />
          </Row>
          <NumCombo
            icon={["M4 7h16", "M4 12h16", "M4 17h16"]}
            label={t("borderWidth")}
            unit="pt"
            value={b.border_width ?? (b.border ? 2.25 : undefined)}
            placeholder="2.25"
            min={0.25}
            max={20}
            step={0.25}
            neutral={2.25}
            presets={[0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((v) => [v, v + " pt"] as [number, string])}
            onChange={(v) => onSelected({ border: true, border_width: v })}
          />
        </Col>
      </Group>
{!deck && (
      <Group label={t("arrange")}>
        <WrapMenu b={b} t={t} width={250} onSelected={onSelected} />
        <RotateMenu b={b} t={t} width={220} onSelected={onSelected} />
        <Col>
          <Row>
            {(["left", "center", "right"] as const).map((a) => {
              const key = "align" + a[0].toUpperCase() + a.slice(1);
              return <Small key={a} icon={ICONS[key]} label={t(key)} on={(b.align || "center") === a} onClick={() => onSelected({ align: a })} />;
            })}
          </Row>
          <Row>
            {([
              ["full", t("fullWidth")],
              ["half", t("half")],
              ["third", t("third")]
            ] as [RbBlock["size"], string][]).map(([k, label]) => (
              <Small key={k} label={label} on={(b.size || "full") === k} onClick={() => onSelected(k === "full" ? { size: k } : { size: k, wrap: undefined })}>
                <span className="cd-rb-smtext">{label}</span>
              </Small>
            ))}
          </Row>
        </Col>
      </Group>
)}
      <Group label={t("imageSizeGroup")}>
{!deck && (
        <Drop width={250} trigger={(open, toggle) => <Big icon={["M3 3h18v18H3z", "M8 8h8v8H8z"]} label={t("spacing")} menu on={open || b.space_top !== undefined || b.space_bottom !== undefined || b.space_side !== undefined} onClick={toggle} />}>
          {() => (
            <div className="cd-rb-hfmenu cd-rb-cropmenu">
              <span className="cd-rb-hint" style={{ gridColumn: "1 / -1" }}>{t("spacingHint")}</span>
              {([
                ["space_top", t("spaceAbove"), 0],
                ["space_bottom", t("spaceBelow"), wrap === "inline" ? 4 : 5.65],
                ["space_side", t("spaceBeside"), 8.5]
              ] as ["space_top" | "space_bottom" | "space_side", string, number][])
                .filter(([k]) => k !== "space_side" || wrap !== "inline")
                .map(([k, label, def]) => (
                  <label key={k} className="cd-rb-numfield">
                    <span>{label}</span>
                    <input type="number" min={0} max={72} step={1} value={Math.round((b[k] ?? def) * 10) / 10} onChange={(e) => onSelected({ [k]: Math.max(0, Math.min(72, Number(e.target.value) || 0)) } as Partial<RbBlock>)} />
                    <small>pt</small>
                  </label>
                ))}
              <button type="button" className="cd-rb-link" disabled={b.space_top === undefined && b.space_bottom === undefined && b.space_side === undefined} onClick={() => onSelected({ space_top: undefined, space_bottom: undefined, space_side: undefined })}>
                {t("resetPicture")}
              </button>
            </div>
          )}
        </Drop>
)}
        <Big icon={["M7 3v14h14", "M3 7h14v14"]} label={t("crop")} on={cropping} tone="teal" onClick={onCropMode} />
        <Col>
          <Drop width={220} trigger={(open, toggle) => <Small wide icon={["M5 7h14v10H5z"]} label={t("cropToRatio")} on={open} onClick={toggle} />}>
            {(close) => (
              <div className="cd-rb-hfmenu cd-rb-cropmenu">
                <div className="cd-rb-croprat">
                  <span>{t("cropToRatio")}</span>
                  <div>
                    {([
                      ["1:1", 1],
                      ["4:3", 3 / 4],
                      ["3:2", 2 / 3],
                      ["16:9", 9 / 16],
                      ["3:4", 4 / 3],
                      ["2:3", 3 / 2]
                    ] as [string, number][]).map(([label, r]) => (
                      <button
                        key={label}
                        type="button"
                        className="cd-rb-btn"
                        onMouseDown={keep}
                        onClick={() => {
                          cropTo(r);
                          close();
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Drop>
          <Small wide icon={ICONS.undo} label={t("resetCrop")} disabled={!b.crop} onClick={() => onSelected({ crop: undefined })} />
        </Col>
{!deck && (
        <Col>
          <NumCombo
            label={t("imageHeight")}
            unit="cm"
            value={Math.round(h * CM * 100) / 100}
            min={0.5}
            max={60}
            step={0.1}
            neutral={h * CM}
            width={44}
            presets={[25, 50, 75, 100].map((p) => [Math.round(col * (p / 100) * ratio * CM * 100) / 100, p + " %"] as [number, string])}
            onChange={(v) => v !== undefined && onSelected({ width: widthPct(v / CM / ratio) })}
          />
          <NumCombo
            label={t("imageWidth")}
            unit="cm"
            value={Math.round(w * CM * 100) / 100}
            min={0.5}
            max={60}
            step={0.1}
            neutral={w * CM}
            width={44}
            presets={[25, 50, 75, 100].map((p) => [Math.round(col * (p / 100) * CM * 100) / 100, p + " %"] as [number, string])}
            onChange={(v) => v !== undefined && onSelected({ width: widthPct(v / CM) })}
          />
        </Col>
)}
      </Group>
      {!chart && (
      <Group label={t("accessibility")}>
        <Drop width={300} trigger={(open, toggle) => <Big icon={["M4 5h16v14H4z", "M8 10h8", "M8 14h5"]} label={t("altText")} menu on={open} onClick={toggle} />}>
          {() => (
            <div className="cd-rb-hfmenu">
              <label>
                <span>{t("altText")}</span>
                <textarea className="cd-input cd-rb-textarea cd-rb-textarea--short" value={b.alt || ""} onChange={(e) => onSelected({ alt: e.target.value })} />
              </label>
              <span className="cd-rb-hint">{t("altHint")}</span>
            </div>
          )}
        </Drop>
        <Drop width={300} trigger={(open, toggle) => <Big icon={["M4 18h16", "M4 14h10", "M5 4h14v7H5z"]} label={t("caption")} menu on={open} onClick={toggle} />}>
          {() => (
            <div className="cd-rb-hfmenu">
              <label>
                <span>{t("caption")}</span>
                <input type="text" className="cd-input" value={typeof b.caption === "string" ? b.caption : ""} onChange={(e) => onSelected({ caption: e.target.value })} />
              </label>
            </div>
          )}
        </Drop>
      </Group>
      )}
      <Group label={t("chartEdit")}>
        <Col>
          <Small wide icon={ICONS.copy} label={t("duplicate")} onClick={onDuplicate} />
          <Small wide icon={ICONS.trash} label={t("delete")} onClick={onRemove} />
        </Col>
      </Group>
    </>
  );
}
