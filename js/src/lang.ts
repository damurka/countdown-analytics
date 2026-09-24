import { useEffect, useRef, useState } from "react";

// Text inside a React component is not touched by the app's DOM-scanning translator, so every piece of
// text a component shows arrives from R in all languages, { en, fr, pt }, and the component picks one.
// The current language is window.cdLang. R sets the first value in the page head and sends a "cd-lang"
// message whenever the language changes, which re-renders every component at once.
export type LocalText = string | Record<string, string> | null | undefined;

interface ShinyGlobal {
  // Shiny's own addCustomMessageHandler is generic -- session$sendCustomMessage() can send any JSON payload,
  // not just a string (e.g. DownloadButtonStatus.tsx's "starting_download"/"end_download" send {id, message}
  // objects). `unknown` here, narrowed by each caller to whatever shape its own message actually carries,
  // rather than the single string type this only had callers for until now.
  addCustomMessageHandler?: (type: string, handler: (message: unknown) => void) => void;
  setInputValue?: (name: string, value: unknown, options?: { priority?: string }) => void;
  // Shiny's own generic DOM-scanning input binder -- scope is an Element (or the whole document if omitted).
  // FileUploadZone.tsx calls these directly (see its own comment) rather than relying on shiny.react's
  // ShinyBindingWrapper, which is meant to call these automatically but never actually fires for it.
  bindAll?: (scope?: Element) => void;
  initializeInputs?: (scope?: Element) => void;
  unbindAll?: (scope?: Element) => void;
}

declare global {
  interface Window {
    cdLang?: string;
    Shiny?: ShinyGlobal & Record<string, unknown>;
    /** shiny.react's registry of components; ours is registered under "@/countdown" in index.ts. */
    jsmodule?: Record<string, unknown>;
  }
}

const EVENT = "cd-lang";

export const currentLang = (): string => window.cdLang || document.documentElement.lang || "en";

export function tr(text: LocalText, lang: string): string {
  if (text == null) return "";
  if (typeof text === "string") return text;
  return text[lang] ?? text.en ?? Object.values(text)[0] ?? "";
}

export function useLang(): string {
  const [lang, setLang] = useState(currentLang);
  useEffect(() => {
    const onChange = () => setLang(currentLang());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return lang;
}

// Shiny may finish loading after this bundle, so retry briefly instead of assuming an order.
function registerLanguageHandler(): boolean {
  const shiny = window.Shiny;
  if (!shiny || !shiny.addCustomMessageHandler) return false;
  shiny.addCustomMessageHandler(EVENT, (lang: unknown) => {
    window.cdLang = lang as string;
    window.dispatchEvent(new Event(EVENT));
  });
  return true;
}

if (!registerLanguageHandler()) {
  const timer = setInterval(() => {
    if (registerLanguageHandler()) clearInterval(timer);
  }, 50);
  setTimeout(() => clearInterval(timer), 10000);
}

// A message R sends to a component that has not mounted yet is lost. Each component tells Shiny when it has
// mounted, as input$<id>__mounted, so R can wait for it before pushing a value (see cd_mounted() in cd-react.R).
export function useMountSignal(id?: string): void {
  useEffect(() => {
    if (id && window.Shiny && window.Shiny.setInputValue) {
      window.Shiny.setInputValue(`${id}__mounted`, Date.now(), { priority: "event" });
    }
  }, [id]);
}

// Shiny.addCustomMessageHandler(type, handler) keeps only ONE handler per `type` globally -- a second call for
// the same type silently replaces the first (confirmed against Shiny's own source: it deletes the prior entry
// before installing the new one). That's fine for a message type exactly one thing on the page ever cares
// about, but wrong for one that MANY mounted instances of the same component all need (MessageBoxStatus.tsx:
// every cd_message_ui() on a page shares the "messagebox" type, keyed by rootId; FileUploadZone.tsx similarly
// shares "cd-file-reset", keyed by inputId) -- each instance calling addCustomMessageHandler() directly, the
// way registerLanguageHandler() above does for the one-listener "cd-lang" case, means only the LAST one to
// mount ever receives anything again, every earlier registration silently overwritten. This registers exactly
// one real Shiny handler per `type` (the same retry-until-Shiny-exists approach as registerLanguageHandler()),
// and fans each incoming message out by `keyField` (a field in the message payload, e.g. "rootId"/"inputId")
// to every currently-subscribed listener for that key -- the same "one registration, many listeners" shape
// cd-lang already gets via window.dispatchEvent, generalized to a per-key message instead of a broadcast.
const dispatchersByType: Record<string, Map<string, Set<(msg: Record<string, unknown>) => void>>> = {};

function ensureDispatcherRegistered(type: string, keyField: string): void {
  if (dispatchersByType[type]) return;
  dispatchersByType[type] = new Map();
  const register = (): void => {
    const shiny = window.Shiny;
    if (!shiny || !shiny.addCustomMessageHandler) {
      setTimeout(register, 50);
      return;
    }
    shiny.addCustomMessageHandler(type, (raw: unknown) => {
      const msg = raw as Record<string, unknown>;
      const key = msg[keyField] as string;
      dispatchersByType[type].get(key)?.forEach((cb) => cb(msg));
    });
  };
  register();
}

// Subscribes `callback` to Shiny custom messages of `type` whose `keyField` equals `key` -- see
// ensureDispatcherRegistered()'s own comment for why this exists instead of calling
// Shiny.addCustomMessageHandler() directly from each mounted instance. `callback` is read through a ref so a
// new inline function identity on every render doesn't force a resubscribe -- only `type`/`keyField`/`key`
// changing does.
export function useShinyMessage(type: string, keyField: string, key: string | undefined, callback: (msg: Record<string, unknown>) => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  useEffect(() => {
    if (!key) return undefined;
    ensureDispatcherRegistered(type, keyField);
    const byKey = dispatchersByType[type];
    if (!byKey.has(key)) byKey.set(key, new Set());
    const wrapped = (msg: Record<string, unknown>) => callbackRef.current(msg);
    byKey.get(key)!.add(wrapped);
    return () => {
      byKey.get(key)?.delete(wrapped);
    };
  }, [type, keyField, key]);
}
