import React from "react";
import type { RbBlock, RbDesign } from "../types";
import { FontOptions, ICONS } from "../ui";
import { Col, Group, NumCombo, Small } from "../kit/controls";
import type { Opts } from "./ChartDesignTab";

// The Format tab of a selected chart, as Word's: the chart's text (font, colour, sizes), its axes' labels, its lines,
// points and bars, and its background.

export function ChartFormatTab({ b, fonts, design, t, onSelected }: { b: RbBlock; fonts: string[]; design: RbDesign; t: (k: string) => string; onSelected: (patch: Partial<RbBlock>) => void }) {
  const o: Opts = (b.options as Opts) || {};
  const setOpt = (patch: Opts) => {
    const next = { ...o, ...patch };
    Object.keys(next).forEach((k) => (next[k] === undefined || next[k] === null || next[k] === "" ? delete next[k] : null));
    onSelected({ options: Object.keys(next).length ? next : undefined });
  };
  const num = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : undefined);
  // a multiplier shown as a percent (1.25 = 125 %)
  const pct = (k: string) => (num(k) === undefined ? undefined : Math.round((num(k) as number) * 1000) / 10);
  const setPct = (k: string) => (v: number | undefined) => setOpt({ [k]: v === undefined ? undefined : Math.round(v * 10) / 1000 });
  const asDrawn = t("asDrawn");
  const pcts = (values: number[]): [number | undefined, string][] => [[undefined, asDrawn], ...values.map((v) => [v, v + " %"] as [number, string])];
  const degrees: [number | undefined, string][] = [[undefined, asDrawn], ...[0, 30, 45, 60, 90].map((v) => [v, v + "°"] as [number, string])];
  return (
    <>
      <Group label={t("chartText")}>
        <Col>
          <label className="cd-rb-inline">
            <span>{t("font")}</span>
            <select className="cd-input cd-rb-rselect" value={(o.font_family as string) || ""} onChange={(e) => setOpt({ font_family: e.target.value })}>
              <option value="">
                {t("themeFont")} ({design.body_font})
              </option>
              <FontOptions fonts={fonts} serifLabel={t("serifFonts")} sansLabel={t("sansFonts")} />
            </select>
          </label>
          <label className="cd-rb-inline">
            <span>{t("textColour")}</span>
            <input type="color" className="cd-rb-colorinput" value={(o.text_color as string) || design.text_color} onChange={(e) => setOpt({ text_color: e.target.value })} />
            {o.text_color ? (
              <button type="button" className="cd-rb-link" onClick={() => setOpt({ text_color: undefined })}>
                {asDrawn}
              </button>
            ) : null}
          </label>
        </Col>
        <Col>
          <NumCombo icon={ICONS.fontGrow} label={t("textSize")} unit="%" value={pct("text_scale")} placeholder="100" min={30} max={400} step={5} neutral={100} presets={pcts([80, 90, 110, 125, 150, 200])} onChange={setPct("text_scale")} />
          <NumCombo icon={["M4 7h16", "M9 7v12", "M15 7v12"]} label={t("dataLabelSize")} unit="pt" value={num("label_size")} placeholder="-" min={3} max={48} step={0.5} neutral={8} presets={[[undefined, asDrawn], ...[6, 7, 8, 9, 10, 12].map((v) => [v, v + " pt"] as [number, string])]} onChange={(v) => setOpt({ label_size: v })} />
        </Col>
      </Group>
      <Group label={t("axes")}>
        <Col>
          <NumCombo icon={["M4 20h16", "M4 20L16 8"]} label={t("angleX")} unit="°" value={num("x_text_angle")} placeholder="0" min={-90} max={90} step={5} neutral={0} presets={degrees} onChange={(v) => setOpt({ x_text_angle: v })} />
          <NumCombo icon={["M4 4v16", "M4 20L16 8"]} label={t("angleY")} unit="°" value={num("y_text_angle")} placeholder="0" min={-90} max={90} step={5} neutral={0} presets={degrees} onChange={(v) => setOpt({ y_text_angle: v })} />
        </Col>
      </Group>
      <Group label={t("linesPoints")}>
        <Col>
          <NumCombo icon={["M4 8h16", "M4 13h16", "M4 18h16"]} label={t("lineWidth")} unit="%" value={pct("line_scale")} placeholder="100" min={10} max={800} step={10} neutral={100} presets={pcts([50, 75, 150, 200, 300])} onChange={setPct("line_scale")} />
          <NumCombo icon={["M7 12h.01", "M12 12a2 2 0 1 0 0 .01", "M18 12a3 3 0 1 0 0 .01"]} label={t("pointSize")} unit="%" value={pct("point_scale")} placeholder="100" min={10} max={800} step={10} neutral={100} presets={pcts([50, 75, 150, 200, 300])} onChange={setPct("point_scale")} />
        </Col>
        <Col>
          <NumCombo
            icon={["M5 20V10h4v10", "M11 20V4h4v16", "M17 20v-7h3v7"]}
            label={t("barWidth")}
            unit="%"
            value={num("bar_width") === undefined ? undefined : Math.round((num("bar_width") as number) * 100)}
            placeholder="90"
            min={5}
            max={100}
            step={5}
            neutral={90}
            presets={[[undefined, asDrawn], ...[30, 50, 70, 90, 100].map((v) => [v, v + " %"] as [number, string])]}
            onChange={(v) => setOpt({ bar_width: v === undefined ? undefined : v / 100 })}
          />
        </Col>
      </Group>
      <Group label={t("backgroundGroup")}>
        <Col>
          <label className="cd-rb-inline">
            <span>{t("chartBackground")}</span>
            <input type="color" className="cd-rb-colorinput" value={(o.background_color as string) || "#ffffff"} onChange={(e) => setOpt({ background_color: e.target.value })} />
            {o.background_color ? (
              <button type="button" className="cd-rb-link" onClick={() => setOpt({ background_color: undefined })}>
                {asDrawn}
              </button>
            ) : null}
          </label>
          <Small wide icon={["M4 4h16v16H4z"]} label={t("panelBorder")} on={o.panel_border !== false} onClick={() => setOpt({ panel_border: o.panel_border === false ? undefined : false })} />
        </Col>
      </Group>
    </>
  );
}
