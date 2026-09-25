import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

// Pages for one continuous document. The text is laid out as the browser draws it, then measured: where a block (or a
// row of side-by-side blocks) would cross the bottom of a page, a gap is put before it that reaches the top of the next
// page (the grey space between sheets and the margins), as a widget decoration, so nothing in the document changes. A
// paragraph or a list that does not fit is split between two lines, as Word does, keeping at least two lines on each
// page (widow and orphan control); notes, quotes, preformatted text, headings, charts, tables and pictures move whole.
// The sheets are drawn behind the text (ReportEditor.tsx) at the same positions. Word does the final layout; this is the
// editor's view of it.
//
// Positions are measured as they would be without the gaps (each gap already in place is taken off what is below it), so
// measuring again after the gaps are put in gives the same breaks. Blocks have no top margin (space before is padding),
// so a gap between two blocks does not change how their margins meet.

export interface PageGeometry {
  /** Height of the text area of a page, px. */
  contentH: number;
  /** Distance from the top of one page's text area to the next one's, px (page height plus the gap between sheets). */
  stride: number;
  /** The top margin of a page and the grey space between sheets, px: a gap inside a shaded box is painted as them. */
  padTop?: number;
  gap?: number;
}

export interface PageLayoutResult {
  /** The page (0 = first page of the flow) each block starts on, by its bid. */
  pageOf: Record<string, number>;
  pages: number;
  /** For each page, the top-level node indices on it (a block split across pages is on both). */
  indices: number[][];
}

interface Break {
  pos: number;
  height: number;
  /** Inside a paragraph (between two lines): the gap is an inline element that starts a new line. */
  inline: boolean;
  /** Inside a note, quote or preformatted block: the gap covers the box's shading and borders, painted as the page's
   *  margins and the grey between sheets (the paint's first white part, px, then the grey part). */
  paint?: [number, number];
}

interface PagesState {
  set: DecorationSet;
  /** Counts the requests to lay the pages out again. */
  epoch: number;
}

const key = new PluginKey<PagesState>("rbPages");

const same = (a: Break[], b: Break[]) => a.length === b.length && a.every((x, i) => x.pos === b[i].pos && x.inline === b[i].inline && !!x.paint === !!b[i].paint && Math.abs(x.height - b[i].height) < 0.5);

function gapWidget(b: Break) {
  return () => {
    const el = document.createElement(b.inline ? "span" : "div");
    el.className = "cd-rb-pgap" + (b.inline ? " cd-rb-pgap--inline" : "") + (b.paint ? " cd-rb-pgap--paint" : "");
    el.style.height = b.height + "px";
    if (b.paint) {
      const [white, grey] = b.paint;
      el.style.setProperty("--rb-gap-paint", `linear-gradient(#fff 0 ${white}px, #e4e7ea ${white}px ${white + grey}px, #fff ${white + grey}px)`);
    }
    el.contentEditable = "false";
    return el;
  };
}

/** Blocks a page may end inside: paragraphs and lists, and boxes of them (as Word, which splits between their lines). */
const SPLITTABLE = ["paragraph", "bulletList", "orderedList", "note", "blockquote", "codeBlock"];
const BOXES = ["note", "blockquote", "codeBlock"];

interface Item {
  pos: number;
  node: PMNode;
  index: number;
  el: HTMLElement;
  top: number;
  bottom: number;
  /** The bottom of its box, without the space after it (which Word lets fall into the page's margin). */
  end: number;
}

