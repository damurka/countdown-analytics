import React from "react";
import StatusIcon from "./StatusIcon";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// One status banner: icon + bold title + description, filename in monospace if given. The single canonical
// implementation of this pattern -- upload_box.R used to build its own copy of this directly as R-rendered SVG
// + div markup (cd_icon_check_circle()/cd_icon_alert_circle(), .cd-status-banner), and MessageBoxStatus.tsx
// very nearly built a second, separate one; both now render through this, mounted via cd_status_banner() (one
// banner) or cd_message_box() (a stacked list of these) in _shared/R/core (and components/).

export interface StatusBannerProps {
  status: string;
  title?: LocalText;
  description?: LocalText;
  /** A filename or similar short fragment shown in monospace at the start of the description (upload_box.R's
   *  own "Tanzania_CAM2026.rds is ready." pattern) -- kept separate from `description` so it gets its own font
   *  without needing HTML embedded in a translation string. */
  file?: string;
  /** Preserve literal whitespace/newlines in the description (a raw error message/log line) instead of
   *  collapsing it the way a normal line of text would. */
  usePre?: boolean;
}

export default function StatusBanner({ status, title, description, file, usePre }: StatusBannerProps) {
  const lang = useLang();
  const Desc = usePre ? "pre" : "div";
  const descText = description ? tr(description, lang) : "";

  return (
    <div className={`cd-status-banner cd-status-banner--${status}`} role={status === "error" ? "alert" : "status"}>
      <StatusIcon status={status} />
      <div className="cd-status-banner__body">
        {title != null && <div className="cd-status-banner__title">{tr(title, lang)}</div>}
        {(file || descText) && (
          <Desc className="cd-status-banner__desc">
            {file && <span className="cd-status-banner__file">{file}</span>}
            {file && descText ? " " : null}
            {descText}
          </Desc>
        )}
      </div>
    </div>
  );
}
