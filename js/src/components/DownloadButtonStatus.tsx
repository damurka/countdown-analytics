import React, { useEffect, useRef, useState } from "react";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";


export interface DownloadButtonStatusProps {
  id: string;
  /** Resolved Font Awesome class, e.g. "far fa-download" -- see cd_icon_class() (cd-react.R). */
  icon: string;
  label: LocalText;
  /** Shown next to the spinner while a download is in progress; falls back to `label` if omitted. */
  busyLabel?: LocalText;
  /** No visible text at all, icon (or spinner) only -- most download buttons in this app are compact toolbar
   *  icons over a chart/table, not labeled buttons; matches cd_download_button_server()'s own icon_only default. */
  iconOnly?: boolean;
}

export default function DownloadButtonStatus({ id, icon, label, busyLabel, iconOnly }: DownloadButtonStatusProps) {
  const lang = useLang();
  // The in-progress message from the server (session$sendCustomMessage("starting_download", ...)), or null
  // when idle. Kept as the message text itself, not just a boolean, so a caller-supplied message (msg.message)
  // can override the static busyLabel prop exactly like the old jQuery version's msg.message did.
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const shiny = window.Shiny;
    if (!shiny || !shiny.addCustomMessageHandler) return;
    // Shiny.addCustomMessageHandler has no matching "remove" call -- every handler for a message TYPE stays
    // registered for the app's lifetime, true of every other addCustomMessageHandler in this app (e.g. lang.ts's
    // "cd-lang" listener). Harmless: each instance's own handler below no-ops on any other button's id, the
    // same way the old jQuery version's `$("#" + msg.id)` lookup did.
    shiny.addCustomMessageHandler("starting_download", (raw: unknown) => {
      const msg = raw as { id: string; message?: string };
      if (msg.id === id) setBusyMessage(msg.message || "");
    });
    shiny.addCustomMessageHandler("end_download", (raw: unknown) => {
      const msg = raw as { id: string };
      if (msg.id === id) setBusyMessage(null);
    });
  }, [id]);

  // The one bit of DOM reaching-out this component does: the <a> around it is Shiny's own server-rendered
  // element (see the file header above), not React's, so busy/disabled has to be applied to it directly
  // rather than through a prop -- the same interop the old jQuery version needed, just scoped to this
  // component's own known parent instead of a global "#" + id lookup.
  useEffect(() => {
    const a = ref.current?.closest("a");
    if (!a) return;
    a.classList.toggle("cd-button--busy", busyMessage != null);
    if (busyMessage != null) a.setAttribute("aria-busy", "true");
    else a.removeAttribute("aria-busy");
  }, [busyMessage]);

  return (
    <span ref={ref} className="cd-button__content">
      {busyMessage != null ? (
        <>
          <span className="cd-button__spinner" aria-hidden="true" />
          {!iconOnly && <span>{busyMessage || tr(busyLabel, lang) || tr(label, lang)}</span>}
        </>
      ) : (
        <>
          <i className={icon} aria-hidden="true" />
          {!iconOnly && <span>{tr(label, lang)}</span>}
        </>
      )}
    </span>
  );
}
