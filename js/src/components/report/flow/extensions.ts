import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import FileHandler from "@tiptap/extension-file-handler";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import type { Editor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { RbBlock } from "../types";
import { BlockView } from "./BlockView";
import { Pagination } from "./pages";
import type { PageGeometry, PageLayoutResult } from "./pages";

// The report as one TipTap (ProseMirror) document: text is edited as in a word processor across paragraphs, and the
// report's charts, tables and pictures are parts inside it ("rbBlock", drawn by R). Everything here is MIT-licensed
// TipTap; no Pro extension or TipTap account is used.
//
// Every top-level node carries `bid`, the id of the block it is saved as (flow/convert.ts), and the paragraph settings
// a block has in the Word file (indents in cm, space before/after in pt, line spacing). Space before and after are
// margins: where they meet, the larger counts, as in Word.

/** The node types that are blocks of the report (top level of the document). */
export const BLOCK_NODES = ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "codeBlock", "note", "pageBreak", "rbBlock"];
/** The ones whose paragraph settings can be changed. */
const PARA_NODES = ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "note"];

let counter = 0;
export const newBid = () => "b" + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 5);

const num = (v: string | null) => (v === null || v === "" || isNaN(Number(v)) ? null : Number(v));

/** Block ids and paragraph settings on the top-level nodes. */
const BlockAttrs = Extension.create({
  name: "rbBlockAttrs",
  addGlobalAttributes() {
    return [
      {
        types: BLOCK_NODES,
        attributes: {
          bid: { default: null, parseHTML: (el) => el.getAttribute("data-bid"), renderHTML: (a) => (a.bid ? { "data-bid": a.bid } : {}) }
        }
      },
      {
        types: PARA_NODES,
        attributes: {
          indent_left: { default: null, parseHTML: (el) => num(el.getAttribute("data-indent-left")), renderHTML: (a) => (a.indent_left ? { "data-indent-left": a.indent_left, style: `margin-left: ${a.indent_left}cm` } : {}) },
          indent_right: { default: null, parseHTML: (el) => num(el.getAttribute("data-indent-right")), renderHTML: (a) => (a.indent_right ? { "data-indent-right": a.indent_right, style: `margin-right: ${a.indent_right}cm` } : {}) },
          space_before: { default: null, parseHTML: (el) => num(el.getAttribute("data-space-before")), renderHTML: (a) => (a.space_before ? { "data-space-before": a.space_before, style: `margin-top: ${a.space_before}pt` } : {}) },
          space_after: { default: null, parseHTML: (el) => num(el.getAttribute("data-space-after")), renderHTML: (a) => (a.space_after !== null && a.space_after !== undefined ? { "data-space-after": a.space_after, style: `margin-bottom: ${a.space_after}pt` } : {}) },
          line: { default: null, parseHTML: (el) => num(el.getAttribute("data-line")), renderHTML: (a) => (a.line ? { "data-line": a.line, style: `line-height: ${a.line * 1.2}` } : {}) }
        }
      }
    ];
  },
  // every block has its own id: new ones get one, and a copy (a split paragraph, a pasted chart) gets a new one
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("rbBlockIds"),
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((tr) => tr.docChanged)) return null;
          const seen = new Set<string>();
          let tr = state.tr;
          let changed = false;
          state.doc.forEach((node, offset) => {
            if (!BLOCK_NODES.includes(node.type.name)) return;
            let bid = node.attrs.bid as string | null;
            if (!bid || seen.has(bid)) {
              bid = newBid();
              tr = tr.setNodeAttribute(offset, "bid", bid);
              changed = true;
            }
            seen.add(bid);
          });
          return changed ? tr.setMeta("addToHistory", false) : null;
        }
      })
    ];
  }
});

/** A notes box: shaded, with a border, holding paragraphs and lists (as the Word file's Notes Box style). */
export const Note = Node.create({
  name: "note",
  group: "block",
  content: "(paragraph | bulletList | orderedList)+",
  defining: true,
  parseHTML: () => [{ tag: 'div[data-type="note"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "note", class: "cd-rb-note" }), 0]
});

/** A page break: what follows starts a new page. */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-type="page-break"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "page-break", class: "cd-rb-break" })]
});

