import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

// Text formatting for the ribbon and the toolbar over selected text, on the report's editor (flow/extensions.ts).
// Every command keeps the editor's selection: the ribbon's buttons act on mouse down, and the editor keeps its
// selection when a box or menu takes the focus.

let active: Editor | null = null;
// the builder's own editor, and the text boxes typed in over it (a text box on a free page of a document): the commands
// act on the last one opened, and on the builder's again when it closes
let base: Editor | null = null;
let stack: Editor[] = [];

/** The editor the commands act on (set by the report editor while it is open). */
export function setActiveEditor(editor: Editor | null) {
  base = editor;
  if (!stack.length) active = editor;
}

/** A text box being typed in: the commands act on it until it closes. */
export function pushActiveEditor(editor: Editor) {
  stack = stack.filter((e) => e !== editor).concat([editor]);
  active = editor;
}
export function popActiveEditor(editor: Editor) {
  stack = stack.filter((e) => e !== editor);
  active = stack[stack.length - 1] || base;
}

export function activeEditor(): Editor | null {
  return active && !active.isDestroyed ? active : null;
}

const chain = () => activeEditor()?.chain().focus();

export function format(command: "bold" | "italic" | "underline" | "removeFormat") {
  const c = chain();
  if (!c) return;
  if (command === "bold") c.toggleBold().run();
  else if (command === "italic") c.toggleItalic().run();
  else if (command === "underline") c.toggleUnderline().run();
  else c.unsetAllMarks().run();
}

export function formatMore(command: "strikeThrough" | "subscript" | "superscript") {
  const c = chain();
  if (!c) return;
  if (command === "strikeThrough") c.toggleStrike().run();
  else if (command === "subscript") c.unsetSuperscript().toggleSubscript().run();
  else c.unsetSubscript().toggleSuperscript().run();
}

export function fontFamily(family: string) {
  chain()?.setFontFamily(family).run();
}

/** Any size, in points (as the Word file has it). */
export function fontSize(pt: number) {
  chain()?.setFontSize(Math.round(pt * 2) / 2 + "pt").run();
}

/** The background behind the selected text ("" removes it). */
export function highlight(hex: string) {
  const c = chain();
  if (!c) return;
  if (hex) c.setBackgroundColor(hex).run();
  else c.unsetBackgroundColor().run();
}

export function colour(hex: string) {
  chain()?.setColor(hex).run();
}

/** UPPERCASE, lowercase, Sentence case or Capitalise Each Word, on the selected text, keeping its formatting. */
export function changeCase(mode: "upper" | "lower" | "sentence" | "title") {
  const ed = activeEditor();
  if (!ed) return;
  const { from, to, empty } = ed.state.selection;
  if (empty) return;
  const tr = ed.state.tr;
  let start = true;
  ed.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return;
    const a = Math.max(from, pos);
    const b = Math.min(to, pos + node.text.length);
    const text = node.text.slice(a - pos, b - pos);
    let out = text.toLowerCase();
    if (mode === "upper") out = text.toUpperCase();
    else if (mode === "title") out = out.replace(/(^|\s)(\p{L})/gu, (_m, s, l) => s + l.toUpperCase());
    else if (mode === "sentence") {
      out = out.replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, (m, _x, offset) => (offset === 0 && !start ? m : m.toUpperCase()));
      start = false;
    }
    if (out !== text) tr.replaceWith(a, b, ed.schema.text(out, node.marks));
  });
  if (tr.docChanged) ed.view.dispatch(tr);
  ed.commands.focus();
}

// ---- the format painter (Word's): the formatting of the text where the caret is, put on the next text selected;
// once, or until it is turned off when it was double-clicked ----
let painter: { marks: readonly Mark[]; sticky: boolean } | null = null;
const painterListeners = new Set<() => void>();
const painterChanged = () => {
  document.documentElement.classList.toggle("cd-rb-painting", !!painter);
  painterListeners.forEach((fn) => fn());
};
export const painting = () => !!painter;
export function onPainter(fn: () => void): () => void {
  painterListeners.add(fn);
  return () => painterListeners.delete(fn);
}
/** Copy the formatting (a second click turns it off; `sticky`: it stays on for several texts). */
export function copyFormat(sticky = false) {
  const ed = activeEditor();
  if (!ed) return;
  if (painter && !sticky) {
    painter = null;
    painterChanged();
    return;
  }
  const { from, to, empty } = ed.state.selection;
  const marks = empty ? ed.state.storedMarks || ed.state.selection.$from.marks() : ed.state.doc.resolve(Math.min(from + 1, to)).marks();
  painter = { marks: marks.filter((m) => m.type.name !== "link"), sticky };
  painterChanged();
}
/** Put the copied formatting on the selected text (a link is kept). */
export function pasteFormat(): boolean {
  const ed = activeEditor();
  if (!ed || !painter) return false;
  const { from, to, empty } = ed.state.selection;
  if (empty || ed.state.selection instanceof NodeSelection) return false;
  const tr = ed.state.tr;
  Object.values(ed.schema.marks).forEach((type) => type.name !== "link" && tr.removeMark(from, to, type));
  painter.marks.forEach((m) => tr.addMark(from, to, m));
  ed.view.dispatch(tr);
  if (!painter.sticky) painter = null;
  painterChanged();
  return true;
}
export function stopPainter() {
  if (!painter) return;
  painter = null;
  painterChanged();
}

/** The font and size of the text where the caret is, as the browser draws it (what the ribbon's boxes show). */
export function caretFont(): { family: string; size: number } | null {
  const ed = activeEditor();
  if (!ed || !ed.view.dom.isConnected) return null;
  const sel = ed.state.selection;
  if (sel instanceof NodeSelection) return null;
  const at = ed.view.domAtPos(sel.from);
  let el: Node | null = at.node;
  if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  if (!el || !(el instanceof Element)) return null;
  const cs = getComputedStyle(el);
  return { family: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(), size: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2 };
}

/** The link where the caret is ("" when none). */
export function currentLink(): string {
  const ed = activeEditor();
  return ed ? ((ed.getAttributes("link").href as string) || "") : "";
}

/** Make the selected text a link (or change the link the caret is in); "" removes it. A link typed without its scheme
 *  gets https://. With nothing selected, the address itself is inserted as the link. */
export function setLink(href: string) {
  const ed = activeEditor();
  if (!ed) return;
  const url = href.trim();
  if (!url) {
    ed.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  const full = /^(https?:\/\/|mailto:)/i.test(url) ? url : url.includes("@") && !url.includes("/") ? "mailto:" + url : "https://" + url;
  if (ed.state.selection.empty && !ed.isActive("link")) {
    ed.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: full } }] }).run();
    return;
  }
  ed.chain().focus().extendMarkRange("link").setLink({ href: full }).run();
}

/** Insert a field ({country}...) where the caret is. */
export function insertField(key: string, _value?: string) {
  chain()?.insertContent({ type: "field", attrs: { key } }).run();
}

/** The editor's element when text is being edited (not a chart or picture selected). */
export function editingText(): HTMLElement | null {
  const ed = activeEditor();
  if (!ed || !ed.isEditable || ed.state.selection instanceof NodeSelection) return null;
  return ed.view.dom as HTMLElement;
}
