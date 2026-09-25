import React, { useRef, useState } from "react";
import { tr, useLang } from "../../lang";
import type { LocalText } from "../../lang";
import { ChartElements } from "../ChartElements";
import { FieldControl } from "../ChartCustomizeFields";
import type { CustomizeField, CustomizeValues } from "../ChartCustomizeFields";
import type { RbBlock, RbChartSchema, RbCover, RbDesign, RbPreview, RbTheme, Texts } from "./types";
import { cssFont } from "./layout";
import { FontOptions, Icon, ICONS, Seg, Toggle } from "./ui";

// The report builder's panes: the chart Customize pop-up, and the theme and cover page task panes (opened from the
// ribbon); the pictures chosen for images, logos and the cover.

type T = (k: string) => string;

function useT(texts: Texts): T {
  const lang = useLang();
  return (k: string) => tr(texts[k] as LocalText, lang) || k;
}

export function readImage(file: File, maxSide = 4000): Promise<{ src: string; ratio: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("not a picture"));
      img.onload = () => {
        const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale >= 1 && (reader.result as string).length < 900000) {
          resolve({ src: reader.result as string, ratio });
          return;
        }
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        const ctx = c.getContext("2d");
        if (!ctx) return resolve({ src: reader.result as string, ratio });
        const png = /png|gif|svg/.test(file.type);
        if (!png) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, c.width, c.height);
        }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve({ src: png ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.86), ratio });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ImagePicker({ label, className, onPick, children }: { label: string; className?: string; onPick: (img: { src: string; ratio: number }) => void; children?: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className || "cd-rb-btn"} onMouseDown={(e) => e.preventDefault()} onClick={() => input.current?.click()}>
        {children || label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/svg+xml"
        aria-label={label}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = "";
          if (f) readImage(f).then(onPick).catch(() => undefined);
        }}
      />
    </>
  );
}

// ---- charts and tables ---------------------------------------------------------------------------------------------

const isSet = (v: unknown) => !(v === undefined || v === null || v === "" || (Array.isArray(v) && !v.some((x) => x !== null && x !== undefined && x !== "")) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0));

/** How the selected chart looks: every option of the app's Customize panel (cd_chart_schema()), for this chart in this
 *  report only (the block's `options`). Shown as a pop-up next to the chart (ChartStylePop in ReportEditor.tsx). */
export function ChartStyle({ block: b, preview, schema, texts, onUpdate, onClose }: {
  block: RbBlock;
  preview?: RbPreview;
  schema: RbChartSchema;
  texts: Texts;
  onUpdate: (patch: Partial<RbBlock>) => void;
  onClose: () => void;
}) {
  const lang = useLang();
  const t = useT(texts);
  const ct = (k: string) => tr(schema.texts[k], lang) || k;
  const [query, setQuery] = useState("");
  const bag: CustomizeValues = (b.options as CustomizeValues) || {};
  const put = (k: string, v: unknown) => {
    const next = { ...bag };
    if (!isSet(v)) delete next[k];
    else next[k] = v;
    onUpdate({ options: Object.keys(next).length ? next : undefined });
  };
  const ENTRY_KEYS = ["legend_labels", "colors", "category_labels"];
  const keysOf = (f: CustomizeField) => (f.type === "entries" ? ENTRY_KEYS : [f.key]);
  const changed = (f: CustomizeField) => keysOf(f).some((k) => isSet(bag[k]));
  const entries = preview?.entries;
  const fields = schema.fields.filter((f) => f.type !== "entries" || (entries?.legend?.length || entries?.categories?.length));
  const q = query.trim().toLowerCase();
  const list = q
    ? fields.filter((f) => q.split(/\s+/).every((w) => [tr(f.label, lang), tr(f.group, lang), f.keywords || ""].join(" ").toLowerCase().includes(w)))
    : [];
  const nChanged = fields.filter(changed).length;
  const fieldTexts = {
    asDrawn: schema.texts.asDrawn, yes: schema.texts.yes, no: schema.texts.no, min: schema.texts.min, max: schema.texts.max,
    entriesLegend: schema.texts.entriesLegend, entriesCategories: schema.texts.entriesCategories,
    entryText: schema.texts.entryText, entryColor: schema.texts.entryColor
  };

  const fieldRow = (f: CustomizeField) => (
      <div key={f.key} className="cd-cc__field">
        <div className="cd-cc__label">
          <span>{tr(f.label, lang)}</span>
          {changed(f) && <span className="cd-cc__dot" />}
          <span className="cd-cc__grow" />
          {changed(f) && (
            <button type="button" className="cd-cc__link" onClick={() => keysOf(f).forEach((k) => put(k, undefined))}>
              {ct("reset")}
            </button>
          )}
        </div>
        <FieldControl field={f} bag={bag} shown={(k) => bag[k]} own={(k) => isSet(bag[k])} put={put} entries={entries} texts={fieldTexts} />
      </div>
  );
  const rows = list.map(fieldRow);

  return (
    <div className="cd-cc">
      <div className="cd-cc__head cd-rb-pophead">
        <div className="cd-cc__title">{t("customize")}</div>
        <button type="button" className="cd-rb-icon" aria-label={t("close")} title={t("close")} onClick={onClose}>
          <Icon d={ICONS.close} size={16} />
        </button>
      </div>
      <div className="cd-cc__banner">{t("chartOnlyThis")}</div>
      <label className="cd-cc__search">
        <Icon d={ICONS.search} size={16} />
        <input type="search" value={query} placeholder={ct("search")} aria-label={ct("search")} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="cd-cc__list">
        {!q ? (
          <ChartElements tabs={schema.tabs} fields={fields} bag={bag} put={put} changed={changed} renderField={fieldRow} lang={lang} texts={{ show: schema.texts.show, hidden: schema.texts.hidden, changed: schema.texts.changed }} />
        ) : rows.length ? (
          rows
        ) : (
          <div className="cd-cc__empty">{ct("noResults")}</div>
        )}
      </div>
      <div className="cd-cc__foot">
        <div className="cd-cc__count">
          <b>{nChanged}</b> {ct("changed")}
        </div>
        <button type="button" className="cd-cc__btn" disabled={!nChanged} onClick={() => onUpdate({ options: undefined })}>
          {t("resetChart")}
        </button>
      </div>
    </div>
  );
}

