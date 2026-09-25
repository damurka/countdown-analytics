import React, { useState } from "react";
import { currentLink, setLink } from "../RichText";
import { ImagePicker } from "../panels";
import type { RbDesign } from "../types";
import { Icon, ICONS } from "../ui";
import { Big, Drop, keep, Small } from "../kit/controls";

// The menus under the ribbon's Insert buttons (a picture, a link, the header and footer) and the number box of the
// Layout tab.

/** Insert a picture: from this computer, or from a web address (downloaded by R and kept in the dataset). */
export function PictureMenu({ t, onFile, onUrl }: { t: (k: string) => string; onFile: (img: { src: string; ratio: number }) => void; onUrl: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const go = (close: () => void) => {
    const u = url.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) return;
    onUrl(u);
    setUrl("");
    close();
  };
  return (
    <Drop width={320} trigger={(open, toggle) => <Big icon={ICONS.picture} label={t("image")} menu on={open} onClick={toggle} tone="blue" />}>
      {(close) => (
        <div className="cd-rb-hfmenu">
          <ImagePicker
            label={t("pictureFromFile")}
            className="cd-rb-mitem"
            onPick={(img) => {
              onFile(img);
              close();
            }}
          >
            <Icon d={ICONS.picture} size={16} />
            <span>{t("pictureFromFile")}</span>
          </ImagePicker>
          <label>
            <span>{t("pictureFromUrl")}</span>
            <input
              type="url"
              className="cd-input"
              value={url}
              placeholder="https://"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  go(close);
                }
              }}
            />
          </label>
          <span className="cd-rb-hint">{t("pictureUrlHint")}</span>
          <div className="cd-rb-linkbtns">
            <button type="button" className="cd-rb-btn cd-rb-btn--primary" disabled={!/^https?:\/\/\S+$/i.test(url.trim())} onMouseDown={keep} onClick={() => go(close)}>
              {t("insert")}
            </button>
          </div>
        </div>
      )}
    </Drop>
  );
}

/** A link on the selected text: its address typed in the menu under the button (Enter applies it). */
export function LinkMenu({ t, disabled, small }: { t: (k: string) => string; disabled?: boolean; small?: boolean }) {
  const [href, setHref] = useState("");
  const icon = ["M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1", "M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"];
  return (
    <Drop
      width={300}
      trigger={(open, toggle) =>
        small ? (
          <Small icon={icon} label={t("link")} on={open} disabled={disabled} onClick={() => { setHref(currentLink()); toggle(); }} />
        ) : (
          <Big icon={icon} label={t("link")} menu on={open} disabled={disabled} onClick={() => { setHref(currentLink()); toggle(); }} />
        )
      }
    >
      {(close) => (
        <div className="cd-rb-hfmenu">
          <label>
            <span>{t("linkAddress")}</span>
            <input
              type="text"
              className="cd-input"
              value={href}
              placeholder="https://"
              autoFocus
              onChange={(e) => setHref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setLink(href);
                  close();
                }
              }}
            />
          </label>
          <div className="cd-rb-linkbtns">
            <button type="button" className="cd-rb-btn cd-rb-btn--primary" onMouseDown={keep} onClick={() => { setLink(href); close(); }}>
              {t("apply")}
            </button>
            <button type="button" className="cd-rb-btn" onMouseDown={keep} onClick={() => { setLink(""); close(); }}>
              {t("removeLink")}
            </button>
          </div>
        </div>
      )}
    </Drop>
  );
}

/** A number box with its label and unit, as in Word's Layout tab. */
export function NumberField({ icon, label, unit, step, value, disabled, onChange }: { icon: string[]; label: string; unit: string; step: number; value: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className="cd-rb-numfield" title={label}>
      <Icon d={icon} size={15} />
      <span>{label}</span>
      <input type="number" min={0} step={step} value={Math.round(value * 100) / 100} disabled={disabled} aria-label={label} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
      <small>{unit}</small>
    </label>
  );
}

/** Header or footer: its text (fields allowed) edited in a menu under the button. */
export function HeaderFooterMenu({ which, design, t, onDesign }: { which: "header" | "footer"; design: RbDesign; t: (k: string) => string; onDesign: (patch: Partial<RbDesign>) => void }) {
  return (
    <Drop width={320} trigger={(open, toggle) => <Big icon={which === "header" ? ICONS.header : ICONS.footer} label={t(which)} menu on={open} onClick={toggle} />}>
      {() => (
        <div className="cd-rb-hfmenu">
          <label>
            <span>{t(which)}</span>
            <input type="text" className="cd-input" value={design[which]} onChange={(e) => onDesign({ [which]: e.target.value } as Partial<RbDesign>)} />
          </label>
          <span className="cd-rb-hint">{t("headerHint")}</span>
          <button type="button" className="cd-rb-btn cd-rb-btn--small" onClick={() => onDesign({ [which]: "" } as Partial<RbDesign>)}>
            {t("remove")}
          </button>
        </div>
      )}
    </Drop>
  );
}
