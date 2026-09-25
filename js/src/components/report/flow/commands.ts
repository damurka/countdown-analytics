import type { Editor } from "@tiptap/core";
import { DOMParser } from "@tiptap/pm/model";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { RbBlock } from "../types";
import { blocksToHtml, nodeToBlock } from "./convert";
import { newBid } from "./extensions";

// Changes to the report's blocks made from outside the text (the ribbon, a block's tools, the palette), as editor
// transactions, so undo and redo take them back like typing.

/** The top-level node with this block id. */
export function findBlock(editor: Editor, id: string): { pos: number; node: PMNode; index: number } | null {
  let found: { pos: number; node: PMNode; index: number } | null = null;
  editor.state.doc.forEach((node, pos, index) => {
    if (!found && node.attrs.bid === id) found = { pos, node, index };
  });
  return found;
}

/** The top-level node the caret (or the selected block) is in. */
export function currentTop(editor: Editor): { pos: number; node: PMNode } | null {
  const sel = editor.state.selection;
  if (sel instanceof NodeSelection && sel.$from.depth === 0) return { pos: sel.from, node: sel.node };
  const $from = sel.$from;
  if ($from.depth < 1) return null;
  return { pos: $from.before(1), node: $from.node(1) };
}

/** The block the caret is in, as saved. */
export function currentBlock(editor: Editor): RbBlock | null {
  const top = currentTop(editor);
  return top ? nodeToBlock(top.node, editor.schema) : null;
}

/** A chart, table or picture: its settings changed. Text blocks: their paragraph settings. */
export function updateBlock(editor: Editor, id: string, patch: Partial<RbBlock>) {
  const hit = findBlock(editor, id);
  if (!hit) return;
  const { pos, node } = hit;
  const tr = editor.state.tr;
  if (node.type.name === "rbBlock") {
    const next = { ...(node.attrs.block as RbBlock), ...patch };
    Object.keys(next).forEach((k) => (next as Record<string, unknown>)[k] === undefined && delete (next as Record<string, unknown>)[k]);
    tr.setNodeAttribute(pos, "block", next);
    // the block stays selected
    tr.setSelection(NodeSelection.create(tr.doc, pos));
  } else {
    Object.entries(patch).forEach(([k, v]) => {
      if (k === "align" && node.type.spec.attrs && "textAlign" in node.type.spec.attrs) tr.setNodeAttribute(pos, "textAlign", v ?? null);
      else if (node.type.spec.attrs && k in node.type.spec.attrs) tr.setNodeAttribute(pos, k, v ?? null);
    });
  }
  editor.view.dispatch(tr);
}

/** Paragraph settings of the block the caret is in. */
export function updateCurrent(editor: Editor, patch: Partial<RbBlock>) {
  const top = currentTop(editor);
  if (top && top.node.attrs.bid) updateBlock(editor, top.node.attrs.bid, patch);
}

export function removeBlock(editor: Editor, id: string) {
  const hit = findBlock(editor, id);
  if (!hit) return;
  editor.view.dispatch(editor.state.tr.delete(hit.pos, hit.pos + hit.node.nodeSize));
}

export function duplicateBlock(editor: Editor, id: string) {
  const hit = findBlock(editor, id);
  if (!hit) return;
  const copy = hit.node.type.create({ ...hit.node.attrs, bid: newBid() }, hit.node.content, hit.node.marks);
  const at = hit.pos + hit.node.nodeSize;
  const tr = editor.state.tr.insert(at, copy);
  if (copy.type.name === "rbBlock") tr.setSelection(NodeSelection.create(tr.doc, at));
  editor.view.dispatch(tr);
}

export function moveBlock(editor: Editor, id: string, delta: number) {
  const hit = findBlock(editor, id);
  if (!hit) return;
  const doc = editor.state.doc;
  const target = hit.index + delta;
  if (target < 0 || target >= doc.childCount) return;
  let tr = editor.state.tr.delete(hit.pos, hit.pos + hit.node.nodeSize);
  // where the node goes, in the document without it
  let at = 0;
  for (let k = 0, seen = 0; k < doc.childCount && seen < target; k++) {
    if (k === hit.index) continue;
    at += doc.child(k).nodeSize;
    seen += 1;
  }
  tr = tr.insert(at, hit.node);
  if (hit.node.type.name === "rbBlock") tr.setSelection(NodeSelection.create(tr.doc, at));
  editor.view.dispatch(tr);
}

/** Blocks as editor nodes. */
function nodesOf(editor: Editor, blocks: RbBlock[]): PMNode[] {
  const div = document.createElement("div");
  div.innerHTML = blocksToHtml(blocks);
  const doc = DOMParser.fromSchema(editor.schema).parse(div);
  const out: PMNode[] = [];
  doc.forEach((n) => out.push(n));
  return out;
}

/** A new block after the block the caret is in (or at `pos`), selected or with the caret in it. */
export function insertBlock(editor: Editor, block: RbBlock, pos?: number) {
  const nodes = nodesOf(editor, [block]);
  if (!nodes.length) return;
  const top = currentTop(editor);
  let at = pos ?? (top ? top.pos + top.node.nodeSize : editor.state.doc.content.size);
  // a drop inside a paragraph goes after it
  const $at = editor.state.doc.resolve(Math.min(at, editor.state.doc.content.size));
  if ($at.depth > 0) at = $at.after(1);
  const tr = editor.state.tr.insert(at, nodes);
  const node = nodes[0];
  if (node.type.name === "rbBlock" || node.type.name === "pageBreak") tr.setSelection(NodeSelection.create(tr.doc, at));
  else tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
}

/** Select a block (the outline, a click on a page in the side-by-side view). */
export function selectBlock(editor: Editor, id: string) {
  const hit = findBlock(editor, id);
  if (!hit) return;
  const tr = editor.state.tr;
  if (hit.node.isAtom) tr.setSelection(NodeSelection.create(tr.doc, hit.pos));
  else tr.setSelection(TextSelection.near(tr.doc.resolve(hit.pos + 1)));
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
}