/** How many chart options a block changes (the badge on its Customize button). */
export const changedOptions = (b: RbBlock) => Object.keys(b.options || {}).filter((k) => isSet((b.options as Record<string, unknown>)[k])).length;

// ---- theme ---------------------------------------------------------------------------------------------------------

function Colour({ label, value, onPick }: { label: string; value: string; onPick: (v: string) => void }) {
  return (
    <label className="cd-rb-colour">
      <input type="color" value={value} aria-label={label} onChange={(e) => onPick(e.target.value)} />
      <span>{label}</span>
      <code>{value}</code>
    </label>
  );
}

function Stepper({ label, value, onPick, sample }: { label: string; value: number; onPick: (v: number) => void; sample: React.CSSProperties }) {
  return (
    <div className="cd-rb-stepper">
      <span className="cd-rb-stepper__label" style={sample}>
        {label}
      </span>
      <button type="button" aria-label={label + " -"} onClick={() => onPick(Math.max(6, Math.round((value - 0.5) * 2) / 2))}>
        -
      </button>
      <span className="cd-rb-stepper__value">{value} pt</span>
      <button type="button" aria-label={label + " +"} onClick={() => onPick(Math.min(60, Math.round((value + 0.5) * 2) / 2))}>
        +
      </button>
    </div>
  );
}

