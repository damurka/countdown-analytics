import { useEffect, useState } from "react";

// Text inside a React component is not touched by the app's DOM-scanning translator, so every piece of
// text a component shows arrives from R in all languages, { en, fr, pt }, and the component picks one.
// The current language is window.cdLang. R sets the first value in the page head and sends a "cd-lang"
// message whenever the language changes, which re-renders every component at once.
export type LocalText = string | Record<string, string> | null | undefined;

interface ShinyGlobal {
  addCustomMessageHandler?: (type: string, handler: (message: string) => void) => void;
  setInputValue?: (name: string, value: unknown, options?: { priority?: string }) => void;
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
  shiny.addCustomMessageHandler(EVENT, (lang: string) => {
    window.cdLang = lang;
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
// mounted, as input$<id>__mounted, so R can wait for it before pushing a value (see cdMounted() in cd-react.R).
export function useMountSignal(id?: string): void {
  useEffect(() => {
    if (id && window.Shiny && window.Shiny.setInputValue) {
      window.Shiny.setInputValue(`${id}__mounted`, Date.now(), { priority: "event" });
    }
  }, [id]);
}
