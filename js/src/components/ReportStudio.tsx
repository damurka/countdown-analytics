import React, { useEffect, useRef, useState } from "react";
import { InputAdapter } from "@/shiny.react";
import { tr, useLang, useMountSignal, useShinyMessage } from "../lang";
import type { LocalText } from "../lang";
import { ReportEditor } from "./report/ReportEditor";
import { DeckEditor } from "./report/DeckEditor";
import { NameDialog } from "./report/dialogs";
import { setTallKinds } from "./report/layout";
import { setLayouts } from "./report/deck";
import type { RbChartSchema, RbExportState, RbField, RbFinalState, RbKind, RbPreset, RbPreview, RbProject, RbSummary, RbTheme, Texts } from "./report/types";
import { Icon, ICONS } from "./report/ui";

// The Reports page: the list of the dataset's reports and the standard reports, and the builder for one report.
// R (apps/_shared/R/modules/reports.R) owns the reports: it opens one by setting `value`, draws each chart and table
// (message "cd-report-preview"), sends the values of the fields ("cd-report-fields"), writes the file
// ("cd-report-export") and renders the final pages ("cd-report-final"). The builder reports every edit as its value;
// buttons that ask R to do something (open, new, delete, export, final pages) are events on `<id>__action`.
// A new report (blank or from a standard report) is named first: the name is what the user finds it by later. A page's
// "Generate report" button arrives as `request` (its standard report), which opens the same naming dialog.

interface Props {
  id?: string;
  value?: RbProject | null;
  projects: RbSummary[];
  presets: RbPreset[];
  kinds: RbKind[];
  regions: string[];
  years: number[];
  themes: RbTheme[];
  fonts: string[];
  fieldCatalog: RbField[];
  flag?: string | null;
  converter?: string | null;
  /** The slide layouts (cd2030.core::report_deck_layouts()). */
  layouts?: { id: string; items: { role?: string; x: number; y: number; w: number; h: number }[] }[];
  chartSchema: RbChartSchema;
  /** What a new report's suggested name is made from. */
  suggest?: { country?: string; year?: string };
  /** A page asked for a report from its standard report. */
  request?: { preset?: string | null; nonce: number } | null;
  texts: Texts;
  onChange?: (value: RbProject | null) => void;
}

function send(id: string | undefined, action: Record<string, unknown>) {
  if (id && window.Shiny && window.Shiny.setInputValue) {
    window.Shiny.setInputValue(`${id}__action`, { ...action, nonce: Date.now() }, { priority: "event" });
  }
}