export function ThemeGallery({ themes, design, onPick }: { themes: RbTheme[]; design: RbDesign; onPick: (th: RbTheme) => void }) {
  const lang = useLang();
  return (
    <div className="cd-rb-themes">
      {themes.map((th) => (
        <button key={th.theme} type="button" aria-pressed={design.theme === th.theme} className={design.theme === th.theme ? "cd-rb-themecard cd-rb-themecard--on" : "cd-rb-themecard"} onClick={() => onPick(th)}>
          <span className="cd-rb-themecard__page">
            <span style={{ fontFamily: cssFont(th.heading_font), color: th.heading_color, borderColor: th.accent }}>Aa</span>
            <span className="cd-rb-themecard__bars">
              {th.palette.slice(0, 4).map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
          </span>
          <b>{tr(th.name, lang)}</b>
          <span>
            {th.heading_font} · {th.body_font}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ThemePanel({ design, themes, fonts, texts, onDesign, onClose }: { design: RbDesign; themes: RbTheme[]; fonts: string[]; texts: Texts; onDesign: (patch: Partial<RbDesign>) => void; onClose: () => void }) {
  const t = useT(texts);
  const font = (key: "heading_font" | "body_font", label: string) => (
    <label className="cd-rb-field">
      <span>{label}</span>
      <select className="cd-input" value={design[key]} style={{ fontFamily: cssFont(design[key]) }} onChange={(e) => onDesign({ [key]: e.target.value } as Partial<RbDesign>)}>
        {!fonts.includes(design[key]) && <option value={design[key]}>{design[key]}</option>}
        <FontOptions fonts={fonts} serifLabel={t("serifFonts")} sansLabel={t("sansFonts")} />
      </select>
    </label>
  );
  const pick = (th: RbTheme) => {
    const { name: _n, ...rest } = th;
    // a theme sets the look; the page (size, margins, header...) stays as it is
    onDesign({
      theme: rest.theme, accent: rest.accent, heading_color: rest.heading_color, text_color: rest.text_color, muted_color: rest.muted_color,
      note_fill: rest.note_fill, note_border: rest.note_border, heading_font: rest.heading_font, body_font: rest.body_font,
      title_size: rest.title_size, h1_size: rest.h1_size, h2_size: rest.h2_size, body_size: rest.body_size, note_size: rest.note_size,
      caption_size: rest.caption_size, palette: rest.palette, apply_palette: rest.apply_palette
    });
  };
  return (
    <div className="cd-rb-settings">
      <div className="cd-rb-panelhead">
        <b>{t("theme")}</b>
        <button type="button" className="cd-rb-icon" aria-label={t("close")} onClick={onClose}>
          <Icon d={ICONS.close} size={16} />
        </button>
      </div>
      <div className="cd-rb-form">
        <ThemeGallery themes={themes} design={design} onPick={pick} />
        <div className="cd-rb-sub">{t("fontsTitle")}</div>
        {font("heading_font", t("headingFontLabel"))}
        {font("body_font", t("bodyFont"))}
        <div className="cd-rb-sub">{t("colours")}</div>
        <Colour label={t("accentColour")} value={design.accent} onPick={(v) => onDesign({ accent: v })} />
        <Colour label={t("headingColour")} value={design.heading_color} onPick={(v) => onDesign({ heading_color: v })} />
        <Colour label={t("textColour")} value={design.text_color} onPick={(v) => onDesign({ text_color: v })} />
        <Colour label={t("mutedColour")} value={design.muted_color} onPick={(v) => onDesign({ muted_color: v })} />
        <Colour label={t("noteFill")} value={design.note_fill} onPick={(v) => onDesign({ note_fill: v })} />
        <Colour label={t("noteBorder")} value={design.note_border} onPick={(v) => onDesign({ note_border: v })} />
        <div className="cd-rb-sub">{t("palette")}</div>
        <div className="cd-rb-palette">
          {design.palette.map((c, i) => (
            <input
              key={i}
              type="color"
              value={c}
              aria-label={`${t("palette")} ${i + 1}`}
              onChange={(e) => {
                const next = design.palette.slice();
                next[i] = e.target.value;
                onDesign({ palette: next });
              }}
            />
          ))}
        </div>
        <Toggle label={t("applyPalette")} on={design.apply_palette} onFlip={() => onDesign({ apply_palette: !design.apply_palette })} />
        <div className="cd-rb-hint">{t("chartPaletteHint")}</div>
        <div className="cd-rb-sub">{t("textStyles")}</div>
        <Stepper label={t("sizeTitle")} value={design.title_size} sample={{ fontFamily: cssFont(design.heading_font), fontWeight: 700 }} onPick={(v) => onDesign({ title_size: v })} />
        <Stepper label={t("sizeH1")} value={design.h1_size} sample={{ fontFamily: cssFont(design.heading_font), fontWeight: 700, color: design.heading_color }} onPick={(v) => onDesign({ h1_size: v })} />
        <Stepper label={t("sizeH2")} value={design.h2_size} sample={{ fontFamily: cssFont(design.heading_font), fontWeight: 700 }} onPick={(v) => onDesign({ h2_size: v })} />
        <Stepper label={t("sizeBody")} value={design.body_size} sample={{ fontFamily: cssFont(design.body_font) }} onPick={(v) => onDesign({ body_size: v })} />
        <Stepper label={t("sizeNote")} value={design.note_size} sample={{ fontFamily: cssFont(design.body_font), background: design.note_fill }} onPick={(v) => onDesign({ note_size: v })} />
        <Stepper label={t("sizeCaption")} value={design.caption_size} sample={{ fontFamily: cssFont(design.body_font), fontStyle: "italic", color: design.muted_color }} onPick={(v) => onDesign({ caption_size: v })} />
        <div className="cd-rb-info">{t("themeHint")}</div>
      </div>
    </div>
  );
}

// ---- cover ---------------------------------------------------------------------------------------------------------

export function CoverPanel({ cover, flag, texts, onCover, onClose }: { cover: RbCover; flag?: string | null; texts: Texts; onCover: (patch: Partial<RbCover>) => void; onClose: () => void }) {
  const t = useT(texts);
  const layouts: [RbCover["layout"], string][] = [
    ["band", t("layoutBand")],
    ["full", t("layoutFull")],
    ["photo", t("layoutPhoto")],
    ["minimal", t("layoutMinimal")]
  ];
  const setEditor = (i: number, patch: Partial<{ name: string; role: string }>) => onCover({ editors: cover.editors.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  return (
    <div className="cd-rb-settings">
      <div className="cd-rb-panelhead">
        <b>{t("cover")}</b>
        <button type="button" className="cd-rb-icon" aria-label={t("close")} onClick={onClose}>
          <Icon d={ICONS.close} size={16} />
        </button>
      </div>
      <div className="cd-rb-form">
        <div className="cd-rb-sub">{t("coverLayout")}</div>
        <div className="cd-rb-layouts">
          {layouts.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={cover.layout === k} className={cover.layout === k ? "cd-rb-layout cd-rb-layout--on" : "cd-rb-layout"} onClick={() => onCover({ layout: k })}>
              <span className={"cd-rb-layout__thumb cd-rb-layout__thumb--" + k}>
                <i />
                <b />
              </span>
              {label}
            </button>
          ))}
        </div>
        <label className="cd-rb-field">
          <span>{t("kicker")}</span>
          <input type="text" className="cd-input" value={cover.kicker} onChange={(e) => onCover({ kicker: e.target.value })} />
        </label>
        <label className="cd-rb-field">
          <span>{t("coverTitle")}</span>
          <input type="text" className="cd-input" value={cover.title} placeholder={t("coverTitleHint")} onChange={(e) => onCover({ title: e.target.value })} />
        </label>
        <label className="cd-rb-field">
          <span>{t("subtitle")}</span>
          <input type="text" className="cd-input" value={cover.subtitle} onChange={(e) => onCover({ subtitle: e.target.value })} />
        </label>
        <Toggle label={t("showFlag")} on={cover.show_flag} onFlip={() => onCover({ show_flag: !cover.show_flag })} />
        {cover.show_flag && !flag && <div className="cd-rb-hint">{t("flagMissing")}</div>}
        <div className="cd-rb-sub">{t("logos")}</div>
        <div className="cd-rb-logos">
          {cover.logos.map((l, i) => (
            <span key={i} className="cd-rb-logo">
              <img src={l.src} alt={l.name || ""} />
              <button type="button" aria-label={t("remove")} title={t("remove")} onClick={() => onCover({ logos: cover.logos.filter((_x, k) => k !== i) })}>
                <Icon d={ICONS.close} size={12} />
              </button>
            </span>
          ))}
          <ImagePicker label={t("addLogo")} className="cd-rb-btn cd-rb-btn--small" onPick={(img) => onCover({ logos: cover.logos.concat([{ src: img.src }]) })}>
            <Icon d={ICONS.plus} size={14} />
            {t("addLogo")}
          </ImagePicker>
        </div>
        {cover.layout === "photo" && (
          <>
            <div className="cd-rb-sub">{t("photo")}</div>
            {cover.photo && <img className="cd-rb-thumbimg" src={cover.photo} alt="" />}
            <ImagePicker label={t("choosePhoto")} onPick={(img) => onCover({ photo: img.src })} />
          </>
        )}
        <div className="cd-rb-sub">{t("editors")}</div>
        {cover.editors.map((e, i) => (
          <div key={i} className="cd-rb-editor">
            <input type="text" className="cd-input" value={e.name} placeholder={t("editorName")} aria-label={t("editorName")} onChange={(ev) => setEditor(i, { name: ev.target.value })} />
            <input type="text" className="cd-input" value={e.role || ""} placeholder={t("editorRole")} aria-label={t("editorRole")} onChange={(ev) => setEditor(i, { role: ev.target.value })} />
            <button type="button" className="cd-rb-icon" aria-label={t("remove")} title={t("remove")} onClick={() => onCover({ editors: cover.editors.filter((_x, k) => k !== i) })}>
              <Icon d={ICONS.trash} size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="cd-rb-btn cd-rb-btn--small" onClick={() => onCover({ editors: cover.editors.concat([{ name: "", role: "" }]) })}>
          <Icon d={ICONS.plus} size={14} />
          {t("addEditor")}
        </button>
        <div className="cd-rb-field">
          <span>{t("date")}</span>
          <Seg label={t("date")} value={cover.date_mode} options={[{ value: "month", label: t("dateMonth") }, { value: "today", label: t("dateToday") }, { value: "custom", label: t("dateCustom") }]} onPick={(v) => onCover({ date_mode: v as RbCover["date_mode"] })} />
        </div>
        {cover.date_mode === "custom" && <input type="text" className="cd-input" aria-label={t("date")} value={cover.date} onChange={(e) => onCover({ date: e.target.value })} />}
        <label className="cd-rb-field">
          <span>{t("reference")}</span>
          <input type="text" className="cd-input" value={cover.reference} onChange={(e) => onCover({ reference: e.target.value })} />
        </label>
        <div className="cd-rb-info">{t("coverHint")}</div>
      </div>
    </div>
  );
}