/** Measure the blocks and work out the page breaks. */
function measure(view: EditorView, geo: PageGeometry, current: Break[]): { breaks: Break[]; result: PageLayoutResult } | null {
  const root = view.dom as HTMLElement;
  if (!root.isConnected || !root.offsetHeight) return null;
  const doc = view.state.doc;
  const box = root.getBoundingClientRect();
  // the page's own pixels (the pages may be zoomed)
  const scale = box.height / root.offsetHeight || 1;
  const local = (y: number) => (y - box.top) / scale;
  // the gaps in place now, and a position as it would be without them
  const gaps = Array.from(root.querySelectorAll<HTMLElement>(".cd-rb-pgap")).map((g) => {
    const r = g.getBoundingClientRect();
    return { top: local(r.top), bottom: local(r.bottom) };
  });
  // a gap counts as above a point when it starts above it (a block with a negative top margin, a notes box, begins a
  // little above the bottom of the gap before it; counting the gap only when it ends above the point would place that
  // block a page lower, and the layout would swing between two answers)
  const natural = (y: number) => y - gaps.reduce((s, g) => (g.top < y - 0.5 ? s + (g.bottom - g.top) : s), 0);
  const at = (y: number) => natural(local(y));

  const items: Item[] = [];
  doc.forEach((node, offset, index) => {
    const el = view.nodeDOM(offset) as HTMLElement | null;
    if (!el || el.parentElement !== root) return;
    const r = el.getBoundingClientRect();
    const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
    items.push({ pos: offset, node, index, el, top: at(r.top), bottom: at(r.bottom) + mb, end: at(r.bottom) });
  });
  if (!items.length) return null;

  // rows: blocks side by side (half or third width, a picture with text beside it) go to a page together; a block that
  // starts above the bottom of the one before it (not counting the space after it) is beside it
  const rows: Item[][] = [];
  let rowEnd = -Infinity;
  items.forEach((it) => {
    const row = rows[rows.length - 1];
    if (row && it.top < rowEnd - 1 && it.node.type.name !== "pageBreak" && row[0].node.type.name !== "pageBreak") {
      row.push(it);
      rowEnd = Math.max(rowEnd, it.end);
    } else {
      rows.push([it]);
      rowEnd = it.end;
    }
  });
  const top = (r: Item[]) => r[0].top;
  const bottom = (r: Item[]) => Math.max(...r.map((x) => x.end));
  // what Word keeps on the page of what follows it: a heading, and a short paragraph (a chart's title) before a chart, a
  // table or a picture (cd2030.core's .rb_write_docx() gives both "keep with next")
  const keepsNext = (a: Item[], b: Item[] | undefined) => {
    if (a.length !== 1 || !b) return false;
    const n = a[0].node;
    if (n.type.name === "heading") return true;
    return n.type.name === "paragraph" && n.textContent.length <= 200 && b[0].node.type.name === "rbBlock";
  };

  /** Where a paragraph or list crossing `limit` can end the page: a document position and the top of what starts the
   *  next page. Null when it should move whole (fewer than two lines would stay, or none fits). */
  const split = (it: Item, from: number, limit: number): { pos: number; top: number; inline: boolean } | null => {
    // its paragraphs (a list has one or more in each item)
    const blocks: { pos: number; node: PMNode }[] = [];
    if (it.node.isTextblock) blocks.push({ pos: it.pos, node: it.node });
    else it.node.descendants((child, offset) => {
      if (child.isTextblock) blocks.push({ pos: it.pos + 1 + offset, node: child });
      return !child.isTextblock;
    });
    for (const [bi, blk] of blocks.entries()) {
      const start = blk.pos + 1;
      const end = blk.pos + 1 + blk.node.content.size;
      if (end <= start) continue;
      const first = view.coordsAtPos(start, 1);
      const last = view.coordsAtPos(end, -1);
      const blkTop = at(first.top);
      const blkBottom = at(last.bottom);
      if (blkBottom <= limit) continue;
      const lineH = Math.max(1, at(first.bottom) - blkTop);
      const startY = Math.max(blkTop, from);
      // the page ends before this paragraph (inside a list), unless it is where the page starts
      // The page ends before this paragraph (inside a list or a box), unless it is the block's first paragraph or fewer
      // than two lines of the block would stay on this page (a box's one-line title alone at the bottom): then the whole
      // block moves, as Word does
      const before = () => {
        if (bi === 0 || blk.pos === it.pos || blkTop <= from + 0.5) return null;
        // (lineH is a character's height, a little less than a line: one line and the box's padding measure about 1.6)
        if ((blkTop - Math.max(from, it.top)) / lineH < 2.2) return null;
        return { pos: blk.pos, top: blkTop, inline: false };
      };
      if (blkTop >= limit - lineH * 0.5) return before();
      // the first position whose line ends below the page
      let lo = start;
      let hi = end;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (at(view.coordsAtPos(mid, 1).bottom) > limit + 0.5) hi = mid;
        else lo = mid + 1;
      }
      let lineTop = at(view.coordsAtPos(lo, 1).top);
      // at least two lines on the next page (widow control) and two on this one (orphan control)
      const linesAfter = Math.round((blkBottom - lineTop) / lineH);
      if (linesAfter < 2) lineTop -= lineH * (2 - linesAfter);
      if (Math.round((lineTop - startY) / lineH) < 2) return before();
      // the start of that line
      let a = start;
      let b = end;
      while (a < b) {
        const mid = (a + b) >> 1;
        if (at(view.coordsAtPos(mid, 1).top) >= lineTop - 0.5) b = mid;
        else a = mid + 1;
      }
      if (a <= start) return null;
      return { pos: a, top: at(view.coordsAtPos(a, 1).top), inline: true };
    }
    return null;
  };

  // pages: each break is where a page's text starts (after the first page)
  const starts: { pos: number; top: number; inline: boolean; box?: boolean }[] = [];
  const firstRowOfPage: number[] = [0];
  const pageOfRow: number[] = [];
  const lastPageOfRow: number[] = [];
  let pageTop = top(rows[0]);
  let page = 0;
  let r = 0;
  let forced = false;
  let within = -1; // a row already split: its rest is at the top of the page
  while (r < rows.length) {
    const row = rows[r];
    const first = firstRowOfPage[firstRowOfPage.length - 1] === r || within === r;
    const over = bottom(row) - pageTop > geo.contentH;
    if (pageOfRow[r] === undefined) pageOfRow[r] = page;
    if (!forced && over && row.length === 1 && SPLITTABLE.includes(row[0].node.type.name)) {
      const s = split(row[0], Math.max(pageTop, top(row)), pageTop + geo.contentH);
      if (s) {
        page += 1;
        starts.push({ ...s, box: BOXES.includes(row[0].node.type.name) });
        pageTop = s.top;
        within = r;
        lastPageOfRow[r] = page;
        continue;
      }
    }
    if (!first && (forced || over)) {
      // a heading stays with what follows it
      // what is kept with this row goes to the next page with it (a chain, as in Word), unless that would empty the page
      let at2 = r;
      const pageStart = firstRowOfPage[firstRowOfPage.length - 1];
      if (!forced) {
        while (at2 - 1 > pageStart && at2 - 1 !== within && keepsNext(rows[at2 - 1], rows[at2])) at2 -= 1;
      }
      page += 1;
      firstRowOfPage.push(at2);
      starts.push({ pos: rows[at2][0].pos, top: top(rows[at2]), inline: false });
      pageTop = top(rows[at2]);
      for (let k = at2; k <= r; k++) {
        pageOfRow[k] = page;
        lastPageOfRow[k] = page;
      }
      forced = false;
      within = -1;
      r = at2 + 1;
      if (rows[at2][0].node.type.name === "pageBreak") forced = true;
      continue;
    }
    lastPageOfRow[r] = Math.max(lastPageOfRow[r] ?? page, page);
    if (row[0].node.type.name === "pageBreak") forced = true;
    within = -1;
    r += 1;
  }

  // the gaps: each page's text starts at its sheet's text area
  let shift = 0;
  const breaks: Break[] = starts.map((s, k) => {
    const height = Math.max(0, (k + 1) * geo.stride - (s.top + shift));
    shift += height;
    const grey = geo.gap ?? 24;
    const white = Math.max(0, height - grey - (geo.padTop ?? 0));
    return { pos: s.pos, height, inline: s.inline, ...(s.box ? { paint: [white, grey] as [number, number] } : {}) };
  });
  // a gap of no height is not drawn (and is not compared)
  const drawn = breaks.filter((b) => b.height > 0.5);
  const pages = page + 1;
  const pageOf: Record<string, number> = {};
  const indices: number[][] = Array.from({ length: pages }, () => []);
  rows.forEach((row, k) =>
    row.forEach((it) => {
      if (it.node.attrs.bid) pageOf[it.node.attrs.bid] = pageOfRow[k];
      for (let p = pageOfRow[k]; p <= (lastPageOfRow[k] ?? pageOfRow[k]); p++) indices[p].push(it.index);
    })
  );
  doc.forEach((node) => {
    if (node.attrs.bid && pageOf[node.attrs.bid] === undefined) pageOf[node.attrs.bid] = page;
  });
  return { breaks: same(drawn, current) ? current : drawn, result: { pageOf, pages, indices } };
}

