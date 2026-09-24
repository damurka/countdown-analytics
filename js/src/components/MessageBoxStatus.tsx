import React, { useEffect, useRef, useState } from "react";
import StatusBanner from "./StatusBanner";
import { tr, useLang, useMountSignal, useShinyMessage } from "../lang";
import type { LocalText } from "../lang";

// The stacked feedback list cd_message_ui()/cd_message_server() (_shared/R/components/message-box.R) shows under an upload control
// or similar -- was a plain jQuery-appended <div> stack (www/messagebox/messagebox.js), replaced here the same
// way DownloadButtonStatus.tsx replaced download-button.js: cd_message_server()'s own public API (add_message()/
// update_message()/clear_messages()) sends the same "messagebox" custom message it always has, now with an
// added `title`, and this renders each one as a StatusBanner (the same component upload_box.R's own single
// banner uses via cd_status_banner() -- one icon+title+description implementation, not two). Not an InputAdapter
// component: this has no value to sync back to Shiny, it only displays.

export interface MessageBoxStatusProps {
  /** Matches cd_message_server()'s own `rootId` (ns("body")) -- every "messagebox" message carries this, and a
   *  page can have several message boxes at once, so each instance only reacts to its own. */
  id: string;
}

interface BoxMessage {
  key: number;
  // {en,fr,pt}, not a resolved string -- cd_message_server() (R: _shared/R/components/message-box.R) sends the same per-language
  // object every other piece of text in this app does (cd_text()), specifically so a language switch re-renders
  // this correctly instead of freezing it in whatever language was active when the message first arrived.
  title: LocalText;
  text: LocalText;
  status: string;
  usePre: boolean;
}

// Module-level, not component state: messages are append-only within one box and the box clears as a whole
// (never removes just one), so a simple ever-increasing counter is enough for stable React keys without
// needing to reset per instance.
let nextKey = 0;

export default function MessageBoxStatus({ id }: MessageBoxStatusProps) {
  // Sends input$<id>__mounted the moment this box exists in the DOM -- cd_message_server() (R: _shared/R/components/message-box.R)
  // queues its own sends (add_message()/update_message()/clear_messages()) until it hears this, for exactly
  // the reason FileUploadZone.tsx and FieldNumber.tsx/FieldSelect.tsx already needed the same signal: a plain
  // "messagebox" custom message has no listener at all until an instance mounts and registers the handler
  // below, and Shiny's addCustomMessageHandler doesn't replay anything sent before that -- it's just gone.
  // cd_message_server()'s own default_message add_message() call fires at module-init time, in the session's
  // very first reactive flush, before the client has had any chance to mount this component at all -- every
  // message box in the app was losing that first message outright until cd_message_server() started waiting
  // for this.
  useMountSignal(id);
  const lang = useLang();
  const [messages, setMessages] = useState<BoxMessage[]>([]);
  const stackRef = useRef<HTMLDivElement>(null);

  // Was each instance calling Shiny.addCustomMessageHandler("messagebox", ...) directly, no-oping on any other
  // box's rootId -- that no-op-on-mismatch logic was never actually reached for most boxes on a page: Shiny
  // only keeps ONE handler per message type at all (see useShinyMessage()'s own comment, lang.ts), so every
  // registration but the LAST one to mount silently replaced -- not ignored -- every earlier one. A page with
  // several message boxes (nearly every page in this app) had at most one of them ever receiving anything.
  useShinyMessage("messagebox", "rootId", id, (raw) => {
    const msg = raw as { action: string; text?: LocalText; title?: LocalText; status?: string; usePre?: boolean };
    if (msg.action === "clear") {
      setMessages([]);
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        key: nextKey++,
        title: msg.title,
        text: msg.text,
        status: msg.status || "info",
        usePre: !!msg.usePre,
      },
    ]);
  });

  // Same as the old $stack.scrollTop($stack[0].scrollHeight) -- keep the newest message in view once the
  // stack scrolls (styles.css caps it at max-height:240px).
  useEffect(() => {
    const el = stackRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div ref={stackRef} id={id} className="messages-stack" aria-live="polite" aria-atomic="false">
      {messages.map((m) => (
        <StatusBanner key={m.key} status={m.status} title={tr(m.title, lang) || undefined} description={tr(m.text, lang)} usePre={m.usePre} />
      ))}
    </div>
  );
}
