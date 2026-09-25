import React from "react";
import { tr } from "../../../lang";
import type { CustomizeEntries } from "../../ChartCustomizeFields";
import type { RbBlock, RbDesign, RbFacets, RbKind, RbTheme } from "../types";
import { ICONS } from "../ui";
import { Big, Col, Drop, Group, Item, keep, NumCombo, Small } from "../kit/controls";

// The Chart Design tab (Table Design for a table), shown while a chart or table is selected on the page, as Word's:
// the chart's data (indicator, level, region, year, what it shows), its panels, its width, its legend, title and
// gridlines, its style and colours, and Customize.

/** A chart's options (block.options): what was changed from the chart as R draws it. */
export type Opts = Record<string, unknown>;
/** The chart styles of the Chart Styles gallery: a ggplot2 theme each (the first, the chart as drawn). */
export const THEME_PRESETS: [string, string][] = [
  ["", "presetAsDrawn"],
  ["minimal", "presetMinimal"],
  ["classic", "presetClassic"],
  ["bw", "presetBw"],
  ["light", "presetLight"],
  ["linedraw", "presetLinedraw"]
];

export function ChartDesignTab({ b, kind, regions, years, reportRegion, entries, facets, deck, design, themes, t, lang, onSelected, onCustomize, onDuplicate, onRemove }: {
  b: RbBlock;
  kind?: RbKind;
  regions: string[];
  years: number[];
  reportRegion?: string;
  entries?: CustomizeEntries;
  facets?: RbFacets | null;
  deck?: boolean;
  design: RbDesign;
  themes: RbTheme[];
  t: (k: string) => string;
  lang: string;
  onSelected: (patch: Partial<RbBlock>) => void;
  onCustomize: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const o: Opts = (b.options as Opts) || {};
  const setOpt = (patch: Opts) => {
    const next = { ...o, ...patch };
    Object.keys(next).forEach((k) => (next[k] === undefined || next[k] === null || next[k] === "" ? delete next[k] : null));
    onSelected({ options: Object.keys(next).length ? next : undefined });
  };
  const legend = (o.legend_position as string) || "";
  const grid = (o.grid as string) || "";
  const preset = (o.theme_preset as string) || "";
  const legendKeys = (entries?.legend || []).map((e) => e.key);
  const colourWith = (palette: string[]) => {
    if (!legendKeys.length) return;
    const colors: Record<string, string> = {};
    legendKeys.forEach((k, i) => (colors[k] = palette[i % palette.length]));
    setOpt({ colors });
  };
  const isTable = b.type === "table";
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : undefined);
  return (
    <>
      <Group label={t("chartData")}>
        <div className="cd-rb-datafields">
          {kind?.indicators && kind.indicators.length > 0 && (
            <label className="cd-rb-inline">
              <span>{t("indicator")}</span>
              <select className="cd-input cd-rb-rselect" value={b.indicator || ""} onChange={(e) => onSelected({ indicator: e.target.value })}>
                {kind.indicators.map((x) => (
                  <option key={x.value} value={x.value}>
                    {tr(x.label, lang)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind?.levels && kind.levels.length > 1 && (
            <label className="cd-rb-inline">
              <span>{t("level")}</span>
              <select className="cd-input cd-rb-rselect" value={b.admin_level || kind.levels[0].value} onChange={(e) => onSelected({ admin_level: e.target.value, region: e.target.value === "national" ? undefined : b.region || "@report" })}>
                {kind.levels.map((x) => (
                  <option key={x.value} value={x.value}>
                    {tr(x.label, lang)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind && ((kind.kind === "coverage" && b.admin_level && b.admin_level !== "national") || kind.regional) && (
            <label className="cd-rb-inline">
              <span>{t("region")}</span>
              <select className="cd-input cd-rb-rselect" value={b.region || (kind.kind === "coverage" ? "@report" : "")} onChange={(e) => onSelected({ region: e.target.value || undefined })}>
                {(kind.kind === "overall_score" || kind.kind === "reporting_rate") && <option value="">{t("level_national")}</option>}
                <option value="@report">
                  {t("regionOfReport")} ({reportRegion || t("level_national")})
                </option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind?.year && (
            <label className="cd-rb-inline">
              <span>{t("year")}</span>
              <select className="cd-input cd-rb-rselect" value={b.year ? String(b.year) : ""} onChange={(e) => onSelected({ year: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">{kind.kind === "map" ? t("yearsFirstLast") : String(years[years.length - 1] || "")}</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind?.variants && kind.variants.length > 0 && (
            <label className="cd-rb-inline">
              <span>{t("show")}</span>
              <select className="cd-input cd-rb-rselect" value={b.variant || kind.variants[0].value} onChange={(e) => onSelected({ variant: e.target.value })}>
                {kind.variants.map((x) => (
                  <option key={x.value} value={x.value}>
                    {tr(x.label, lang)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </Group>
      {!isTable && facets && (
        // a chart drawn as panels: how many across and down, whether they share their axes, where their names are
        <Group label={t("panels")} icon={["M3 4h8v7H3z", "M13 4h8v7h-8z", "M3 13h8v7H3z", "M13 13h8v7h-8z"]}>
          <Col>
            <NumCombo
              icon={["M4 5h4v14H4z", "M10 5h4v14h-4z", "M16 5h4v14h-4z"]}
              label={t("panelColumns")}
              value={typeof o.facet_ncol === "number" ? (o.facet_ncol as number) : undefined}
              placeholder={num(facets.ncol) !== undefined ? String(facets.ncol) : ""}
              neutral={num(facets.ncol) ?? 1}
              min={1}
              max={20}
              step={1}
              presets={[1, 2, 3, 4, 5, 6].map((v) => [v, String(v)] as [number, string])}
              onChange={(v) => setOpt({ facet_ncol: v, facet_nrow: v !== undefined ? undefined : o.facet_nrow })}
            />
            {facets.type === "wrap" && (
              <NumCombo
                icon={["M5 4h14v4H5z", "M5 10h14v4H5z", "M5 16h14v4H5z"]}
                label={t("panelRows")}
                value={typeof o.facet_nrow === "number" ? (o.facet_nrow as number) : undefined}
                placeholder={num(facets.nrow) !== undefined ? String(facets.nrow) : ""}
                neutral={num(facets.nrow) ?? 1}
                min={1}
                max={20}
                step={1}
                presets={[1, 2, 3, 4, 5, 6].map((v) => [v, String(v)] as [number, string])}
                onChange={(v) => setOpt({ facet_nrow: v, facet_ncol: v !== undefined ? undefined : o.facet_ncol })}
              />
            )}
          </Col>
          <Drop width={230} trigger={(open, toggle) => <Big icon={["M4 4v16h16", "M8 16l3-5 3 3 4-7"]} label={t("panelAxes")} menu on={open || !!o.facet_scales} onClick={toggle} />}>
            {(close) => (
              <>
                {([
                  ["", t("asDrawn")],
                  ["fixed", t("panelScalesFixed")],
                  ["free_y", t("panelScalesFreeY")],
                  ["free_x", t("panelScalesFreeX")],
                  ["free", t("panelScalesFree")]
                ] as [string, string][]).map(([k, label]) => (
                  <Item
                    key={k || "drawn"}
                    label={label}
                    hint={!k && facets.scales ? facets.scales.replace("_", " ") : undefined}
                    on={((o.facet_scales as string) || "") === k}
                    onClick={() => {
                      setOpt({ facet_scales: k });
                      close();
                    }}
                  />
                ))}
              </>
            )}
          </Drop>
          <Drop width={200} trigger={(open, toggle) => <Big icon={["M4 4h16v4H4z", "M4 10h16v10H4z"]} label={t("panelLabels")} menu on={open || !!o.strip_position} onClick={toggle} />}>
            {(close) => (
              <>
                {([
                  ["", t("asDrawn")],
                  ["top", t("legendTop")],
                  ["bottom", t("legendBottom")],
                  ["left", t("legendLeft")],
                  ["right", t("legendRight")]
                ] as [string, string][]).map(([k, label]) => (
                  <Item
                    key={k || "drawn"}
                    label={label}
                    on={((o.strip_position as string) || "") === k}
                    onClick={() => {
                      setOpt({ strip_position: k });
                      close();
                    }}
                  />
                ))}
              </>
            )}
          </Drop>
        </Group>
      )}
      {!isTable && !deck && (
        <Group label={t("chartLayouts")}>
          {([
            ["full", t("fullWidth"), ["M3 5h18v14H3z"]],
            ["half", t("half"), ["M3 5h8v14H3z", "M13 5h8v14h-8z"]],
            ["third", t("third"), ["M2 5h5.5v14H2z", "M9.25 5h5.5v14h-5.5z", "M16.5 5H22v14h-5.5z"]]
          ] as [RbBlock["size"], string, string[]][]).map(([k, label, icon]) => (
            <Big key={k} icon={icon} label={label} on={(b.size || "full") === k} onClick={() => onSelected({ size: k })} />
          ))}
        </Group>
      )}
      {!isTable && (
        <Group label={t("quickLayout")}>
          {/* Excel's Chart Elements: each element shown or hidden with one click (hidden leaves no space for it) */}
          <Drop width={240} trigger={(open, toggle) => <Big icon={["M12 5v14", "M5 12h14"]} label={t("chartElements")} menu on={open} tone="green" onClick={toggle} />}>
            {() => (
              <div className="cd-rb-elements">
                {([
                  ["show_title", "elTitle"],
                  ["show_subtitle", "elSubtitle"],
                  ["show_caption", "elCaption"],
                  ["show_x_title", "elXTitle"],
                  ["show_x_text", "elXText"],
                  ["show_y_title", "elYTitle"],
                  ["show_y_text", "elYText"],
                  ["show_legend", "elLegend"],
                  ["show_legend_title", "elLegendTitle"],
                  ["show_labels", "elLabels"],
                  ["show_strips", "elStrips"]
                ] as [string, string][]).map(([key, label]) => (
                  <label key={key} className="cd-rb-elements__row">
                    <input type="checkbox" checked={o[key] !== false} onChange={(e) => setOpt({ [key]: e.target.checked ? undefined : false })} />
                    <span>{t(label)}</span>
                  </label>
                ))}
              </div>
            )}
          </Drop>
          <Drop width={200} trigger={(open, toggle) => <Big icon={["M4 4h16v16H4z", "M4 16h16", "M7 18.5h3M13 18.5h3"]} label={t("legend")} menu on={open} onClick={toggle} />}>
            {(close) => (
              <>
                {[["", t("asDrawn")], ["top", t("legendTop")], ["bottom", t("legendBottom")], ["right", t("legendRight")], ["left", t("legendLeft")], ["none", t("legendNone")]].map(([k, label]) => (
                  <Item
                    key={k}
                    label={label}
                    on={legend === k}
                    onClick={() => {
                      setOpt({ legend_position: k });
                      close();
                    }}
                  />
                ))}
              </>
            )}
          </Drop>
          <Drop width={280} trigger={(open, toggle) => <Big icon={["M4 5h16", "M8 5v3", "M16 5v3", "M4 11h16v9H4z"]} label={t("chartTitle")} menu on={open} onClick={toggle} />}>
            {(close) => (
              <div className="cd-rb-hfmenu">
                <label>
                  <span>{t("chartTitle")}</span>
                  <input type="text" className="cd-input" value={b.title || ""} placeholder={t("titleAuto")} onChange={(e) => onSelected({ title: e.target.value })} />
                </label>
                <Item
                  label={o.show_title === false ? t("showTitle") : t("hideTitle")}
                  onClick={() => {
                    setOpt({ show_title: o.show_title === false ? undefined : false });
                    close();
                  }}
                />
              </div>
            )}
          </Drop>
          <Drop width={200} trigger={(open, toggle) => <Big icon={["M4 4h16v16H4z", "M4 10h16", "M4 15h16", "M10 4v16"]} label={t("gridlines")} menu on={open} onClick={toggle} />}>
            {(close) => (
              <>
                {[["", t("asDrawn")], ["both", t("gridBoth")], ["horizontal", t("gridHorizontal")], ["vertical", t("gridVertical")], ["none", t("gridNone")]].map(([k, label]) => (
                  <Item
                    key={k}
                    label={label}
                    on={grid === k}
                    onClick={() => {
                      setOpt({ grid: k });
                      close();
                    }}
                  />
                ))}
              </>
            )}
          </Drop>
          <Col>
            <Small wide icon={["M4 18h16", "M4 14h10"]} label={t("showCaption")} on={b.caption !== false} onClick={() => onSelected({ caption: b.caption === false })} />
          </Col>
        </Group>
      )}
      {!isTable && (
        <Group label={t("chartStyles")}>
          <div className="cd-rb-chartstyles">
            {THEME_PRESETS.map(([k, label]) => (
              <button key={k || "none"} type="button" aria-pressed={preset === k} className={preset === k ? "cd-rb-chartcard cd-rb-chartcard--on cd-rb-chartcard--" + (k || "drawn") : "cd-rb-chartcard cd-rb-chartcard--" + (k || "drawn")} title={t(label)} onMouseDown={keep} onClick={() => setOpt({ theme_preset: k })}>
                <i />
                <span>{t(label)}</span>
              </button>
            ))}
          </div>
          <Drop width={250} trigger={(open, toggle) => <Big icon={ICONS.colors} label={t("changeColours")} menu on={open} onClick={toggle} disabled={!legendKeys.length} />}>
            {(close) => (
              <>
                <button
                  type="button"
                  className="cd-rb-mitem"
                  onMouseDown={keep}
                  onClick={() => {
                    setOpt({ colors: undefined });
                    close();
                  }}
                >
                  <span className="cd-rb-colourset">
                    {design.palette.slice(0, 6).map((c, i) => (
                      <i key={i} style={{ background: c }} />
                    ))}
                  </span>
                  <span>{t("themePalette")}</span>
                </button>
                {themes.map((th) => (
                  <button
                    key={th.theme}
                    type="button"
                    className="cd-rb-mitem"
                    onMouseDown={keep}
                    onClick={() => {
                      colourWith(th.palette);
                      close();
                    }}
                  >
                    <span className="cd-rb-colourset">
                      {th.palette.slice(0, 6).map((c, i) => (
                        <i key={i} style={{ background: c }} />
                      ))}
                    </span>
                    <span>{tr(th.name, lang)}</span>
                  </button>
                ))}
              </>
            )}
          </Drop>
        </Group>
      )}
      <Group label={t("chartEdit")}>
        {!isTable && <Big icon={["M4 7h9", "M17 7h3", "M4 17h3", "M11 17h9", "M15 5v4", "M9 15v4"]} label={t("customize")} onClick={onCustomize} tone="blue" />}
        <Col>
          {!isTable && <Small wide icon={ICONS.undo} label={t("resetChart")} disabled={!Object.keys(o).length} onClick={() => onSelected({ options: undefined })} />}
          <Small wide icon={ICONS.copy} label={t("duplicate")} onClick={onDuplicate} />
          <Small wide icon={ICONS.trash} label={t("delete")} onClick={onRemove} />
        </Col>
      </Group>
    </>
  );
}
