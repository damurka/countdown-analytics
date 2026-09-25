import React, { useEffect, useRef, useState } from "react";
import { tr, useLang } from "../../lang";
import type { LocalText } from "../../lang";
import { caretFont, changeCase, colour, copyFormat, editingText, fontFamily, fontSize, format, formatMore, highlight, insertField, onPainter, painting, pasteFormat, stopPainter } from "./RichText";
import { cssFont } from "./layout";
import type { CustomizeEntries } from "../ChartCustomizeFields";
import type { RbBlock, RbDesign, RbFacets, RbField, RbKind, RbTheme, Texts } from "./types";
import { FontOptions, Icon, ICONS, kindIcon, Toggle } from "./ui";
import { Big, Col, Drop, Group, Item, keep, LayoutThumb, NumCombo, RibbonBody, Row, Small, SplitSmall, StyleGallery, tip } from "./kit/controls";
import { SwatchGrid } from "./kit/menus";
import { themeColours } from "./kit/pictures";
import { ChartDesignTab } from "./ribbon/ChartDesignTab";
import { ChartFormatTab } from "./ribbon/ChartFormatTab";
import { PictureFormatTab } from "./ribbon/PictureFormatTab";
import { HeaderFooterMenu, LinkMenu, NumberField, PictureMenu } from "./ribbon/InsertMenus";
import { FieldMenu } from "./ribbon/FieldMenu";
import { restoreSelection, saveSelection } from "./ribbon/selection";
import { ObjectToolbar } from "./ribbon/ObjectToolbar";
import { TextToolbar } from "./ribbon/TextToolbar";

export { FieldMenu } from "./ribbon/FieldMenu";

// The ribbon above the pages, laid out as Microsoft Word's: tabs Home, Insert, Design and Layout, each with groups of
// large buttons (an icon over a label) and small ones (icon rows), a group's name under it, and menus under the buttons
// with an arrow. Every button does something the Word file and the PDF keep. Buttons that format text act on mouse down,
// so the text being edited keeps the focus and the selection. The tabs of a selected chart or picture, the Insert menus,
// the Field menu and the two toolbars over the page are in ribbon/.

export type StyleKind = "body" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "note" | "quote" | "code";

interface Props {
  design: RbDesign;
  themes: RbTheme[];
  fonts: string[];
  kinds: RbKind[];
  fieldCatalog: RbField[];
  fields: Record<string, string>;
  /** The text block the caret is in (or the selected one). */
  current: RbBlock | null;
  canUndo: boolean;
  canRedo: boolean;
  texts: Texts;
  onUndo: () => void;
  onRedo: () => void;
  onStyle: (s: StyleKind) => void;
  /** The style of the text where the caret is. */
  styleNow: StyleKind | null;
  /** The list the caret is in, if any; lists are toggled and indented by the editor. */
  listNow: "bullet" | "number" | null;
  onList: (kind: "bullet" | "number") => void;
  onIndent: (dir: 1 | -1) => void;
  onBlock: (patch: Partial<RbBlock>) => void;
  onInsert: (block: Partial<RbBlock>) => void;
  /** A picture from a web address (R downloads it). */
  onInsertUrl: (url: string) => void;
  onOpenBlocks: () => void;
  onDesign: (patch: Partial<RbDesign>) => void;
  onTheme: (th: RbTheme) => void;
  onPanel: (panel: "theme" | "cover") => void;
  regions: string[];
  region?: string;
  onRegion: (region: string) => void;
  reportLang?: "en" | "fr" | "pt";
  onReportLang: (lang: "en" | "fr" | "pt") => void;
  /** The chart, table or picture selected on the page: its tabs appear (Chart Design, Format / Picture Format). */
  selected?: RbBlock | null;
  selectedKind?: RbKind;
  entries?: CustomizeEntries;
  /** The selected chart's panels, when it is drawn as several (by year, district...). */
  facets?: RbFacets | null;
  years: number[];
  onSelected: (patch: Partial<RbBlock>) => void;
  onCustomize: () => void;
  /** Crop mode for the selected picture or chart: on, and turning it on or off. */
  cropping?: boolean;
  onCropMode?: () => void;
  /** The selected chart, table or picture moved up or down the report. */
  onMove?: (delta: number) => void;
  /** A free page is being edited: a text box can be put on it. */
  onTextBox?: () => void;
  /** An Office file (.potx, .pptx, .dotx, .docx) to make a theme from. */
  onThemeFile?: (file: File) => void;
  /** A text box selected (on a slide or a free page, not being typed in): its fill and outline. */
  textBox?: { id: string; fill?: string; fill_opacity?: number; outline?: string; onPatch: (patch: Partial<RbBlock>) => void };
  onDuplicate: () => void;
  onRemove: () => void;
  /** A slide deck is being edited (PowerPoint's ribbon): its slides' commands; the document-only groups are hidden. */
  deck?: DeckCommands;
}

/** What the ribbon can do with a slide deck. */
export interface DeckCommands {
  layouts: { id: string; label: string; items: { x: number; y: number; w: number; h: number; role?: string }[] }[];
  /** The layout of the slide shown. */
  layout?: string;
  onNewSlide: (layout: string) => void;
  onLayout: (layout: string) => void;
  onResetSlide: () => void;
  onDuplicateSlide: () => void;
  onDeleteSlide: () => void;
  onTextBox: () => void;
  slideSize: "16:9" | "4:3";
  onSlideSize: (size: "16:9" | "4:3") => void;
}


type TabKey = "home" | "insert" | "design" | "layout" | "chartDesign" | "chartFormat" | "pictureFormat";


/** The report languages, each written in itself. */
export const LANGS: ["en" | "fr" | "pt", string][] = [
  ["en", "English"],
  ["fr", "Français"],
  ["pt", "Português"]
];

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const HIGHLIGHTS = ["#fff200", "#8ef58e", "#8ce7f5", "#f7a6d8", "#ffb366", "#c9ced3"];

