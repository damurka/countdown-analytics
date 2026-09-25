import React, { useEffect, useRef } from "react";
import { tr, useLang } from "../../lang";
import type { LocalText } from "../../lang";
import type { RbExportState, RbFinalState, Texts } from "./types";
import { Icon, ICONS } from "./ui";
import { LANGS } from "./Ribbon";

// The report builder's two dialogs: downloading the file, and the final pages (the PDF made from the Word file, page by
// page, so what is checked is what is sent).

type FileFormat = "docx" | "pdf" | "pptx";

/** What each file format is called, and its tag. */
const FORMAT_NAMES: Record<FileFormat, [string, string]> = { docx: ["DOCX", "Word"], pptx: ["PPTX", "PowerPoint"], pdf: ["PDF", "PDF"] };

export function ExportDialog({ format, formats = ["docx", "pdf"], setFormat, exportState, converter, summary, texts, onStart, onClose }: {
  format: FileFormat;
  /** The formats offered: a document's (Word, PDF) or a slide deck's (PowerPoint, PDF). */
  formats?: FileFormat[];
  setFormat: (f: FileFormat) => void;
  exportState: RbExportState | null;
  converter?: string | null;
  summary: string;
  texts: Texts;
  onStart: () => void;
  onClose: () => void;
}) {
  const lang = useLang();
  const t = (k: string) => tr(texts[k] as LocalText, lang) || k;
  const running = exportState && exportState.status === "running";
  const done = exportState && exportState.status === "done";
  const failed = exportState && exportState.status === "error";
  const linkRef = useRef<HTMLAnchorElement>(null);

  // start the browser download once, when the file is ready
  useEffect(() => {
    if (done && exportState?.url && linkRef.current) linkRef.current.click();
  }, [done, exportState?.url]);

  const deck = formats.includes("pptx");
  const pdfNote = deck ? t("pdfFromPowerPoint") : converter ? t("pdfFromWord") : t("pdfFromBrowser");
  const note = (f: FileFormat) => (f === "pdf" ? pdfNote : f === "pptx" ? t("pptxNote") : t("wordNote"));
  return (
    <div className="cd-rb-overlay" role="presentation">
      <div className="cd-rb-dialog" role="dialog" aria-label={t("downloadReport")}>
        <div className="cd-rb-dialog__head">
          <b>{t("downloadReport")}</b>
          <button type="button" className="cd-rb-icon" aria-label={t("close")} onClick={onClose} disabled={!!running}>
            <Icon d={ICONS.close} />
          </button>
        </div>
        <div className="cd-rb-hint">{summary}</div>
        {!running && !done && (
          <>
            <div className="cd-rb-formats" role="group" aria-label={t("format")}>
              {formats.map((f) => (
                <button key={f} type="button" aria-pressed={format === f} className={format === f ? "cd-rb-format cd-rb-format--on" : "cd-rb-format"} onClick={() => setFormat(f)}>
                  <span className={"cd-rb-format__tag cd-rb-format__tag--" + f}>{FORMAT_NAMES[f][0]}</span>
                  <b>{FORMAT_NAMES[f][1]}</b>
                  <span>{note(f)}</span>
                </button>
              ))}
            </div>
            {failed && (
              <div className="cd-rb-warn">
                <Icon d={ICONS.warn} size={16} />
                <span>{exportState?.message}</span>
              </div>
            )}
            <div className="cd-rb-dialog__foot">
              <button type="button" className="cd-rb-btn" onClick={onClose}>
                {t("cancel")}
              </button>
              <button type="button" className="cd-rb-btn cd-rb-btn--primary" onClick={onStart}>
                {format === "docx" ? t("downloadDocx") : format === "pptx" ? t("downloadPptx") : t("downloadPdf")}
              </button>
            </div>
          </>
        )}
        {running && (
          <div className="cd-rb-progress">
            <div className="cd-rb-progress__row">
              <b>{tr(exportState?.stage, lang) || t("preparing")}</b>
              <span>{Math.round((exportState?.pct || 0) * 100)}%</span>
            </div>
            <div className="cd-rb-progress__bar">
              <span style={{ width: `${Math.round((exportState?.pct || 0) * 100)}%` }} />
            </div>
          </div>
        )}
        {done && (
          <>
            <div className="cd-rb-file">
              <span className={"cd-rb-format__tag cd-rb-format__tag--" + exportState?.format}>{FORMAT_NAMES[(exportState?.format || "docx") as FileFormat][0]}</span>
              <span>
                <b>{exportState?.fileName}</b>
                <span className="cd-rb-ok">
                  <Icon d={ICONS.check} size={14} />
                  {t("downloaded")}
                </span>
              </span>
            </div>
            {exportState?.madeBy === "browser" && (
              <div className="cd-rb-warn">
                <Icon d={ICONS.warn} size={16} />
                <span>{t("pdfFromBrowser")}</span>
              </div>
            )}
            {exportState?.format === "docx" && exportState?.madeBy === "word" && <div className="cd-rb-info">{t("wordFinished")}</div>}
            <a ref={linkRef} href={exportState?.url} download={exportState?.fileName} style={{ display: "none" }}>
              {exportState?.fileName}
            </a>
            <div className="cd-rb-dialog__foot">
              <a className="cd-rb-btn" href={exportState?.url} download={exportState?.fileName}>
                {t("downloadAgain")}
              </a>
              <button type="button" className="cd-rb-btn cd-rb-btn--primary" onClick={onClose}>
                {t("done")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function FinalPages({ state, converter, texts, onRefresh, onClose }: { state: RbFinalState; converter?: string | null; texts: Texts; onRefresh: () => void; onClose: () => void }) {
  const lang = useLang();
  const t = (k: string) => tr(texts[k] as LocalText, lang) || k;
  const pages = state.pages || [];
  const program = (state.converter || converter) === "libreoffice" ? "LibreOffice" : "Microsoft Word";
  return (
    <div className="cd-rb-final" role="dialog" aria-label={t("finalPages")}>
      <div className="cd-rb-final__bar">
        <b>{t("finalPages")}</b>
        {state.status === "done" && (
          <span className="cd-rb-final__match">
            <Icon d={ICONS.check} size={15} />
            {t("finalMatch").replace("{n}", String(pages.length)).replace("{program}", program)}
          </span>
        )}
        <span className="cd-rb-grow" />
        <button type="button" className="cd-rb-btn" onClick={onRefresh} disabled={state.status === "running"}>
          {t("refresh")}
        </button>
        <button type="button" className="cd-rb-btn cd-rb-btn--primary" onClick={onClose}>
          {t("backToEditing")}
        </button>
      </div>
      <div className="cd-rb-final__body">
        {state.status === "running" && (
          <div className="cd-rb-final__wait">
            <span className="cd-ring" />
            <b>{t("finalMaking").replace("{program}", program)}</b>
            <div className="cd-rb-progress__bar">
              <span style={{ width: `${Math.round((state.pct || 0) * 100)}%` }} />
            </div>
          </div>
        )}
        {state.status === "error" && (
          <div className="cd-rb-final__wait">
            <Icon d={ICONS.warn} size={22} />
            <b>{state.noConverter ? t("finalNoConverter") : state.message}</b>
          </div>
        )}
        {state.status === "done" &&
          pages.map((src, i) => (
            <figure key={i} className="cd-rb-final__page">
              <img src={src} alt={`${t("page")} ${i + 1}`} />
              <figcaption>
                {t("page")} {i + 1} / {pages.length}
              </figcaption>
            </figure>
          ))}
      </div>
    </div>
  );
}

/** Naming a new report before it is made (the name is how the report is found again later), and choosing its language. */
export function NameDialog({ initial, what, texts, onCreate, onCancel }: { initial: string; what: string; texts: Texts; onCreate: (name: string, lang: "en" | "fr" | "pt") => void; onCancel: () => void }) {
  const lang = useLang();
  const t = (k: string) => tr(texts[k] as LocalText, lang) || k;
  const [name, setName] = React.useState(initial);
  const [reportLang, setReportLang] = React.useState<"en" | "fr" | "pt">(lang === "fr" || lang === "pt" ? lang : "en");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const ok = name.trim().length > 0;
  return (
    <div className="cd-rb-overlay" role="presentation" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <form
        className="cd-rb-dialog"
        role="dialog"
        aria-label={t("nameTitle")}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onCreate(name.trim(), reportLang);
        }}
      >
        <div className="cd-rb-dialog__head">
          <b>{t("nameTitle")}</b>
          <button type="button" className="cd-rb-icon" aria-label={t("close")} onClick={onCancel}>
            <Icon d={ICONS.close} />
          </button>
        </div>
        <div className="cd-rb-hint">{what}</div>
        <label className="cd-rb-field cd-rb-namefield">
          <span>{t("nameLabel")}</span>
          <input ref={input} type="text" className="cd-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <span className="cd-rb-hint">{t("nameHint")}</span>
        </label>
        <div className="cd-rb-field cd-rb-namefield">
          <span>{t("reportLanguage")}</span>
          <div role="radiogroup" aria-label={t("reportLanguage")} className="cd-seg cd-seg--fill">
            {LANGS.map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={reportLang === v} className={reportLang === v ? "cd-seg__btn cd-seg__btn--on" : "cd-seg__btn"} onClick={() => setReportLang(v)}>
                {label}
              </button>
            ))}
          </div>
          <div className="cd-rb-info">{t("languageNote")}</div>
        </div>
        <div className="cd-rb-dialog__foot">
          <button type="button" className="cd-rb-btn" onClick={onCancel}>
            {t("cancel")}
          </button>
          <button type="submit" className="cd-rb-btn cd-rb-btn--primary" disabled={!ok}>
            {t("nameCreate")}
          </button>
        </div>
      </form>
    </div>
  );
}