/** A chart, table or picture: the whole block in `block` (what R draws from), shown by BlockView. */
export const RbBlockNode = Node.create({
  name: "rbBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({
    block: {
      default: {},
      parseHTML: (el) => {
        try {
          return JSON.parse(el.getAttribute("data-rb-block") || "{}");
        } catch (e) {
          return {};
        }
      },
      renderHTML: (a) => ({ "data-rb-block": JSON.stringify(a.block || {}) })
    }
  }),
  parseHTML: () => [{ tag: "div[data-rb-block]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", HTMLAttributes],
  addNodeView() {
    // the element holding the view is the node's own: it is what floats (side by side, text wrapped around it)
    return ReactNodeViewRenderer(BlockView, {
      // a free page's boxes handle their own mouse and keys; the document leaves them alone
      stopEvent: ({ event }) => !!(event.target as HTMLElement | null)?.closest?.(".cd-rb-canvaspage"),
      attrs: ({ node }) => {
        const b = (node.attrs.block || {}) as RbBlock;
        const side = (b.type === "chart" || b.type === "image") && (b.size === "half" || b.size === "third");
        const wrap = (b.type === "image" || b.type === "chart") && (b.size || "full") === "full" && (b.wrap === "left" || b.wrap === "right") ? b.wrap : "";
        const cls = ["react-renderer", "node-rbBlock", "cd-rb-block--data", b.type === "canvas" ? "cd-rb-block--canvas" : "", side ? "cd-rb-side cd-rb-block--" + b.size : "", wrap ? "cd-rb-block--wrap cd-rb-block--wrap-" + wrap : ""];
        // a picture's (or chart's) space around it (pt), as the Word file keeps it: above and below; beside it when text
        // wraps
        const pt = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
        let style = "";
        if (b.type === "image" || b.type === "chart") {
          const top = pt(b.space_top, 0);
          if (wrap) {
            const bottom = pt(b.space_bottom, 5.65);
            const beside = pt(b.space_side, 8.5);
            style = wrap === "left" ? `margin: ${top}pt ${beside}pt ${bottom}pt 0 !important` : `margin: ${top}pt 0 ${bottom}pt ${beside}pt !important`;
          } else if (!side) {
            style = `margin-top: ${top}pt; margin-bottom: ${pt(b.space_bottom, 4)}pt`;
          }
        }
        return { class: cls.filter(Boolean).join(" "), style };
      }
    });
  }
});

/** What a field shows ({country} -> Benin): set by the editor, read by the chips. */
let fieldValues: Record<string, string> = {};
/** What {chart_indicator} / {chart_year} show for a chart, and how {chart_indicators} lists names (set by the editor). */
let chartValue: (block: RbBlock, key: string) => string | undefined = () => undefined;
let chartJoin: (names: string[]) => string = (names) => names.join(", ");
export function setChartFieldValue(fn: (block: RbBlock, key: string) => string | undefined, join?: (names: string[]) => string) {
  chartValue = fn;
  if (join) chartJoin = join;
}

/** Names as a list in a language: "A", "A and B", "A, B and C" (`and`: that word). */
export const joinAnd = (names: string[], and: string) =>
  names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " " + and + " " + names[names.length - 1];

/** A field's value where it is: {chart_...} fields are about the first chart or table after them in the report. */
function fieldAt(key: string, doc: PmNode | null, pos: number | undefined): string | undefined {
  if (!key.startsWith("chart_")) return fieldValues[key];
  if (!doc || pos === undefined || pos < 0) return undefined;
  if (key === "chart_indicators") {
    // the indicators of the charts and tables after it, up to the next heading (as cd2030.core's report_chart_fields())
    const names: string[] = [];
    let stop = false;
    doc.nodesBetween(pos, doc.content.size, (n, at) => {
      if (stop) return false;
      if (n.type.name === "heading" && at > pos) {
        stop = true;
        return false;
      }
      if (n.type.name !== "rbBlock") return true;
      const b = n.attrs.block as RbBlock | null;
      if (b && (b.type === "chart" || b.type === "table")) {
        const name = chartValue({ ...b, id: n.attrs.bid as string }, "chart_indicator");
        if (name && !names.includes(name)) names.push(name);
      }
      return false;
    });
    return names.length ? chartJoin(names) : undefined;
  }
  let found: RbBlock | null = null;
  doc.nodesBetween(pos, doc.content.size, (n) => {
    if (found) return false;
    if (n.type.name !== "rbBlock") return true;
    const b = n.attrs.block as RbBlock | null;
    if (b && (b.type === "chart" || b.type === "table")) found = { ...b, id: n.attrs.bid as string };
    return false;
  });
  return found ? chartValue(found, key) : undefined;
}