// ---- the tabs -----------------------------------------------------------------------------------------------------

export function Ribbon(props: Props) {
  const { design, current, texts } = props;
  const lang = useLang();
  const t = (k: string) => tr(texts[k] as LocalText, lang) || k;
  const [tab, setTab] = useState<TabKey>("home");
  const sel = props.selected || null;
  const contextual: TabKey[] = !sel || sel.type === "canvas" ? [] : sel.type === "image" ? ["pictureFormat"] : sel.type === "table" ? ["chartDesign"] : ["chartDesign", "chartFormat", "pictureFormat"];
  // a chart or picture selected on the page opens its tab, as in Word; when it is no longer selected its tabs go away
  useEffect(() => {
    if (sel && contextual.length) setTab(contextual[0]);
    else setTab((cur) => (cur === "chartDesign" || cur === "chartFormat" || cur === "pictureFormat" ? "home" : cur));
  }, [sel?.id, sel?.type]);
  const [lastColour, setLastColour] = useState(design.accent);
  const [lastMark, setLastMark] = useState(HIGHLIGHTS[0]);
  const [caret, setCaret] = useState<{ family: string; size: number } | null>(null);

  // the ribbon's element: the toolbars over the page are put in the builder it is in
  const ribbonRef = useRef<HTMLDivElement>(null);

  // text that can be formatted: paragraphs, headings, lists, notes and quotes (preformatted text is kept as typed)
  const inBody = !!current && ["paragraph", "heading", "note", "list", "quote"].includes(current.type);
  const isTextBlock = inBody || (!!current && current.type === "pre");
  const styleOf = props.styleNow;

  // the font box and size box show the text where the caret is, as Word's do
  useEffect(() => {
    const on = () => setCaret(caretFont());
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, []);
  const size = caret?.size ?? design.body_size;
  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? SIZES.find((s) => s > size) : [...SIZES].reverse().find((s) => s < size);
    if (next) fontSize(next);
  };
  const indent = (dir: 1 | -1) => props.onIndent(dir);
  const lineNow = current?.line ?? design.line_spacing;
  const fontList = Array.from(new Set([design.heading_font, design.body_font].concat(props.fonts)));

  const styles: { key: StyleKind; label: string; css: React.CSSProperties }[] = [
    { key: "body", label: t("styleBody"), css: { fontFamily: cssFont(design.body_font), fontSize: 13, color: design.text_color } },
    { key: "h1", label: t("styleH1"), css: { fontFamily: cssFont(design.heading_font), fontWeight: 700, color: design.heading_color, fontSize: 15 } },
    { key: "h2", label: t("styleH2"), css: { fontFamily: cssFont(design.heading_font), fontWeight: 700, fontSize: 13.5, color: design.text_color } },
    { key: "h3", label: t("styleH3"), css: { fontFamily: cssFont(design.heading_font), fontWeight: 700, fontSize: 13, color: design.text_color } },
    { key: "note", label: t("styleNote"), css: { fontFamily: cssFont(design.body_font), fontSize: 12, background: design.note_fill, boxShadow: `inset 0 0 0 1px ${design.note_border}`, padding: "0 3px" } },
    { key: "quote", label: t("styleQuote"), css: { fontFamily: cssFont(design.body_font), fontSize: 12.5, fontStyle: "italic", color: design.muted_color, borderLeft: `2px solid ${design.accent}`, paddingLeft: 4 } },
    { key: "h4", label: t("styleH4"), css: { fontFamily: cssFont(design.heading_font), fontWeight: 700, fontSize: 12.5, color: design.text_color } },
    { key: "h5", label: t("styleH5"), css: { fontFamily: cssFont(design.heading_font), fontWeight: 700, fontStyle: "italic", fontSize: 12.5, color: design.text_color } },
    { key: "h6", label: t("styleH6"), css: { fontFamily: cssFont(design.heading_font), fontWeight: 700, fontSize: 12, color: design.muted_color } },
    { key: "code", label: t("styleCode"), css: { fontFamily: "Consolas, 'Courier New', monospace", fontSize: 11.5, background: "#f1f3f5", padding: "0 3px" } }
  ];
  // the editor's shortcuts for the styles
  const styleKeys: Partial<Record<StyleKind, string>> = { body: "Ctrl+Alt+0", h1: "Ctrl+Alt+1", h2: "Ctrl+Alt+2", h3: "Ctrl+Alt+3", h4: "Ctrl+Alt+4", h5: "Ctrl+Alt+5", h6: "Ctrl+Alt+6" };
  const swatches = Array.from(new Set([design.text_color, design.accent, design.heading_color, design.muted_color].concat(design.palette)));
  const byGroup = (type: "chart" | "table") => {
    const groups: { title: string; items: RbKind[] }[] = [];
    props.kinds.filter((k) => k.type === type).forEach((k) => {
      const title = tr(k.groupLabel, lang);
      let g = groups.find((x) => x.title === title);
      if (!g) groups.push((g = { title, items: [] }));
      g.items.push(k);
    });
    return groups;
  };
  const kindMenu = (type: "chart" | "table") => (close: () => void) => (
    <div className="cd-rb-kindmenu">
      {byGroup(type).map((g) => (
        <div key={g.title}>
          <div className="cd-rb-fieldmenu__head">{g.title}</div>
          {g.items.map((k) => (
            <Item
              key={k.kind}
              icon={kindIcon(k.type, k.kind)}
              label={tr(k.label, lang)}
              onClick={() => {
                props.onInsert({ type: k.type, kind: k.kind, ...k.defaults });
                close();
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
  const pageSizes: [RbDesign["size"], string, string][] = [
    ["a4", "A4", "21 × 29.7 cm"],
    ["letter", "Letter", "21.6 × 27.9 cm"],
    ["a3", "A3", "29.7 × 42 cm"],
    ["chartbook", t("sizeChartbook"), ""],
    ["poster", t("sizePoster"), ""]
  ];
  const margins: [RbDesign["margins"], string, string][] = [
    ["normal", t("marginNormal"), "2 · 1.9 · 1.9 cm"],
    ["narrow", t("marginNarrow"), "1.5 · 1.3 cm"],
    ["wide", t("marginWide"), "2.5 · 2.5 cm"]
  ];
  const spacings: [string, number, number][] = [
    [t("spacingNone"), 1, 0],
    [t("spacingCompact"), 1, 4],
    [t("spacingTight"), 1.15, 6],
    [t("spacingOpen"), 1.15, 10],
    [t("spacingRelaxed"), 1.5, 10],
    [t("spacingDouble"), 2, 8]
  ];
  const deck = props.deck;
  // a box on a slide or on a free page: no wrapping, page position or page widths; up and down are its stacking order
  const boxed = !!deck || !!props.onTextBox;
  const layoutGallery = (pick: (layout: string) => void, now?: string) => (close: () => void) => (
    <div className="cd-rb-layoutgal">
      {(deck?.layouts || []).map((l) => (
        <button
          key={l.id}
          type="button"
          className={now === l.id ? "cd-rb-layoutcard cd-rb-layoutcard--on" : "cd-rb-layoutcard"}
          aria-pressed={now === l.id}
          onMouseDown={keep}
          onClick={() => {
            pick(l.id);
            close();
          }}
        >
          <LayoutThumb items={l.items} wide={deck?.slideSize !== "4:3"} />
          <span>{l.label}</span>
        </button>
      ))}
    </div>
  );
  const slidesGroup = deck && (
    <Group label={t("slidesGroup")} icon={["M3 5h18v12H3z", "M8 21h8"]}>
      <Drop width={330} trigger={(open, toggle) => <Big icon={["M3 5h14v11H3z", "M19 9v8H7", "M17 19h4", "M19 17v4"]} label={t("newSlide")} keys="Ctrl+M" menu on={open} tone="amber" onClick={toggle} />}>
        {layoutGallery((l) => deck.onNewSlide(l))}
      </Drop>
      <Col>
        <Drop width={330} trigger={(open, toggle) => <Small wide icon={["M3 5h18v14H3z", "M3 9h18", "M10 9v10"]} label={t("slideLayout")} on={open} onClick={toggle} />}>
          {layoutGallery((l) => deck.onLayout(l), deck.layout)}
        </Drop>
        <Small wide icon={ICONS.undo} label={t("resetSlide")} onClick={deck.onResetSlide} />
        <Small wide icon={ICONS.copy} label={t("duplicateSlide")} onClick={deck.onDuplicateSlide} />
        <Small wide icon={ICONS.trash} label={t("deleteSlide")} onClick={deck.onDeleteSlide} />
      </Col>
    </Group>
  );
  const fontPairs = Array.from(new Map(props.themes.map((th) => [th.heading_font + "|" + th.body_font, th])).values());

  // ---- what the Home tab and the mini toolbar over selected text (ribbon/TextToolbar.tsx) share ----
  const fontBox = (
                  <select
                    className="cd-rb-fontbox"
                    aria-label={t("font")}
                    disabled={!inBody}
                    value={caret?.family && fontList.includes(caret.family) ? caret.family : ""}
                    style={{ fontFamily: cssFont(caret?.family || design.body_font) }}
                    onMouseDown={() => saveSelection()}
                    onChange={(e) => {
                      if (restoreSelection()) fontFamily(e.target.value);
                    }}
                  >
                    <option value="" disabled>
                      {caret?.family || design.body_font}
                    </option>
                    <optgroup label={t("themeFonts")}>
                      <option value={design.heading_font} style={{ fontFamily: cssFont(design.heading_font) }}>
                        {design.heading_font} ({t("headingFontLabel")})
                      </option>
                      <option value={design.body_font} style={{ fontFamily: cssFont(design.body_font) }}>
                        {design.body_font} ({t("bodyFont")})
                      </option>
                    </optgroup>
                    <FontOptions fonts={props.fonts} serifLabel={t("serifFonts")} sansLabel={t("sansFonts")} />
                  </select>
  );
  const sizeBox = (
                  <NumCombo
                    label={t("fontSize")}
                    hideLabel
                    value={size}
                    min={1}
                    max={400}
                    step={0.5}
                    neutral={design.body_size}
                    width={34}
                    disabled={!inBody}
                    applyOnBlur={false}
                    presets={SIZES.map((v) => [v, String(v)] as [number, string])}
                    onFocus={() => saveSelection()}
                    onChange={(v) => {
                      // picked from the list the text keeps its selection; typed in the box it is put back first
                      if (v !== undefined && (editingText() || restoreSelection())) fontSize(v);
                    }}
                  />
  );
  const markSplit = (
                  <SplitSmall icon={ICONS.highlighter} label={t("highlight")} swatch={lastMark} onClick={() => highlight(lastMark)}>
                    {(close) => (
                      <div className="cd-rb-swatchmenu">
                        <SwatchGrid
                          colours={HIGHLIGHTS}
                          titled={false}
                          onPick={(c) => {
                            setLastMark(c);
                            highlight(c);
                            close();
                          }}
                        />
                        <Item
                          label={t("noHighlight")}
                          onClick={() => {
                            highlight("");
                            close();
                          }}
                        />
                      </div>
                    )}
                  </SplitSmall>
  );
  const colourSplit = (
                  <SplitSmall icon={["M6 18l6-13 6 13", "M8.5 13h7"]} label={t("textColor")} swatch={lastColour} onClick={() => colour(lastColour)}>
                    {(close) => (
                      <div className="cd-rb-swatchmenu">
                        <div className="cd-rb-fieldmenu__head">{t("themeColours")}</div>
                        <SwatchGrid
                          colours={swatches}
                          onPick={(c) => {
                            setLastColour(c);
                            colour(c);
                            close();
                          }}
                        />
                        <label className="cd-rb-swatchmenu__custom" onMouseDown={saveSelection}>
                          <input
                            type="color"
                            defaultValue={lastColour}
                            aria-label={t("textColor")}
                            onChange={(e) => {
                              setLastColour(e.target.value);
                              if (restoreSelection()) colour(e.target.value);
                            }}
                          />
                          <span>{t("moreColours")}</span>
                        </label>
                      </div>
                    )}
                  </SplitSmall>
  );
  const lineMenu = (close: () => void) => (
                      <>
                        {[1, 1.15, 1.5, 2, 2.5, 3].map((l) => (
                          <Item
                            key={l}
                            label={l.toFixed(l === 1.15 ? 2 : 1)}
                            on={Math.abs(lineNow - l) < 0.01}
                            onClick={() => {
                              props.onBlock({ line: l });
                              close();
                            }}
                          />
                        ))}
                        <Item
                          label={current?.space_before ? t("spaceBeforeRemove") : t("spaceBeforeAdd")}
                          onClick={() => {
                            props.onBlock({ space_before: current?.space_before ? 0 : 12 });
                            close();
                          }}
                        />
                      </>
                    );
  const lineSpacing = (big: boolean) => (
    <Drop
      trigger={(open, toggle) =>
        big ? (
          <Big icon={ICONS.lineSpacing} label={t("lineAndParagraph")} menu on={open} disabled={!inBody} onClick={toggle} />
        ) : (
          <button type="button" className="cd-rb-sm" aria-label={t("lineSpacing")} title={t("lineSpacing")} aria-expanded={open} disabled={!inBody} onMouseDown={keep} onClick={toggle}>
            <Icon d={ICONS.lineSpacing} size={16} />
            <Icon d={ICONS.expand} size={10} />
          </button>
        )
      }
    >
      {lineMenu}
    </Drop>
  );

  const caseDrop = (
                  <Drop
                    trigger={(open, toggle) => (
                      <button type="button" className="cd-rb-sm" aria-label={t("changeCase")} title={t("changeCase")} aria-expanded={open} disabled={!inBody} onMouseDown={keep} onClick={toggle}>
                        <Icon d={ICONS.changeCase} size={16} />
                        <Icon d={ICONS.expand} size={10} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        {([
                          ["sentence", t("caseSentence")],
                          ["lower", t("caseLower")],
                          ["upper", t("caseUpper")],
                          ["title", t("caseTitle")]
                        ] as ["sentence" | "lower" | "upper" | "title", string][]).map(([k, label]) => (
                          <Item
                            key={k}
                            label={label}
                            onClick={() => {
                              changeCase(k);
                              close();
                            }}
                          />
                        ))}
                      </>
                    )}
                  </Drop>
  );
  // the format painter: a click copies the formatting for the next text selected, a double click keeps it on
  const [painterOn, setPainterOn] = useState(painting());
  useEffect(() => onPainter(() => setPainterOn(painting())), []);
  useEffect(() => {
    const up = () => setTimeout(() => painting() && pasteFormat(), 0);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && stopPainter();
    document.addEventListener("mouseup", up);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mouseup", up);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  const painterButton = (
    <button
      type="button"
      className={painterOn ? "cd-rb-sm cd-rb-sm--on cd-rb-tone--amber" : "cd-rb-sm cd-rb-tone--amber"}
      aria-label={t("formatPainter")}
      title={t("formatPainterHint")}
      aria-pressed={painterOn}
      disabled={!inBody}
      onMouseDown={keep}
      onClick={() => copyFormat(false)}
      onDoubleClick={() => copyFormat(true)}
    >
      <Icon d={["M4 4h12v5H4z", "M16 6h3v5h-8v3", "M10 14h2v6h-2z"]} size={16} />
    </button>
  );
  // a paragraph's settings, as Word's Paragraph button on the mini toolbar opens them
  const paraMenu = (close: () => void) => (
    <div className="cd-rb-parapop">
      <div className="cd-rb-parapop__row">
        {(["left", "center", "right", "justify"] as const).map((al) => {
          const key = "align" + al[0].toUpperCase() + al.slice(1);
          return <Small key={al} icon={ICONS[key]} label={t(key)} keys={"Ctrl+Shift+" + ({ left: "L", center: "E", right: "R", justify: "J" } as Record<string, string>)[al]} on={(current?.align || "left") === al} onClick={() => props.onBlock({ align: al })} />;
        })}
        <span className="cd-rb-sep" />
        <Small icon={ICONS.indentLess} label={t("indentLess")} keys="Shift+Tab" disabled={!current?.indent_left && !props.listNow} onClick={() => indent(-1)} />
        <Small icon={ICONS.indentMore} label={t("indentMore")} keys="Tab" onClick={() => indent(1)} />
      </div>
      {lineMenu(close)}
      <Item
        label={t("paragraphSettings")}
        onClick={() => {
          setTab("layout");
          close();
        }}
      />
    </div>
  );
  const styleWin = (close: () => void) => (
                  <div className="cd-rb-stylewin">
                    <div className="cd-rb-stylewin__grid">
                      {styles.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          title={tip(s.label, styleKeys[s.key])}
                          aria-pressed={styleOf === s.key}
                          className={styleOf === s.key ? "cd-rb-stylecard cd-rb-stylecard--on" : "cd-rb-stylecard"}
                          onMouseDown={keep}
                          onClick={() => {
                            props.onStyle(s.key);
                            close();
                          }}
                        >
                          <span style={s.css}>AaBbCcDd</span>
                          <small>{"¶ " + s.label}</small>
                        </button>
                      ))}
                    </div>
                    <div className="cd-rb-stylewin__actions">
                      <button
                        type="button"
                        className="cd-rb-mitem"
                        onMouseDown={keep}
                        onClick={() => {
                          format("removeFormat");
                          close();
                        }}
                      >
                        <Icon d={ICONS.clear} size={16} />
                        <span>{t("clearFormat")}</span>
                      </button>
                      <button
                        type="button"
                        className="cd-rb-mitem"
                        onMouseDown={keep}
                        onClick={() => {
                          props.onPanel("theme");
                          close();
                        }}
                      >
                        <Icon d={ICONS.palette} size={16} />
                        <span>{t("modifyStyles")}</span>
                      </button>
                    </div>
                  </div>
                );
  const styleCard = (sk: (typeof styles)[number], after?: () => void) => (
    <button
      key={sk.key}
      type="button"
      title={tip(sk.label, styleKeys[sk.key])}
      aria-pressed={styleOf === sk.key}
      className={styleOf === sk.key ? "cd-rb-stylecard cd-rb-stylecard--on" : "cd-rb-stylecard"}
      disabled={!isTextBlock}
      onMouseDown={keep}
      onClick={() => {
        props.onStyle(sk.key);
        after?.();
      }}
    >
      <span style={sk.css}>AaBbCcDd</span>
      <small>{"\u00b6 " + sk.label}</small>
    </button>
  );

  return (
    <div ref={ribbonRef} className="cd-rb-ribbon">
      <ObjectToolbar
        anchor={ribbonRef}
        selected={sel}
        textBox={props.textBox}
        swatches={swatches}
        boxed={boxed}
        cropping={props.cropping}
        onCropMode={props.onCropMode}
        onSelected={props.onSelected}
        onCustomize={props.onCustomize}
        onMove={props.onMove}
        onDuplicate={props.onDuplicate}
        onRemove={props.onRemove}
        t={t}
      />
      <TextToolbar
        anchor={ribbonRef}
        fontBox={fontBox}
        sizeBox={sizeBox}
        caseDrop={caseDrop}
        painterButton={painterButton}
        markSplit={markSplit}
        colourSplit={colourSplit}
        lineSpacing={lineSpacing(true)}
        styleCards={(close) => styles.map((sk) => styleCard(sk, close))}
        paraMenu={paraMenu}
        onStep={step}
        listNow={props.listNow}
        onList={props.onList}
        align={current?.align}
        onAlign={(align) => props.onBlock({ align })}
        t={t}
      />

      <div role="tablist" className="cd-rb-ribbon__tabs">
        <span className="cd-rb-qat" role="group" aria-label={t("undoGroup")}>
          <Small icon={ICONS.undo} label={t("undo")} keys="Ctrl+Z" disabled={!props.canUndo} onClick={props.onUndo} />
          <Small icon={ICONS.redo} label={t("redo")} keys="Ctrl+Y" disabled={!props.canRedo} onClick={props.onRedo} />
        </span>
        {(["home", "insert", "design", "layout"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "cd-rb-rtab cd-rb-rtab--on" : "cd-rb-rtab"} onMouseDown={keep} onClick={() => setTab(k)}>
            {t(k === "design" ? "designTab" : k)}
          </button>
        ))}
        {contextual.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "cd-rb-rtab cd-rb-rtab--ctx cd-rb-rtab--on" : "cd-rb-rtab cd-rb-rtab--ctx"} onMouseDown={keep} onClick={() => setTab(k)}>
            {t(k === "chartDesign" ? (sel?.type === "table" ? "tableDesign" : "chartDesignTab") : k === "chartFormat" ? "formatTab" : "pictureFormatTab")}
          </button>
        ))}
      </div>
      <RibbonBody tab={tab} label={t(tab === "design" ? "designTab" : tab)}>
        {tab === "chartDesign" && sel && (
          <ChartDesignTab
            b={sel}
            kind={props.selectedKind}
            regions={props.regions}
            years={props.years}
            reportRegion={props.region}
            entries={props.entries}
            facets={props.facets}
            deck={boxed}
            design={design}
            themes={props.themes}
            t={t}
            lang={lang}
            onSelected={props.onSelected}
            onCustomize={props.onCustomize}
            onDuplicate={props.onDuplicate}
            onRemove={props.onRemove}
          />
        )}
        {tab === "chartFormat" && sel && <ChartFormatTab b={sel} fonts={props.fonts} design={design} t={t} onSelected={props.onSelected} />}
        {tab === "pictureFormat" && sel && <PictureFormatTab b={sel} design={design} t={t} deck={boxed} cropping={!!props.cropping} onCropMode={props.onCropMode} onSelected={props.onSelected} onDuplicate={props.onDuplicate} onRemove={props.onRemove} />}
        {tab === "home" && (
          <>
            <Group label={t("clipboard")} icon={ICONS.paste}>
              <Big
                icon={ICONS.paste}
                label={t("paste")}
                disabled={!inBody}
                onClick={() => {
                  if (!navigator.clipboard || !navigator.clipboard.readText) return;
                  const host = editingText();
                  navigator.clipboard
                    .readText()
                    .then((text) => {
                      if (host) host.focus();
                      document.execCommand("insertText", false, text);
                    })
                    .catch(() => undefined);
                }}
              />
              <Col>
                <Small icon={ICONS.cut} label={t("cut")} keys="Ctrl+X" disabled={!isTextBlock} onClick={() => document.execCommand("cut")} />
                <Small icon={ICONS.copy} label={t("copy")} keys="Ctrl+C" disabled={!isTextBlock} onClick={() => document.execCommand("copy")} />
                {painterButton}
              </Col>
            </Group>
            {slidesGroup}
            <Group label={t("font")} icon={ICONS.fonts}>
              <Col>
                <Row>
{fontBox}
{sizeBox}
                  <Small icon={ICONS.fontGrow} label={t("growFont")} keys="Ctrl+Shift+>" disabled={!inBody} onClick={() => step(1)} />
                  <Small icon={ICONS.fontShrink} label={t("shrinkFont")} keys="Ctrl+Shift+<" disabled={!inBody} onClick={() => step(-1)} />
{caseDrop}
                  <Small icon={ICONS.clear} label={t("clearFormat")} disabled={!inBody} onClick={() => format("removeFormat")} />
                </Row>
                <Row>
                  <Small icon={ICONS.bold} label={t("bold")} keys="Ctrl+B" disabled={!inBody} onClick={() => format("bold")} />
                  <Small icon={ICONS.italic} label={t("italic")} keys="Ctrl+I" disabled={!inBody} onClick={() => format("italic")} />
                  <Small icon={ICONS.underline} label={t("underline")} keys="Ctrl+U" disabled={!inBody} onClick={() => format("underline")} />
                  <Small icon={ICONS.strike} label={t("strike")} keys="Ctrl+Shift+S" disabled={!inBody} onClick={() => formatMore("strikeThrough")} />
                  <Small icon={ICONS.subscript} label={t("subscript")} keys="Ctrl+," disabled={!inBody} onClick={() => formatMore("subscript")} />
                  <Small icon={ICONS.superscript} label={t("superscript")} keys="Ctrl+." disabled={!inBody} onClick={() => formatMore("superscript")} />
                  <span className="cd-rb-sep" />
{markSplit}
{colourSplit}
                </Row>
              </Col>
            </Group>
            <Group label={t("paragraphGroup")} icon={ICONS.alignLeft} launch={() => setTab("layout")} launchLabel={t("paragraphSettings")}>
              <Col>
                <Row>
                  <Small icon={ICONS.bullets} label={t("bullets")} keys="Ctrl+Shift+8" on={props.listNow === "bullet"} disabled={!inBody} onClick={() => props.onList("bullet")} />
                  <Small icon={ICONS.numbering} label={t("numbering")} keys="Ctrl+Shift+7" on={props.listNow === "number"} disabled={!inBody} onClick={() => props.onList("number")} />
                  <span className="cd-rb-sep" />
                  <Small icon={ICONS.indentLess} label={t("indentLess")} keys="Shift+Tab" disabled={!inBody || (!current?.indent_left && !props.listNow)} onClick={() => indent(-1)} />
                  <Small icon={ICONS.indentMore} label={t("indentMore")} keys="Tab" disabled={!inBody} onClick={() => indent(1)} />
                </Row>
                <Row>
                  {(["left", "center", "right", "justify"] as const).map((a) => {
                    const key = "align" + a[0].toUpperCase() + a.slice(1);
                    return <Small key={a} icon={ICONS[key]} label={t(key)} keys={"Ctrl+Shift+" + ({ left: "L", center: "E", right: "R", justify: "J" } as Record<string, string>)[a]} on={inBody && (current?.align || "left") === a} disabled={!inBody} onClick={() => props.onBlock({ align: a })} />;
                  })}
                  <span className="cd-rb-sep" />
{lineSpacing(false)}
                </Row>
              </Col>
            </Group>
            {!deck && (
              <Group fill label={t("styles")} launch={() => props.onPanel("theme")} launchLabel={t("customiseTheme")}>
                <StyleGallery count={styles.length} card={(i) => styleCard(styles[i])} win={styleWin} disabled={!isTextBlock} t={t} />
              </Group>
            )}
            <Group label={t("field")}>
              <FieldMenu catalog={props.fieldCatalog} fields={props.fields} t={t} lang={lang} big />
            </Group>
          </>
        )}

        {tab === "insert" && (
          <>
            {slidesGroup}
            {!deck && (
            <Group label={t("pagesGroup")}>
              <Col>
                <Small wide icon={ICONS.coverPage} label={t("coverPage")} on={design.cover} onClick={() => (design.cover ? props.onPanel("cover") : props.onDesign({ cover: true }))} />
                <Small wide icon={ICONS.blankPage} label={t("blankPage")} onClick={() => props.onInsert({ type: "pagebreak" })} />
                <Small wide icon={ICONS.pagebreak} label={t("pagebreak")} onClick={() => props.onInsert({ type: "pagebreak" })} />
              </Col>
              <Big icon={["M4 3h16v18H4z", "M7 6h10v3H7z", "M7 11h4v7H7z", "M13 11h4v3h-4z", "M13 16h4v2h-4z"]} label={t("freePage")} keys="" tone="purple" onClick={() => props.onInsert({ type: "canvas" })} />
            </Group>
            )}
            <Group label={t("tablesGroup")}>
              <Drop width={320} trigger={(open, toggle) => <Big icon={ICONS.table} label={t("table")} menu on={open} onClick={toggle} tone="green" />}>
                {kindMenu("table")}
              </Drop>
            </Group>
            <Group label={t("illustrations")}>
              <PictureMenu t={t} onFile={(img) => props.onInsert({ type: "image", src: img.src, ratio: img.ratio, size: "full", width: 60, align: "center", shape: "rect" })} onUrl={props.onInsertUrl} />
              <Drop width={340} trigger={(open, toggle) => <Big icon={ICONS.chartBar} label={t("chart")} menu on={open} onClick={toggle} tone="blue" />}>
                {kindMenu("chart")}
              </Drop>
              {!deck && <Big icon={ICONS.search} label={t("blocks")} onClick={props.onOpenBlocks} />}
            </Group>
            <Group label={t("text")}>
              {deck || props.onTextBox ? (
                <Big icon={ICONS.textBox} label={t("textBox")} onClick={deck ? deck.onTextBox : props.onTextBox} tone="amber" />
              ) : (
                <Big icon={ICONS.textBox} label={t("note")} onClick={() => props.onInsert({ type: "note", text: t("newNote") })} />
              )}
              {!deck && (
              <Col>
                <Small wide icon={ICONS.heading} label={t("heading")} onClick={() => props.onInsert({ type: "heading", level: 1, text: t("newHeading") })} />
                <Small wide icon={ICONS.paragraph} label={t("paragraph")} onClick={() => props.onInsert({ type: "paragraph", text: "" })} />
                <Small wide icon={ICONS.calendar} label={t("dateField")} onClick={() => editingText() && insertField("report_date", props.fields.report_date)} />
              </Col>
              )}
            </Group>
            <Group label={t("linksGroup")}>
              <LinkMenu t={t} disabled={!inBody} />
            </Group>
            {!deck && (
              <Group label={t("headerFooter")}>
                <HeaderFooterMenu which="header" design={design} t={t} onDesign={props.onDesign} />
                <HeaderFooterMenu which="footer" design={design} t={t} onDesign={props.onDesign} />
                <Big icon={ICONS.pageNumber} label={t("pageNumbers")} on={design.page_numbers} onClick={() => props.onDesign({ page_numbers: !design.page_numbers })} />
              </Group>
            )}
            <Group label={t("quickParts")}>
              <FieldMenu catalog={props.fieldCatalog} fields={props.fields} t={t} lang={lang} big />
            </Group>
          </>
        )}

        {tab === "design" && (
          <>
            <Group label={t("theme")}>
              <Drop width={300} trigger={(open, toggle) => <Big icon={ICONS.themes} label={t("theme")} menu on={open} onClick={toggle} />}>
                {(close) => (
                  <>
                    {props.themes.map((th) => (
                      <Item
                        key={th.theme}
                        label={tr(th.name, lang)}
                        hint={`${th.heading_font} · ${th.body_font}`}
                        on={design.theme === th.theme}
                        onClick={() => {
                          props.onTheme(th);
                          close();
                        }}
                      />
                    ))}
                    <Item
                      label={t("customiseTheme")}
                      icon={ICONS.palette}
                      onClick={() => {
                        props.onPanel("theme");
                        close();
                      }}
                    />
                    {props.onThemeFile && (
                      <label className="cd-rb-mitem cd-rb-mitem--file" title={t("themeFromFileHint")}>
                        <Icon d={["M5 3h9l5 5v13H5z", "M14 3v5h5", "M12 11v6", "M9 14l3-3 3 3"]} size={16} />
                        <span>{t("themeFromFile")}</span>
                        <input
                          type="file"
                          accept=".potx,.pptx,.dotx,.docx"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) props.onThemeFile?.(f);
                            close();
                          }}
                        />
                      </label>
                    )}
                  </>
                )}
              </Drop>
            </Group>
            <Group label={t("documentFormatting")}>
              <div className="cd-rb-docgallery">
                {props.themes.map((th) => (
                  <button key={th.theme} type="button" title={tr(th.name, lang)} aria-label={tr(th.name, lang)} aria-pressed={design.theme === th.theme} className={design.theme === th.theme ? "cd-rb-doccard cd-rb-doccard--on" : "cd-rb-doccard"} onMouseDown={keep} onClick={() => props.onTheme(th)}>
                    <b style={{ fontFamily: cssFont(th.heading_font), color: th.text_color }}>{t("styleTitle")}</b>
                    <i style={{ fontFamily: cssFont(th.heading_font), color: th.heading_color, borderColor: th.accent }}>{t("styleH1")}</i>
                    <span style={{ fontFamily: cssFont(th.body_font) }}>{t("sampleText")}</span>
                  </button>
                ))}
              </div>
              <Drop width={260} trigger={(open, toggle) => <Big icon={ICONS.colors} label={t("colours")} menu on={open} onClick={toggle} />}>
                {(close) => (
                  <>
                    {props.themes.map((th) => (
                      <button
                        key={th.theme}
                        type="button"
                        className="cd-rb-mitem"
                        onMouseDown={keep}
                        onClick={() => {
                          props.onDesign(themeColours(th));
                          close();
                        }}
                      >
                        <span className="cd-rb-colourset">
                          {[th.accent].concat(th.palette.slice(0, 5)).map((c, i) => (
                            <i key={i} style={{ background: c }} />
                          ))}
                        </span>
                        <span>{tr(th.name, lang)}</span>
                      </button>
                    ))}
                  </>
                )}
              </Drop>
              <Drop width={280} trigger={(open, toggle) => <Big icon={ICONS.fonts} label={t("fontsTitle")} menu on={open} onClick={toggle} />}>
                {(close) => (
                  <>
                    {fontPairs.map((th) => (
                      <button
                        key={th.heading_font + th.body_font}
                        type="button"
                        className={design.heading_font === th.heading_font && design.body_font === th.body_font ? "cd-rb-mitem cd-rb-mitem--on cd-rb-fontpair" : "cd-rb-mitem cd-rb-fontpair"}
                        onMouseDown={keep}
                        onClick={() => {
                          props.onDesign({ heading_font: th.heading_font, body_font: th.body_font });
                          close();
                        }}
                      >
                        <b style={{ fontFamily: cssFont(th.heading_font) }}>{th.heading_font}</b>
                        <span style={{ fontFamily: cssFont(th.body_font) }}>{th.body_font}</span>
                      </button>
                    ))}
                    <Item
                      label={t("customiseTheme")}
                      icon={ICONS.palette}
                      onClick={() => {
                        props.onPanel("theme");
                        close();
                      }}
                    />
                  </>
                )}
              </Drop>
              <Col>
                <Drop width={240} trigger={(open, toggle) => <Small wide icon={ICONS.spacing} label={t("paragraphSpacing")} on={open} onClick={toggle} />}>
                  {(close) => (
                    <>
                      {spacings.map(([label, line, after]) => (
                        <Item
                          key={label}
                          label={label}
                          hint={`${line} · ${after} pt`}
                          on={design.line_spacing === line && design.paragraph_after === after}
                          onClick={() => {
                            props.onDesign({ line_spacing: line, paragraph_after: after });
                            close();
                          }}
                        />
                      ))}
                    </>
                  )}
                </Drop>
                <Small wide icon={ICONS.palette} label={t("customiseTheme")} onClick={() => props.onPanel("theme")} />
              </Col>
            </Group>
            {deck && (
              <Group label={t("customizeGroup")}>
                <Drop width={240} trigger={(open, toggle) => <Big icon={["M3 6h18v12H3z", "M7 10h10v4H7z"]} label={t("slideSize")} menu on={open} tone="blue" onClick={toggle} />}>
                  {(close) => (
                    <>
                      {([
                        ["16:9", t("slideWide"), "33.9 \u00d7 19.1 cm"],
                        ["4:3", t("slideStandard"), "25.4 \u00d7 19.1 cm"]
                      ] as ["16:9" | "4:3", string, string][]).map(([k, label, hint]) => (
                        <Item
                          key={k}
                          label={label}
                          hint={hint}
                          on={deck.slideSize === k}
                          onClick={() => {
                            deck.onSlideSize(k);
                            close();
                          }}
                        />
                      ))}
                    </>
                  )}
                </Drop>
              </Group>
            )}
            {!deck && (
            <Group label={t("pageBackground")}>
              <Big icon={ICONS.coverPage} label={t("editCover")} onClick={() => props.onPanel("cover")} />
              <div className="cd-rb-rtoggles">
                <Toggle label={t("coverPage")} on={design.cover} onFlip={() => props.onDesign({ cover: !design.cover })} />
                <Toggle label={t("contents")} on={design.contents} onFlip={() => props.onDesign({ contents: !design.contents })} />
              </div>
            </Group>
            )}
          </>
        )}

        {tab === "layout" && (
          <>
            {!deck && (
            <>
            <Group label={t("pageSetup")}>
              <Drop width={250} trigger={(open, toggle) => <Big icon={ICONS.margins} label={t("margins")} menu on={open} onClick={toggle} />}>
                {(close) => (
                  <>
                    {margins.map(([k, label, hint]) => (
                      <Item
                        key={k}
                        icon={ICONS.margins}
                        label={label}
                        hint={hint}
                        on={design.margins === k}
                        onClick={() => {
                          props.onDesign({ margins: k });
                          close();
                        }}
                      />
                    ))}
                  </>
                )}
              </Drop>
              <Drop width={200} trigger={(open, toggle) => <Big icon={ICONS.orientation} label={t("orientation")} menu on={open} onClick={toggle} />}>
                {(close) => (
                  <>
                    {(["portrait", "landscape"] as const).map((o) => (
                      <Item
                        key={o}
                        icon={o === "portrait" ? ICONS.blankPage : ICONS.orientation}
                        label={t(o)}
                        on={design.orientation === o}
                        onClick={() => {
                          props.onDesign({ orientation: o });
                          close();
                        }}
                      />
                    ))}
                  </>
                )}
              </Drop>
              <Drop width={240} trigger={(open, toggle) => <Big icon={ICONS.pageSize} label={t("pageSize")} menu on={open} onClick={toggle} />}>
                {(close) => (
                  <>
                    {pageSizes.map(([k, label, hint]) => (
                      <Item
                        key={k}
                        label={label}
                        hint={hint}
                        on={design.size === k}
                        onClick={() => {
                          props.onDesign({ size: k });
                          close();
                        }}
                      />
                    ))}
                  </>
                )}
              </Drop>
              <Col>
                <Small wide icon={ICONS.breaks} label={t("pagebreak")} onClick={() => props.onInsert({ type: "pagebreak" })} />
                <Small wide icon={ICONS.pageNumber} label={t("pageNumbers")} on={design.page_numbers} onClick={() => props.onDesign({ page_numbers: !design.page_numbers })} />
              </Col>
            </Group>
            <Group label={t("paragraphGroup")}>
              <div className="cd-rb-parafields">
                <div className="cd-rb-parafields__head">{t("indent")}</div>
                <div className="cd-rb-parafields__head">{t("spacing")}</div>
                <NumberField icon={ICONS.indentMore} label={t("indentLeft")} unit="cm" step={0.25} value={current?.indent_left ?? 0} disabled={!inBody} onChange={(v) => props.onBlock({ indent_left: v })} />
                <NumberField icon={ICONS.spacing} label={t("spaceBefore")} unit="pt" step={6} value={current?.space_before ?? 0} disabled={!inBody} onChange={(v) => props.onBlock({ space_before: v })} />
                <NumberField icon={ICONS.indentLess} label={t("indentRight")} unit="cm" step={0.25} value={current?.indent_right ?? 0} disabled={!inBody} onChange={(v) => props.onBlock({ indent_right: v })} />
                <NumberField icon={ICONS.spacing} label={t("spaceAfter")} unit="pt" step={6} value={current?.space_after ?? design.paragraph_after} disabled={!inBody} onChange={(v) => props.onBlock({ space_after: v })} />
              </div>
            </Group>
            </>
            )}
            <Group label={t("reportGroup")}>
              <div className="cd-rb-langpick">
                <label className="cd-rb-inline" title={t("languageChangeNote")}>
                  <span>{t("reportLanguage")}</span>
                  <select className="cd-input cd-rb-rselect" aria-label={t("reportLanguage")} aria-description={t("languageChangeNote")} value={props.reportLang || "en"} onChange={(e) => props.onReportLang(e.target.value as "en" | "fr" | "pt")}>
                    {LANGS.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {props.regions.length > 0 && (
                  <label className="cd-rb-inline">
                    <span>{t("reportRegion")}</span>
                    <select className="cd-input cd-rb-rselect" aria-label={t("reportRegion")} value={props.region || ""} onChange={(e) => props.onRegion(e.target.value)}>
                      <option value="">{t("level_national")}</option>
                      {props.regions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </Group>
          </>
        )}
      </RibbonBody>
    </div>
  );
}
