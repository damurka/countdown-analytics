import { DOMSerializer } from "@tiptap/pm/model";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import type { RbBlock } from "../types";
import { escapeHtml } from "../layout";

// The report is saved as a list of blocks (what cd2030.core writes Word from), and edited as one document. A block's
// text is a small HTML subset: inline formatting for paragraphs and headings; <p>, <ul>/<ol>/<li> (nested) inside
// lists, notes and quotes; plain text for preformatted blocks. Fields are {key} in the saved text and chips in the editor.

const SETTINGS = ["indent_left", "indent_right", "space_before", "space_after", "line"] as const;

const attr = (v: unknown) => escapeHtml(String(v)).replace(/"/g, "&quot;");

/** Fields as the editor's chips. */
const chips = (html: string) => html.replace(/\{([A-Za-z0-9_]+)\}/g, '<span data-field="$1"></span>');

/** Text written by the older editor: lines separated by <br> or <div>. */
function lines(html: string | undefined): string[] {
  const s = (html || "").replace(/<\/div>\s*<div>/g, "<br>").replace(/<\/?div>/g, "");
  return s.split(/<br\s*\/?>/i);
}

function dataAttrs(b: RbBlock): string {
  const out = [`data-bid="${attr(b.id)}"`];
  SETTINGS.forEach((k) => {
    const v = b[k];
    if (typeof v === "number") out.push(`data-${k.replace("_", "-")}="${v}"`);
  });
  if (b.align && b.align !== "left" && (b.type === "paragraph" || b.type === "heading")) out.push(`style="text-align: ${b.align}"`);
  return out.join(" ");
}

function listHtml(kind: "bullet" | "number", items: string[], extra = ""): string {
  const tag = kind === "number" ? "ol" : "ul";
  return `<${tag}${extra ? " " + extra : ""}>${items.map((l) => `<li><p>${chips(l)}</p></li>`).join("")}</${tag}>`;
}

/** The blocks as HTML the editor reads. */
export function blocksToHtml(blocks: RbBlock[]): string {
  return blocks
    .map((b) => {
      const a = dataAttrs(b);
      switch (b.type) {
        case "heading": {
          const level = Math.min(6, Math.max(1, b.level || 1));
          const text = /</.test(b.text || "") ? b.text || "" : escapeHtml(b.text || "");
          return `<h${level} ${a}>${chips(text)}</h${level}>`;
        }
        case "paragraph":
          if (b.list === "bullet" || b.list === "number") return listHtml(b.list, lines(b.text), a);
          return `<p ${a}>${chips(lines(b.text).join("<br>"))}</p>`;
        case "list": {
          const html = (b.text || "").trim() || "<ul><li><p></p></li></ul>";
          return chips(html).replace(/^<(ul|ol)\b/i, `<$1 ${a}`);
        }
        case "note": {
          let inner: string;
          if (b.list === "bullet" || b.list === "number") inner = listHtml(b.list, lines(b.text));
          else if (/<(p|ul|ol)\b/i.test(b.text || "")) inner = chips(b.text || "");
          else inner = lines(b.text).map((l) => `<p>${chips(l)}</p>`).join("");
          return `<div data-type="note" ${a}>${inner || "<p></p>"}</div>`;
        }
        case "quote": {
          const inner = /<p\b/i.test(b.text || "") ? chips(b.text || "") : lines(b.text).map((l) => `<p>${chips(l)}</p>`).join("");
          return `<blockquote ${a}>${inner || "<p></p>"}</blockquote>`;
        }
        case "pre":
          return `<pre ${a}><code>${escapeHtml(b.text || "")}</code></pre>`;
        case "pagebreak":
          return `<div data-type="page-break" ${a}></div>`;
        default: {
          const { id, sig, ...rest } = b;
          void sig;
          return `<div data-bid="${attr(id)}" data-rb-block="${attr(JSON.stringify(rest))}"></div>`;
        }
      }
    })
    .join("");
}

/** Fields back to {key}; the editor's attributes that are not part of the saved text are left out. */
function clean(html: string): string {
  return html
    .replace(/<span[^>]*data-field="([A-Za-z0-9_]+)"[^>]*>[^<]*<\/span>/g, "{$1}")
    .replace(/\s(data-bid|data-indent-left|data-indent-right|data-space-before|data-space-after|data-line)="[^"]*"/g, "")
    .replace(/\sstyle="(margin|padding|line-height)[^"]*"/g, "");
}

function serializeInner(serializer: DOMSerializer, node: PMNode): string {
  const div = document.createElement("div");
  div.appendChild(serializer.serializeFragment(node.content));
  return clean(div.innerHTML);
}

function serializeOuter(serializer: DOMSerializer, node: PMNode): string {
  const div = document.createElement("div");
  div.appendChild(serializer.serializeNode(node));
  return clean(div.innerHTML);
}

/** One top-level node as the block it is saved as. */
export function nodeToBlock(node: PMNode, schema: Schema, serializer = DOMSerializer.fromSchema(schema)): RbBlock | null {
  const id = (node.attrs.bid as string) || "";
  const settings: Partial<RbBlock> = {};
  SETTINGS.forEach((k) => {
    const v = node.attrs[k];
    if (typeof v === "number") (settings as Record<string, number>)[k] = v;
  });
  const align = node.attrs.textAlign && node.attrs.textAlign !== "left" ? (node.attrs.textAlign as RbBlock["align"]) : undefined;
  switch (node.type.name) {
    case "paragraph":
      return { id, type: "paragraph", text: serializeInner(serializer, node), ...(align ? { align } : {}), ...settings };
    case "heading":
      return { id, type: "heading", level: node.attrs.level, text: serializeInner(serializer, node), ...(align ? { align } : {}), ...settings };
    case "bulletList":
    case "orderedList":
      return { id, type: "list", list: node.type.name === "orderedList" ? "number" : "bullet", text: serializeOuter(serializer, node), ...settings };
    case "note":
      return { id, type: "note", text: serializeInner(serializer, node), ...settings };
    case "blockquote":
      return { id, type: "quote", text: serializeInner(serializer, node), ...settings };
    case "codeBlock":
      return { id, type: "pre", text: node.textContent };
    case "pageBreak":
      return { id, type: "pagebreak" };
    case "rbBlock":
      return { ...(node.attrs.block as RbBlock), id };
  }
  return null;
}

/** The document as the report's blocks (the empty paragraph the editor keeps at the end is left out). */
export function docToBlocks(doc: PMNode, schema: Schema): RbBlock[] {
  const serializer = DOMSerializer.fromSchema(schema);
  const out: RbBlock[] = [];
  doc.forEach((node, _offset, index) => {
    if (index === doc.childCount - 1 && node.type.name === "paragraph" && !node.content.size && out.length) return;
    const b = nodeToBlock(node, schema, serializer);
    if (b) out.push(b);
  });
  return out;
}