export function setFieldValues(values: Record<string, string>, root?: HTMLElement | null, editor?: Editor | null) {
  fieldValues = values || {};
  root?.querySelectorAll<HTMLElement>("span[data-field]").forEach((el) => {
    const key = el.getAttribute("data-field") || "";
    let pos: number | undefined;
    if (key.startsWith("chart_") && editor && !editor.isDestroyed) {
      try {
        pos = editor.view.posAtDOM(el, 0);
      } catch {
        pos = undefined;
      }
    }
    const value = fieldAt(key, editor && !editor.isDestroyed ? editor.state.doc : null, pos);
    el.textContent = value ?? "{" + key + "}";
    el.classList.toggle("cd-rb-chip--empty", value === undefined);
  });
}

/** The chips shown again with the values they have now (the chart below a text may have changed). */
export function refreshFieldChips(editor: Editor | null) {
  if (editor && !editor.isDestroyed) setFieldValues(fieldValues, editor.view.dom as HTMLElement, editor);
}

/** A field ({country}, {latest_year}...): a chip showing its value; saved as {key} and filled in when the file is made. */
export const Field = Node.create({
  name: "field",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ key: { default: "", parseHTML: (el) => el.getAttribute("data-field") } }),
  parseHTML: () => [{ tag: "span[data-field]" }],
  renderHTML: ({ node }) => ["span", { "data-field": node.attrs.key, class: "cd-rb-chip" }, "{" + node.attrs.key + "}"],
  renderText: ({ node }) => "{" + node.attrs.key + "}",
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("span");
      const key = node.attrs.key as string;
      let pos: number | undefined;
      try {
        pos = typeof getPos === "function" ? getPos() : undefined;
      } catch {
        pos = undefined;
      }
      const value = fieldAt(key, editor.state.doc, pos);
      dom.className = "cd-rb-chip" + (value === undefined ? " cd-rb-chip--empty" : "");
      dom.setAttribute("data-field", key);
      dom.contentEditable = "false";
      dom.textContent = value ?? "{" + key + "}";
      return { dom };
    };
  }
});

/** Keyboard shortcuts of the report (besides the editor's own: Ctrl+B, Ctrl+I, Ctrl+Z, Ctrl+Alt+1..6 for headings,
 *  Ctrl+Shift+7 / 8 for lists): Ctrl+K a link, Ctrl+Enter a page break, Ctrl+Shift+> / < a larger or smaller size,
 *  Ctrl+S saves now. */
const Shortcuts = Extension.create<{ onLink: () => void; onSave: () => void; onSize: (dir: 1 | -1) => void }>({
  name: "rbShortcuts",
  addOptions: () => ({ onLink: () => undefined, onSave: () => undefined, onSize: () => undefined }),
  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        this.options.onLink();
        return true;
      },
      "Mod-s": () => {
        this.options.onSave();
        return true;
      },
      "Mod-Enter": () => this.editor.chain().insertContent({ type: "pageBreak" }).run(),
      "Mod-Shift->": () => {
        this.options.onSize(1);
        return true;
      },
      "Mod-Shift-.": () => {
        this.options.onSize(1);
        return true;
      },
      "Mod-Shift-<": () => {
        this.options.onSize(-1);
        return true;
      },
      "Mod-Shift-,": () => {
        this.options.onSize(-1);
        return true;
      }
    };
  }
});

export interface FlowOptions {
  onLink: () => void;
  onSave: () => void;
  onSize: (dir: 1 | -1) => void;
  placeholder: string;
  geometry: () => PageGeometry;
  onLayout: (result: PageLayoutResult) => void;
  /** Pictures dropped on or pasted into the editor. */
  onImages: (editor: Editor, files: File[], pos?: number) => void;
}

export function flowExtensions(o: FlowOptions) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      horizontalRule: false,
      code: false,
      link: { openOnClick: false, autolink: true },
      undoRedo: { depth: 200, newGroupDelay: 600 },
      trailingNode: { node: "paragraph" }
    }),
    TextStyleKit.configure({ lineHeight: false }),
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
    Subscript,
    Superscript,
    BlockAttrs,
    Note,
    PageBreak,
    RbBlockNode,
    Field,
    Placeholder.configure({ placeholder: o.placeholder, showOnlyCurrent: true }),
    CharacterCount,
    FileHandler.configure({
      allowedMimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"],
      onDrop: (editor, files, pos) => o.onImages(editor, files, pos),
      onPaste: (editor, files) => o.onImages(editor, files)
    }),
    Pagination.configure({ geometry: o.geometry, onLayout: o.onLayout }),
    Shortcuts.configure({ onLink: o.onLink, onSave: o.onSave, onSize: o.onSize })
  ];
}

export type { RbBlock };