export const Pagination = Extension.create<{ geometry: () => PageGeometry; onLayout: (r: PageLayoutResult) => void }>({
  name: "rbPagination",
  addOptions: () => ({ geometry: () => ({ contentH: 900, stride: 1150 }), onLayout: () => undefined }),
  addProseMirrorPlugins() {
    const options = this.options;
    let lastKey = "";
    // the gaps on the page now (an edit can take one away with the text it was in: they are compared with what is
    // measured, not with what was last put in)
    const shown = (view: EditorView): Break[] =>
      (key.getState(view.state)?.set.find() || [])
        .map((d) => ({ ...(d.spec.gap as Break), pos: d.from }))
        .sort((a, b) => a.pos - b.pos);
    return [
      new Plugin<PagesState>({
        key,
        state: {
          init: () => ({ set: DecorationSet.empty, epoch: 0 }),
          apply: (tr, st) => {
            const meta = tr.getMeta(key) as { breaks?: Break[]; relayout?: boolean } | undefined;
            if (meta && meta.breaks) {
              const set = DecorationSet.create(
                tr.doc,
                meta.breaks
                  .map((b) => Decoration.widget(b.pos, gapWidget(b), { side: -1, marks: [], key: (b.inline ? "i" : "g") + (b.paint ? "p" : "") + b.pos + ":" + Math.round(b.height), ignoreSelection: true, gap: b }))
              );
              return { set, epoch: st.epoch };
            }
            return { set: st.set.map(tr.mapping, tr.doc), epoch: st.epoch + (meta && meta.relayout ? 1 : 0) };
          }
        },
        props: { decorations: (state) => key.getState(state)?.set },
        view: (view) => {
          let frame = 0;
          let epoch = 0;
          let force = false;
          // layouts put in since the text last changed: measuring again must settle at once; if it keeps changing (a
          // case the measuring gets wrong) it stops, rather than flicker
          let passes = 0;
          const run = () => {
            frame = 0;
            // not while an accent or a character is being composed
            if (view.composing) {
              schedule();
              return;
            }
            const now = shown(view);
            const m = measure(view, options.geometry(), force ? [] : now);
            force = false;
            if (!m) return;
            const layoutKey = JSON.stringify(m.result.indices);
            if (layoutKey !== lastKey) {
              lastKey = layoutKey;
              options.onLayout(m.result);
            }
            if (m.breaks === now) passes = 0;
            else if (passes < 4) {
              passes += 1;
              view.dispatch(view.state.tr.setMeta(key, { breaks: m.breaks }).setMeta("addToHistory", false));
            }
          };
          // after the browser has laid the text out (a hidden tab draws no frames: a timer then)
          const schedule = () => {
            if (frame) return;
            frame = document.hidden ? (setTimeout(run, 60) as unknown as number) : requestAnimationFrame(run);
          };
          // pictures and charts change height when they load
          const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
          ro?.observe(view.dom);
          schedule();
          return {
            update: (_v, prev) => {
              const e = key.getState(view.state)?.epoch || 0;
              if (e !== epoch) {
                epoch = e;
                force = true;
              }
              if (prev.doc !== view.state.doc || force) passes = 0;
              if (force || prev.doc !== view.state.doc) schedule();
            },
            destroy: () => {
              if (frame) {
                cancelAnimationFrame(frame);
                clearTimeout(frame);
              }
              ro?.disconnect();
            }
          };
        }
      })
    ];
  }
});

/** Lay the pages out again (the page size, margins or the theme changed). */
export function relayout(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(key, { relayout: true }).setMeta("addToHistory", false));
}