function ReportStudio({ id, value, projects, presets, kinds, regions, years, themes, fonts, fieldCatalog, flag, converter, layouts, chartSchema, suggest, request, texts, onChange }: Props) {
  useMountSignal(id);
  const lang = useLang();
  setTallKinds((kinds || []).filter((k) => k.tall).map((k) => k.kind));
  setLayouts(layouts);
  const t = (k: string) => tr(texts[k] as LocalText, lang) || k;
  const [previews, setPreviews] = useState<Record<string, RbPreview>>({});
  const [exportState, setExportState] = useState<RbExportState | null>(null);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [finalState, setFinalState] = useState<RbFinalState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // the report's pictures (id -> data URL), and the answer to the last picture asked for by its web address
  const [assets, setAssets] = useState<Record<string, string>>({});
  // the blocks panel's pictures of each kind of chart (drawn by R once per dataset)
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [assetDone, setAssetDone] = useState<{ id: string; ratio: number } | null>(null);
  const [assetFailed, setAssetFailed] = useState<{ id: string; message: string } | null>(null);
  // a theme made from an Office file (or why it could not be)
  const [themeArrived, setThemeArrived] = useState<{ theme?: RbTheme; failed?: string; nonce: number } | null>(null);
  // the report about to be created, being named: a standard report's id, "" for a blank document, "@deck" for a blank
  // slide deck
  const [naming, setNaming] = useState<string | null>(null);
  const handled = useRef<number>(0);

  const BLANK_DECK = "@deck";
  const suggestName = (presetId: string) => {
    const where = [suggest?.country, suggest?.year].filter(Boolean).join(" ");
    const p = presets.find((x) => x.id === presetId);
    const base = p ? tr(p.name, lang) : presetId === BLANK_DECK ? t("untitledDeck") : t("untitled");
    return where ? `${base} \u2013 ${where}` : base;
  };
  const create = (presetId: string, name: string, reportLang: string) => {
    setNaming(null);
    send(id, presetId === BLANK_DECK ? { type: "new", kind: "deck", name, lang: reportLang } : presetId ? { type: "preset", preset: presetId, name, lang: reportLang } : { type: "new", name, lang: reportLang });
  };

  // a page's "Generate report": name the report from its standard report
  useEffect(() => {
    if (!request || !request.nonce || request.nonce === handled.current) return;
    handled.current = request.nonce;
    if (request.preset && presets.some((p) => p.id === request.preset)) setNaming(request.preset);
  }, [request?.nonce, presets.length]);

  const nameDialog =
    naming !== null ? (
      <NameDialog
        key={naming}
        initial={suggestName(naming)}
        what={naming === BLANK_DECK ? t("newSlides") : naming ? tr(presets.find((p) => p.id === naming)?.name, lang) : t("newDocument")}
        texts={texts}
        onCreate={(name, reportLang) => create(naming, name, reportLang)}
        onCancel={() => setNaming(null)}
      />
    ) : null;

  useShinyMessage("cd-report-preview", "id", id, (msg) => {
    if (msg.reset) setPreviews({});
    const items = (msg.previews || {}) as Record<string, RbPreview>;
    if (Object.keys(items).length) setPreviews((p) => ({ ...p, ...items }));
  });
  useShinyMessage("cd-report-export", "id", id, (msg) => setExportState(msg as unknown as RbExportState));
  useShinyMessage("cd-report-saved", "id", id, () => setSaving(false));
  useShinyMessage("cd-report-fields", "id", id, (msg) => setFields((msg.fields || {}) as Record<string, string>));
  useShinyMessage("cd-report-final", "id", id, (msg) => setFinalState(msg as unknown as RbFinalState));
  useShinyMessage("cd-report-theme", "id", id, (msg) => setThemeArrived({ theme: msg.theme as RbTheme | undefined, failed: msg.failed as string | undefined, nonce: Date.now() }));
  useShinyMessage("cd-report-thumbs", "id", id, (msg) => {
    const items = (msg.thumbs || {}) as Record<string, string>;
    if (Object.keys(items).length) setThumbs((a) => ({ ...a, ...items }));
  });
  useShinyMessage("cd-report-assets", "id", id, (msg) => {
    const items = (msg.assets || {}) as Record<string, string>;
    if (Object.keys(items).length) setAssets((a) => ({ ...a, ...items }));
    if (msg.done) setAssetDone(msg.done as { id: string; ratio: number });
    if (msg.failed) setAssetFailed(msg.failed as { id: string; message: string });
  });

  useEffect(() => {
    setPreviews({});
    setExportState(null);
    setFinalState(null);
  }, [value?.id]);

  // what both builders (a document's, a slide deck's) are given
  const common = value
    ? {
        project: value,
        kinds,
        regions,
        years,
        themes: themes || [],
        fonts: fonts || [],
        fieldCatalog: fieldCatalog || [],
        fields,
        converter,
        chartSchema,
        finalState,
        onFinal: () => {
          setFinalState({ status: "running", pct: 0 });
          send(id, { type: "final" });
        },
        onFinalClosed: () => setFinalState(null),
        previews,
        assets,
        assetDone,
        assetFailed,
        onAsset: (assetId: string, src: string) => {
          setAssets((a) => ({ ...a, [assetId]: src }));
          send(id, { type: "asset", asset: assetId, src });
        },
        onAssetUrl: (assetId: string, url: string) => send(id, { type: "asset_url", asset: assetId, url }),
        exportState,
        saving,
        texts,
        onChange: (p: RbProject) => {
          setSaving(true);
          if (onChange) onChange(p);
        },
        onClose: () => send(id, { type: "close" }),
        onExport: (format: "docx" | "pdf" | "pptx") => {
          setExportState({ status: "running", format, pct: 0 });
          send(id, { type: "export", format });
        },
        onExportClosed: () => setExportState(null),
        themeArrived,
        onThemeFile: (file: File) => {
          const reader = new FileReader();
          reader.onload = () => send(id, { type: "theme_file", name: file.name, data: String(reader.result || "") });
          reader.readAsDataURL(file);
        }
      }
    : null;

  if (common) {
    return (
      <>
        {value?.kind === "deck" ? <DeckEditor {...common} /> : <ReportEditor {...common} thumbs={thumbs} flag={flag} />}
        {nameDialog}
      </>
    );
  }

  return (
    <div className="cd-rb-home">
      {nameDialog}
      <div className="cd-rb-new">
        <button type="button" className="cd-rb-newcard" onClick={() => setNaming("")}>
          <span className="cd-rb-newcard__icon">
            <Icon d={ICONS.doc} size={22} />
          </span>
          <span className="cd-rb-grow">
            <b>{t("newDocument")}</b>
            <span>{t("newDocumentHint")}</span>
          </span>
          <span className="cd-rb-btn cd-rb-btn--primary">{t("startBlank")}</span>
        </button>
        <button type="button" className="cd-rb-newcard" onClick={() => setNaming(BLANK_DECK)}>
          <span className="cd-rb-newcard__icon cd-rb-newcard__icon--slides">
            <Icon d={["M3 4h18v12H3z", "M12 16v4", "M8 20h8"]} size={22} />
          </span>
          <span className="cd-rb-grow">
            <b>{t("newSlides")}</b>
            <span>{t("newSlidesHint")}</span>
          </span>
          <span className="cd-rb-btn cd-rb-btn--primary">{t("startBlank")}</span>
        </button>
      </div>

      {([
        ["document", t("standardReports"), t("standardHint")],
        ["deck", t("standardDecks"), t("standardDecksHint")]
      ] as ["document" | "deck", string, string][]).map(([kind, title, hint]) => {
        const list = presets.filter((p) => (p.kind || "document") === kind);
        if (!list.length) return null;
        return (
          <section key={kind}>
            <div className="cd-rb-section">
              <b>{title}</b>
              <span>{hint}</span>
            </div>
            <div className="cd-rb-presets">
              {list.map((p) => (
                <button key={p.id} type="button" className={kind === "deck" ? "cd-rb-preset cd-rb-preset--deck" : "cd-rb-preset"} onClick={() => setNaming(p.id)}>
                  <span className="cd-rb-preset__thumb" aria-hidden="true">
                    <span className="cd-rb-preset__page">
                      <span className="cd-rb-preset__band" />
                      <span className="cd-rb-preset__line cd-rb-preset__line--title" />
                      <span className="cd-rb-preset__line" />
                      <span className="cd-rb-preset__chart" />
                    </span>
                  </span>
                  <b>{tr(p.name, lang)}</b>
                  <span>{tr(p.description, lang)}</span>
                  <span className="cd-rb-preset__meta">
                    {p.charts} {t("chartsAndTables")}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      <section>
        <div className="cd-rb-section">
          <b>{t("yourReports")}</b>
          <span>{t("yourReportsHint")}</span>
        </div>
        {projects.length === 0 ? (
          <div className="cd-rb-emptylist">{t("noReports")}</div>
        ) : (
          <div className="cd-rb-list">
            <div className="cd-rb-list__head">
              <span>{t("name")}</span>
              <span>{t("content")}</span>
              <span>{t("lastEdited")}</span>
              <span />
            </div>
            {projects.map((p) => (
              <div key={p.id} className="cd-rb-list__row">
                <button type="button" className="cd-rb-list__name" onClick={() => send(id, { type: "open", project: p.id })}>
                  {p.kind === "deck" ? <span className="cd-rb-format__tag cd-rb-format__tag--pptx">PPT</span> : <span className="cd-rb-format__tag cd-rb-format__tag--docx">DOC</span>}
                  {p.name}
                </button>
                <span>
                  {p.charts} {t("chartsAndTables")} · {p.blocks} {p.kind === "deck" ? t("slidesCount") : t("blocksCount")}
                </span>
                <span>{p.updated}</span>
                <span className="cd-rb-list__actions">
                  <button type="button" className="cd-rb-btn" onClick={() => send(id, { type: "open", project: p.id })}>
                    {t("open")}
                  </button>
                  <button type="button" className="cd-rb-icon" aria-label={t("duplicate")} title={t("duplicate")} onClick={() => send(id, { type: "duplicate", project: p.id })}>
                    <Icon d={ICONS.copy} size={16} />
                  </button>
                  {confirmDelete === p.id ? (
                    <button
                      type="button"
                      className="cd-rb-btn cd-rb-btn--danger"
                      onClick={() => {
                        setConfirmDelete(null);
                        send(id, { type: "delete", project: p.id });
                      }}
                    >
                      {t("confirmDelete")}
                    </button>
                  ) : (
                    <button type="button" className="cd-rb-icon" aria-label={t("delete")} title={t("delete")} onClick={() => setConfirmDelete(p.id)}>
                      <Icon d={ICONS.trash} size={16} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default InputAdapter<Props, RbProject | null>(ReportStudio, (value, setValue) => ({ value, onChange: setValue }));
