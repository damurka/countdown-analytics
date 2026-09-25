import React, { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { tr } from "../../lang";
import type { LocalText } from "../../lang";
import { useLang } from "../../lang";
import { cssFont, fillFields, headingSize, isData, isText, pageBox, plainText, PT, signBlocks } from "./layout";
import { ChartStyle, CoverPanel, readImage, ThemePanel } from "./panels";
import { Ribbon } from "./Ribbon";
import { canvasSize, canvasTextBox, newCanvas } from "./flow/CanvasPage";
import { isTextItem, newId, round, signItems } from "./deck";
import { useReportProject } from "./kit/useReportProject";
import { EditorTopBar, HandButton, ZoomControl } from "./kit/frame";
import { usePan } from "./kit/usePan";
import { ChartStylePop } from "./kit/ChartStylePop";
import { themeDesign, usePictureStore } from "./kit/pictures";
import type { StyleKind } from "./Ribbon";
import { activeEditor, caretFont, currentLink, fontSize, setActiveEditor, setLink } from "./RichText";
import { ExportDialog, FinalPages } from "./dialogs";
import { CoverText } from "./CoverText";
import { fullCover, fullDesign } from "./types";
import type { RbBlock, RbChartSchema, RbCover, RbDesign, RbExportState, RbField, RbFinalState, RbKind, RbPreview, RbProject, RbSlideItem, RbTheme, Texts } from "./types";
import { Icon, ICONS, kindIcon } from "./ui";
import { FlowContext } from "./flow/BlockView";
import type { FlowCtx } from "./flow/BlockView";
import { currentTop, duplicateBlock, insertBlock, moveBlock, removeBlock, selectBlock, updateBlock, updateCurrent } from "./flow/commands";
import { blocksToHtml, docToBlocks, nodeToBlock } from "./flow/convert";
import { flowExtensions, joinAnd, newBid, refreshFieldChips, setChartFieldValue, setFieldValues } from "./flow/extensions";
import { relayout } from "./flow/pages";
import type { PageLayoutResult } from "./flow/pages";

// The document builder: a ribbon over the pages, the blocks (charts, tables) and the outline on the left. The report is
// one document edited as in a word processor (TipTap, flow/): text across paragraphs, nested lists, headings H1 to H6,
// quotes, preformatted text, and the charts, tables and pictures inside it. The pages are measured from the text as
// drawn (flow/pages.ts). The report is saved as its blocks (flow/convert.ts), which cd2030.core writes Word from.

interface Props {
  project: RbProject;
  kinds: RbKind[];
  regions: string[];
  years: number[];
  previews: Record<string, RbPreview>;
  /** The report's pictures by id (data URLs), sent by R when the report opens and kept as they are added. */
  assets: Record<string, string>;
  /** Pictures of each kind of chart, for the blocks panel. */
  thumbs?: Record<string, string>;
  /** R's answer to a picture asked for by its web address: stored (with its shape) or not. */
  assetDone: { id: string; ratio: number } | null;
  assetFailed: { id: string; message: string } | null;
  /** A picture read in the browser, to keep in the dataset; a web address for R to download. */
  onAsset: (id: string, src: string) => void;
  onAssetUrl: (id: string, url: string) => void;
  themes: RbTheme[];
  fonts: string[];
  fieldCatalog: RbField[];
  fields: Record<string, string>;
  flag?: string | null;
  converter?: string | null;
  chartSchema: RbChartSchema;
  exportState: RbExportState | null;
  finalState: RbFinalState | null;
  saving: boolean;
  texts: Texts;
  onChange: (p: RbProject) => void;
  onClose: () => void;
  onExport: (format: "docx" | "pdf") => void;
  onExportClosed: () => void;
  onFinal: () => void;
  onFinalClosed: () => void;
  /** An Office file to make a theme from, and the theme made (applied when it arrives). */
  onThemeFile?: (file: File) => void;
  themeArrived?: { theme?: RbTheme; failed?: string; nonce: number } | null;
}

const BLOCK_MIME = "application/x-rb-block";
const GAP = 24;
const PAD_X = 24;

const normalise = (p: RbProject, appLang: string): RbProject => {
  const design = fullDesign(p.design);
  return { ...p, design, cover: fullCover(p.cover), blocks: signBlocks(p.blocks || [], design, p.region, p.lang || appLang) };
};

export function ReportEditor(props: Props) {
  const { kinds, regions, years, previews, texts, fields } = props;
  const lang = useLang();
  const t = (k: string) => tr(texts[k] as LocalText, lang) || k;
  // the report, saved as it changes; undo for what is not text (theme, cover, name, region, language): the text has the
  // editor's own history
  const signed = (p: RbProject): RbProject => ({
    ...p,
    blocks: signBlocks(p.blocks, p.design, p.region, p.lang || lang).map((b) => {
      if (b.type !== "canvas" || !b.items) return b;
      const items = signItems(b.items, p.design, p.region, p.lang || lang);
      return items === b.items ? b : { ...b, items };
    })
  });
  const rp = useReportProject(() => normalise(props.project, lang), signed, props.onChange);
  const { project, send, commit } = rp;
  const projRef = rp.ref;
  const setProject = rp.set;
  const [leftTab, setLeftTab] = useState<"blocks" | "outline">("blocks");
  const [panel, setPanel] = useState<null | "theme" | "cover">(null);
  const stored = (key: string) => {
    try {
      return window.localStorage.getItem(key) !== "0";
    } catch (e) {
      return true;
    }
  };
  const [leftOpen, setLeftOpenState] = useState(() => stored("cd-rb-left"));
  const setLeftOpen = (on: boolean) => {
    setLeftOpenState(on);
    try {
      window.localStorage.setItem("cd-rb-left", on ? "1" : "0");
    } catch (e) {
      /* private window: not remembered */
    }
  };
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [dropping, setDropping] = useState(false);
  const [zoom, setZoomState] = useState(0.9);
  // the chart whose Customize pop-up is open
  const [styleFor, setStyleFor] = useState<string | null>(null);
  // the picture or chart in crop mode (Word's Crop: its crop handles on the page)
  const [cropFor, setCropFor] = useState<string | null>(null);
  const pagesRef = useRef<HTMLElement>(null);
  const [preview, setPreview] = useState(false);
  const [dialog, setDialog] = useState<null | "docx" | "pdf">(null);
  const design = project.design;
  const cover = project.cover;
  const box = pageBox(design);
  const firstFlowPage = 1 + (design.cover ? 1 : 0) + (design.contents ? 1 : 0);
  const [flow, setFlow] = useState<PageLayoutResult>({ pageOf: {}, pages: 1, indices: [[]] });

  // ---- zoom: 25% to 200% (the status bar's ZoomControl), to the width of the window or to the whole page; Ctrl + mouse
  // wheel zooms too
  // the hand (and Space, and the middle button) moves the pages when they are bigger than the window
  const [hand, setHand] = useState(false);
  const pan = usePan(pagesRef, hand);
  const setZoom = (z: number) => setZoomState(Math.min(4, Math.max(0.25, Math.round(z * 100) / 100)));
  const fit = (what: "width" | "page") => {
    const el = pagesRef.current;
    if (!el) return;
    const byWidth = (el.clientWidth - 56) / box.w;
    const byPage = Math.min(byWidth, (el.clientHeight - 56) / box.h);
    setZoom(what === "width" ? byWidth : byPage);
  };
  useEffect(() => {
    const el = pagesRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoomState((z) => Math.min(4, Math.max(0.25, Math.round(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1) * 100) / 100)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [preview]);
  // the width of the pages' pane: when two or more pages fit across it they are shown side by side (Word's multi-page
  // view, for looking over the report; clicking a page goes back to it for editing)
  const [paneW, setPaneW] = useState(0);
  useEffect(() => {
    const el = pagesRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setPaneW(el.clientWidth));
    ro.observe(el);
    setPaneW(el.clientWidth);
    return () => ro.disconnect();
  }, [preview]);
  const innerW = paneW ? paneW / zoom : 0;
  const multiPage = !!innerW && box.w * 2 + GAP + PAD_X * 2 <= innerW;
  const zoomerStyle: React.CSSProperties = {
    zoom,
    ...(innerW && box.w + PAD_X * 2 <= innerW ? { width: innerW, minWidth: 0 } : {}),
    ...(multiPage ? { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start", alignContent: "flex-start" } : {})
  };
  // a page wider than the window (a poster, a chartbook, landscape) opens fitted to the width
  useEffect(() => {
    const el = pagesRef.current;
    if (el && box.w * zoom > el.clientWidth - 56) fit("width");
  }, [props.project.id, design.size, design.orientation]);

  const setDesign = (patch: Partial<RbDesign>) => commit((p) => ({ ...p, design: { ...p.design, ...patch } }));
  const setCover = (patch: Partial<RbCover>) => commit((p) => ({ ...p, cover: { ...p.cover, ...patch } }));

  // ---- the editor
  const geometry = useRef({ contentH: box.contentH, stride: box.h + GAP, padTop: box.padTop, gap: GAP });
  geometry.current = { contentH: box.contentH, stride: box.h + GAP, padTop: box.padTop, gap: GAP };
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);
  /** The text as the report's blocks, saved (at once with `now`, else after a pause in typing). */
  const sync = (now = false) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    const go = () => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      const next = signed({ ...projRef.current, blocks: docToBlocks(ed.state.doc, ed.schema) });
      setProject(next);
      send(next, now);
    };
    if (now) go();
    else syncTimer.current = setTimeout(go, 250);
  };
  // ---- pictures: each is kept once in the dataset ("asset:<id>"), not inside the report's text
  const pictures = usePictureStore(props);
  const assetOf = pictures.assetOf;
  /** A picture block's settings with its picture kept in the dataset (a data URL becomes an asset). */
  const withAsset = <T extends Partial<RbBlock>>(b: T): T => (typeof b.src === "string" && b.src.startsWith("data:") ? { ...b, src: assetOf(b.src) } : b);
  const newPicture = (src: string, ratio: number): RbBlock => ({ id: newBid(), type: "image", src, ratio, size: "full", width: 60, align: "center", shape: "rect" });
  const addImages = (ed: Editor, files: File[], pos?: number) => {
    files.forEach((file) => readImage(file).then((img) => insertBlock(ed, newPicture(assetOf(img.src), img.ratio), pos)));
  };
  const [notice, setNotice] = useState<string | null>(null);
  // Ctrl+K: the link on the selected text, in a box next to it
  const [linkBox, setLinkBox] = useState<{ href: string; top: number; left: number } | null>(null);
  function openLinkBox() {
    const ed = editorRef.current;
    if (!ed) return;
    const c = ed.view.coordsAtPos(ed.state.selection.from);
    setLinkBox({ href: currentLink(), top: Math.min(window.innerHeight - 120, c.bottom + 8), left: Math.max(12, Math.min(window.innerWidth - 340, c.left)) });
  }
  // Focus, as Word's: the pages alone on the whole screen (no bar, ribbon, panels or status bar), still editable; Esc,
  // or the button in the corner, ends it
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => {
    const on = () => !document.fullscreenElement && setFocusMode(false);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  useEffect(() => {
    if (!focusMode) return undefined;
    // (the browser leaves full screen on its own Esc; this covers Esc reaching the page, e.g. when full screen was refused)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      setFocusMode(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusMode]);
  const enterFocus = () => {
    setFocusMode(true);
    rootRef.current?.requestFullscreen?.().catch(() => undefined);
  };
  const leaveFocus = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    setFocusMode(false);
  };
  // a picture from a web address: R downloads and keeps it; the block is put in when it has it
  const addPictureFromUrl = (url: string) => {
    setNotice(t("pictureDownloading"));
    pictures.fromUrl(
      url,
      (src, ratio) => {
        setNotice(null);
        if (editorRef.current) insertBlock(editorRef.current, newPicture(src, ratio));
      },
      (message) => setNotice(t("pictureFailed") + " " + message)
    );
  };
  const editor = useEditor(
    {
      extensions: flowExtensions({
        onLink: () => openLinkBox(),
        onSave: () => sync(true),
        onSize: (dir) => {
          const size = caretFont()?.size ?? projRef.current.design.body_size;
          fontSize(Math.max(1, dir > 0 ? Math.floor(size) + 1 : Math.ceil(size) - 1));
        },
        placeholder: t("typeHere"),
        geometry: () => geometry.current,
        onLayout: (r) => setFlow(r),
        onImages: addImages
      }),
      content: blocksToHtml(normalise(props.project, lang).blocks),
      editorProps: {
        attributes: { class: "cd-rb-edit cd-rb-flowtext", "aria-multiline": "true", role: "textbox", "aria-label": t("pages") },
        // a block dragged from the palette
        handleDrop: (view, event) => {
          const data = event.dataTransfer?.getData(BLOCK_MIME);
          if (!data || !editorRef.current) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          insertBlock(editorRef.current, fromTemplate(JSON.parse(data)), at ? at.pos : undefined);
          setDropping(false);
          return true;
        }
      },
      onUpdate: ({ editor: ed }) => {
        sync();
        // {chart_indicator} above a chart follows the chart
        refreshFieldChips(ed);
      },
      onCreate: ({ editor: ed }) => {
        editorRef.current = ed;
        setActiveEditor(ed);
        setFieldValues(fields, ed.view.dom as HTMLElement, ed);
      },
      onDestroy: () => setActiveEditor(null)
    },
    [props.project.id]
  );
  editorRef.current = editor;

  // a report is opened: its blocks are signed and it is sent straight back, which is what makes R draw the charts
  useEffect(() => {
    const p = normalise(props.project, lang);
    rp.open(p);
    // pictures written into older reports go to the dataset, and the report keeps their ids
    setTimeout(() => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      const tr = ed.state.tr;
      ed.state.doc.forEach((node, pos) => {
        const b = node.attrs.block as RbBlock | undefined;
        if (node.type.name === "rbBlock" && b && b.type === "image" && typeof b.src === "string" && b.src.startsWith("data:")) {
          tr.setNodeAttribute(pos, "block", { ...b, src: assetOf(b.src) });
        }
      });
      if (tr.docChanged) ed.view.dispatch(tr.setMeta("addToHistory", false));
    }, 0);
    // a new, empty report: the caret is on the page, ready to type
    const only = p.blocks.length <= 1 && (!p.blocks.length || (p.blocks[0].type === "paragraph" && !p.blocks[0].text));
    if (only) setTimeout(() => editorRef.current?.commands.focus("start"), 60);
  }, [props.project.id]);

  useEffect(() => {
    if (editor) setFieldValues(fields, editor.view.dom as HTMLElement, editor);
  }, [fields, editor]);
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!preview);
  }, [preview, editor]);
  // the theme and the page change the height of the text: the pages are laid out again
  useEffect(() => {
    if (editor && !editor.isDestroyed) requestAnimationFrame(() => relayout(editor.view));
  }, [editor, box.w, box.h, box.contentH, design.body_font, design.heading_font, design.body_size, design.h1_size, design.h2_size, design.note_size, design.line_spacing, design.paragraph_after, multiPage]);

  // what the ribbon shows: the block the caret is in, the style and list there, the selected chart or picture
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) return null;
      const top = currentTop(ed);
      const block = top ? nodeToBlock(top.node, ed.schema) : null;
      const sel = ed.state.selection;
      const picked = sel instanceof NodeSelection && sel.node.type.name === "rbBlock" ? { ...(sel.node.attrs.block as RbBlock), id: sel.node.attrs.bid as string } : null;
      let style: StyleKind | null = null;
      if (ed.isActive("heading")) style = ("h" + ed.getAttributes("heading").level) as StyleKind;
      else if (ed.isActive("note")) style = "note";
      else if (ed.isActive("blockquote")) style = "quote";
      else if (ed.isActive("codeBlock")) style = "code";
      else if (ed.isActive("paragraph")) style = "body";
      const list = ed.isActive("orderedList") ? "number" : ed.isActive("bulletList") ? "bullet" : null;
      // the block without its text (the ribbon needs its type and settings, not every keystroke)
      const current = block ? ({ ...block, text: undefined, align: (ed.getAttributes("paragraph").textAlign || ed.getAttributes("heading").textAlign || block.align) as RbBlock["align"] } as RbBlock) : null;
      const counter = (ed.storage as unknown as { characterCount?: { words: () => number; characters: () => number } }).characterCount;
      return {
        current, picked, style, list, canUndo: ed.can().undo(), canRedo: ed.can().redo(),
        at: top && top.node.attrs.bid ? (top.node.attrs.bid as string) : null,
        words: counter ? counter.words() : 0,
        chars: counter ? counter.characters() : 0
      };
    }
  });
  const current = state?.current || null;
  const docSel = state?.picked || null;
  // a free page ("canvas") being edited: what is selected on it is what the ribbon's tabs and the toolbar act on
  const [canvasFor, setCanvasFor] = useState<string | null>(null);
  const [canvasSel, setCanvasSel] = useState<{ canvas: string; item: RbSlideItem | null; editing: boolean } | null>(null);
  const canvasItem = canvasFor && canvasSel?.canvas === canvasFor ? canvasSel.item : null;
  // (a free page selected as a block, from the outline or by its edge, can be moved, duplicated or deleted)
  const sel: RbBlock | null = canvasFor ? (canvasItem && !isTextItem(canvasItem) ? { ...canvasItem.block, id: canvasItem.id } : null) : docSel;
  // the free page as the document has it now (not as last saved)
  const canvasNow = (id: string): RbBlock | null => {
    let found: RbBlock | null = null;
    editorRef.current?.state.doc.forEach((node) => {
      if (node.type.name === "rbBlock" && node.attrs.bid === id) found = { ...(node.attrs.block as RbBlock), id };
    });
    return found;
  };
  const updateCanvas = (id: string, make: (items: RbSlideItem[]) => RbSlideItem[]) => {
    const c = canvasNow(id);
    if (c) update(id, { items: make(c.items || []) });
  };
  // leaving the free page (a click in the document's text) ends editing it
  useEffect(() => {
    if (!canvasFor) return undefined;
    const off = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest(".cd-rb-canvaspage, .cd-rb-ribbon, .cd-rb-mini, .cd-rb-menu__pop, .cd-rb-overlay, .cd-rb-stylepop, .cd-pop")) return;
      setCanvasFor(null);
      setCanvasSel(null);
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [canvasFor]);
  // a theme made from an Office file: applied when it arrives (or why it could not be made)
  useEffect(() => {
    const a = props.themeArrived;
    if (!a) return;
    if (a.theme) setDesign(themeDesign(a.theme));
    setNotice(a.failed ? t("themeFileFailed") + " " + a.failed : a.theme ? t("themeFileDone") : null);
  }, [props.themeArrived?.nonce]);
  // a text box of a free page being typed in: the ribbon's text commands act on it
  const boxTyping = !!canvasFor && !!canvasSel?.editing;
  const boxEditor = (make: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => {
    const ed = activeEditor();
    if (ed && ed !== editorRef.current) make(ed.chain().focus()).run();
  };
  /** What the ribbon's and toolbar's commands for the selected chart / picture do: on a free page's box, or a block. */
  // (on a free page: the selected box, a text box too)
  const pickedId = canvasFor ? canvasItem?.id || null : sel?.id || null;
  const onPicked = {
    update: (patch: Partial<RbBlock>) => {
      if (!sel) return;
      if (canvasFor) updateCanvas(canvasFor, (items) => items.map((it) => (it.id === sel.id ? { ...it, block: { ...it.block, ...withAsset(patch) } } : it)));
      else update(sel.id, patch);
    },
    duplicate: () => {
      if (!pickedId) return;
      if (canvasFor)
        updateCanvas(canvasFor, (items) => {
          const src = items.find((it) => it.id === pickedId);
          if (!src) return items;
          const id = newId("i");
          return items.concat([{ ...src, id, role: undefined, x: round(src.x + 0.2), y: round(src.y + 0.2), block: { ...src.block, id } }]);
        });
      else duplicate(pickedId);
    },
    remove: () => {
      if (!pickedId) return;
      if (canvasFor) updateCanvas(canvasFor, (items) => items.filter((it) => it.id !== pickedId));
      else remove(pickedId);
    },
    move: (d: number) => {
      if (!pickedId) return;
      if (!canvasFor) return move(pickedId, d);
      // on a free page: forward (up) or backward in the stacking order
      updateCanvas(canvasFor, (items) => {
        const i = items.findIndex((it) => it.id === pickedId);
        const j = d < 0 ? i + 1 : i - 1;
        if (i < 0 || j < 0 || j >= items.length) return items;
        const next = items.slice();
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      });
    }
  };

  const undo = () => {
    if (editor && editor.can().undo()) {
      editor.commands.undo();
      return;
    }
    rp.undo();
  };
  const redo = () => {
    if (editor && editor.can().redo()) {
      editor.commands.redo();
      return;
    }
    rp.redo();
  };
  const finalPages = () => {
    sync(true);
    send(projRef.current, true);
    props.onFinal();
  };
  // the app's language changed: a report with no language of its own follows it (not an edit: no undo step)
  useEffect(() => {
    const p = projRef.current;
    if (p.lang) return;
    const blocks = signBlocks(p.blocks, p.design, p.region, lang);
    if (blocks === p.blocks) return;
    const next = { ...p, blocks };
    setProject(next);
    send(next, true);
  }, [lang]);

  // keyboard outside the text: undo / redo of theme and cover changes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const kindOf = (b: RbBlock) => kinds.find((k) => k.kind === b.kind);
  // {chart_indicator} and {chart_year}: the indicator (its name, in the report's language) and year of a chart
  setChartFieldValue((b, key) => {
    if (key === "chart_year") return b.year ? String(b.year) : years.length ? String(years[years.length - 1]) : undefined;
    if (key !== "chart_indicator" || !b.indicator) return undefined;
    const opt = kindOf(b)?.indicators?.find((x) => x.value === b.indicator);
    return opt ? tr(opt.label, project.lang || lang) : b.indicator;
  }, (names) => joinAnd(names, tr(texts.and as LocalText, project.lang || lang) || "and"));

  // ---- adding and changing blocks (as editor transactions, so undo takes them back)
  function fromTemplate(tpl: Partial<RbBlock>): RbBlock {
    const b = { ...tpl, id: newBid() } as RbBlock;
    if (b.type === "chart" || b.type === "table") {
      b.size = b.size || "full";
      if (b.caption === undefined) b.caption = true;
    }
    return b;
  }
  const addAfterCurrent = (tpl: Partial<RbBlock>) => {
    if (canvasFor && (tpl.type === "chart" || tpl.type === "table" || tpl.type === "image")) {
      // on the free page being edited: in the middle of it
      const [W, H] = canvasSize(design, canvasNow(canvasFor) || undefined);
      const id = newId("i");
      const ratio = tpl.type === "image" ? tpl.ratio || 0.6 : 0.6;
      const w = Math.min(W * 0.8, (H * 0.6) / ratio);
      const item: RbSlideItem = { id, x: round((W - w) / 2), y: round((H - w * ratio) / 2), w: round(w), h: round(w * ratio), block: { ...withAsset(tpl), id } as RbBlock };
      updateCanvas(canvasFor, (items) => items.concat([item]));
      return;
    }
    if (tpl.type === "canvas") {
      if (editor) insertBlock(editor, fromTemplate(newCanvas(design)));
      return;
    }
    if (editor) insertBlock(editor, fromTemplate(withAsset(tpl)));
  };
  const update = (id: string, patch: Partial<RbBlock>) => editor && updateBlock(editor, id, withAsset(patch));
  const remove = (id: string) => editor && removeBlock(editor, id);
  const duplicate = (id: string) => editor && duplicateBlock(editor, id);
  const move = (id: string, delta: number) => editor && moveBlock(editor, id, delta);

  const restyle = (s: StyleKind) => {
    if (!editor) return;
    const c = editor.chain().focus();
    // out of a note, quote or code block first, then the new style
    if (editor.isActive("codeBlock") && s !== "code") c.toggleCodeBlock();
    if (editor.isActive("blockquote") && s !== "quote") c.lift("blockquote");
    if (editor.isActive("note") && s !== "note") c.lift("note");
    if (s === "body") c.setParagraph();
    else if (s.startsWith("h")) c.setHeading({ level: Number(s.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 });
    else if (s === "quote") c.setParagraph().wrapIn("blockquote");
    else if (s === "note") c.setParagraph().wrapIn("note");
    else if (s === "code") c.setCodeBlock();
    c.run();
  };
  const toggleList = (kind: "bullet" | "number") => {
    if (!editor) return;
    if (kind === "bullet") editor.chain().focus().toggleBulletList().run();
    else editor.chain().focus().toggleOrderedList().run();
  };
  // in a list: a level down or up; elsewhere: the paragraph's left indent, by 1.27 cm as Word
  const indent = (dir: 1 | -1) => {
    if (!editor) return;
    if (editor.isActive("listItem")) {
      if (dir > 0) editor.chain().focus().sinkListItem("listItem").run();
      else editor.chain().focus().liftListItem("listItem").run();
      return;
    }
    const now = current?.indent_left || 0;
    updateCurrent(editor, { indent_left: Math.max(0, Math.round((now + dir * 1.27) * 100) / 100) || null } as unknown as Partial<RbBlock>);
  };
  const onBlock = (patch: Partial<RbBlock>) => {
    if (!editor) return;
    const { align, ...rest } = patch;
    if (align) editor.chain().focus().setTextAlign(align).run();
    if (Object.keys(rest).length) updateCurrent(editor, rest);
  };

  // ---- palette
  const groups: { key: string; title: string; items: { label: string; sub: string; block: Partial<RbBlock> }[] }[] = [];
  const q = query.trim().toLowerCase();
  const hit = (s: string) => !q || s.toLowerCase().includes(q);
  kinds.forEach((k) => {
    const label = tr(k.label, lang);
    const title = tr(k.groupLabel, lang);
    if (!hit(label + " " + title)) return;
    let g = groups.find((x) => x.key === k.group);
    if (!g) groups.push((g = { key: k.group, title, items: [] }));
    g.items.push({ label, sub: k.type === "table" ? t("table") : t("chart"), block: { type: k.type, kind: k.kind, ...k.defaults } });
  });
  const textItems = [
    { label: t("heading"), block: { type: "heading", level: 1, text: t("newHeading") } as Partial<RbBlock> },
    { label: t("subheading"), block: { type: "heading", level: 2, text: t("newHeading") } as Partial<RbBlock> },
    { label: t("paragraph"), block: { type: "paragraph", text: t("newParagraph") } as Partial<RbBlock> },
    { label: t("note"), block: { type: "note", text: t("newNote") } as Partial<RbBlock> },
    { label: t("pagebreak"), block: { type: "pagebreak" } as Partial<RbBlock> }
  ]
    .filter((x) => hit(x.label))
    .map((x) => ({ label: x.label, sub: t("text"), block: x.block }));
  if (textItems.length) groups.push({ key: "text", title: t("textAndLayout"), items: textItems });
  // charts made for this dataset (later: asked of the AI) have their own section, shown even while it is empty
  const customAt = groups.findIndex((g) => g.key === "custom");
  if (customAt < 0 && (!q || hit(t("customCharts")))) groups.push({ key: "custom", title: t("customCharts"), items: [] });
  else if (customAt >= 0) groups.push(groups.splice(customAt, 1)[0]);

  // ---- how the page looks (the theme), as CSS variables the text's styles read (cd-ui.css, .cd-rb-flowtext)
  const font = { heading: cssFont(design.heading_font), body: cssFont(design.body_font) };
  const pt = (n: number) => n * PT;
  const themeVars = {
    "--rb-body-font": font.body,
    "--rb-heading-font": font.heading,
    "--rb-body-size": pt(design.body_size) + "px",
    "--rb-h1-size": pt(headingSize(1, design)) + "px",
    "--rb-h2-size": pt(headingSize(2, design)) + "px",
    "--rb-h3-size": pt(headingSize(3, design)) + "px",
    "--rb-h4-size": pt(headingSize(4, design)) + "px",
    "--rb-note-size": pt(design.note_size) + "px",
    "--rb-text": design.text_color,
    "--rb-heading": design.heading_color,
    "--rb-muted": design.muted_color,
    "--rb-accent": design.accent,
    "--rb-note-fill": design.note_fill,
    "--rb-note-border": design.note_border,
    "--rb-after": pt(design.paragraph_after) + "px",
    "--rb-line": String(design.line_spacing * 1.2),
    "--rb-break-label": JSON.stringify(t("pagebreak"))
  } as React.CSSProperties;
  const headingStyle = (level: number): React.CSSProperties =>
    level === 1
      ? { fontFamily: font.heading, fontSize: pt(design.h1_size), color: design.heading_color, borderBottom: `1.5px solid ${design.accent}` }
      : { fontFamily: font.heading, fontSize: pt(design.h2_size), color: design.text_color };

  const pageStyle: React.CSSProperties = {
    width: box.w,
    minHeight: box.h,
    padding: `${box.padTop}px ${box.padX}px ${box.padBottom}px`,
    fontFamily: font.body,
    fontSize: pt(design.body_size),
    color: design.text_color
  };
  const total = firstFlowPage - 1 + flow.pages;
  const running = (text: string) => plainText(fillFields(text, fields));
  const Foot = ({ n }: { n: number }) => (
    <div className="cd-rb-foot" style={{ left: box.padX, right: box.padX, color: design.muted_color }}>
      <span>{running(design.footer)}</span>
      <span>{design.page_numbers ? `${n} / ${total}` : ""}</span>
    </div>
  );
  const Head = () =>
    design.header ? (
      <div className="cd-rb-runhead" style={{ left: box.padX, right: box.padX, color: design.muted_color, borderColor: design.note_border }}>
        {running(design.header)}
      </div>
    ) : null;

  const pageOf = (id: string) => (flow.pageOf[id] ?? 0) + firstFlowPage;
  const headings = project.blocks.filter((b) => b.type === "heading" && (b.level || 1) <= 2);
  const coverTitle = fillFields(cover.title || project.name, fields);
  const editors = cover.editors.filter((e) => e.name);

  const ctx: FlowCtx = {
    previews, assets: props.assets, design, region: project.region, lang: project.lang || lang, kinds, fields, zoom, preview, styleFor, cropFor, t,
    setStyleFor, setCropFor, onUpdate: update, onDuplicate: duplicate, onRemove: remove, onMove: move,
    years, assetOf, canvasFor, setCanvasFor, onCanvasSel: setCanvasSel, onUpdateLive: updateCanvas
  };

  // the pages side by side: a copy of the pages as laid out for editing, each sheet showing its own part (read only)
  const overviewHtml = useMemo(() => (multiPage && editor ? (editor.view.dom as HTMLElement).innerHTML : ""), [multiPage, editor, flow, fields, project.blocks, previews]);

  const goToPage = (p: number) => {
    setZoom(1);
    const first = flow.indices[p]?.[0];
    if (editor && first !== undefined) {
      const node = editor.state.doc.child(first);
      if (node.attrs.bid) setTimeout(() => selectBlock(editor, node.attrs.bid), 80);
    }
  };

  return (
    <div ref={rootRef} className={["cd-rb", preview ? "cd-rb--preview" : "", focusMode ? "cd-rb--focus" : ""].join(" ")}>
      <EditorTopBar
        name={project.name}
        onName={(name) => commit((p) => ({ ...p, name }))}
        summary={`${t("document")} · ${total} ${t("pages")} · ${props.saving ? t("saving") : t("saved")}`}
        t={t}
        onClose={props.onClose}
        onDownload={() => {
          sync(true);
          setDialog("docx");
        }}
      />

      {!preview && (
        <Ribbon
          design={design}
          themes={props.themes}
          fonts={props.fonts}
          kinds={kinds}
          canUndo={!!state?.canUndo || rp.canUndo}
          canRedo={!!state?.canRedo || rp.canRedo}
          onUndo={undo}
          onRedo={redo}
          fieldCatalog={props.fieldCatalog}
          fields={fields}
          current={boxTyping ? { id: "box-text", type: "paragraph" } : current}
          texts={texts}
          onStyle={restyle}
          styleNow={state?.style || null}
          listNow={(state?.list as "bullet" | "number" | null) || null}
          onList={boxTyping ? (kind) => boxEditor((c) => (kind === "bullet" ? c.toggleBulletList() : c.toggleOrderedList())) : toggleList}
          onIndent={boxTyping ? (dir) => boxEditor((c) => (dir > 0 ? c.sinkListItem("listItem") : c.liftListItem("listItem"))) : indent}
          onBlock={boxTyping ? (patch) => patch.align && boxEditor((c) => c.setTextAlign(patch.align as string)) : onBlock}
          onInsert={addAfterCurrent}
          onInsertUrl={addPictureFromUrl}
          onOpenBlocks={() => {
            setLeftOpen(true);
            setLeftTab("blocks");
          }}
          selected={sel}
          selectedKind={sel ? kindOf(sel) : undefined}
          entries={sel ? previews[sel.id]?.entries : undefined}
          facets={sel ? previews[sel.id]?.facets : undefined}
          years={years}
          onSelected={onPicked.update}
          onCustomize={() => sel && setStyleFor(sel.id)}
          cropping={!!sel && cropFor === sel.id}
          onCropMode={() => sel && setCropFor(cropFor === sel.id ? null : sel.id)}
          onMove={onPicked.move}
          onDuplicate={onPicked.duplicate}
          onRemove={onPicked.remove}
          onTextBox={canvasFor ? () => updateCanvas(canvasFor, (items) => items.concat([canvasTextBox(design)])) : undefined}
          textBox={
            canvasFor && canvasItem && isTextItem(canvasItem) && canvasItem.role !== "picture" && !canvasSel?.editing
              ? {
                  id: canvasItem.id,
                  fill: canvasItem.block.fill,
                  fill_opacity: canvasItem.block.fill_opacity,
                  outline: canvasItem.block.outline,
                  onPatch: (patch) => updateCanvas(canvasFor, (items) => items.map((it) => (it.id === canvasItem.id ? { ...it, block: { ...it.block, ...patch } } : it)))
                }
              : undefined
          }
          onDesign={setDesign}
          regions={regions}
          region={project.region}
          onRegion={(r) => commit((p) => ({ ...p, region: r || undefined }))}
          reportLang={project.lang || (lang as RbProject["lang"])}
          onReportLang={(l) => commit((p) => ({ ...p, lang: l }))}
          onTheme={(th) => setDesign(themeDesign(th))}
          onPanel={(p) => setPanel(p)}
          onThemeFile={props.onThemeFile}
        />
      )}

      <div className="cd-rb-body">
        {!preview && leftOpen && (
          <aside className="cd-rb-left" aria-label={t("blocks")}>
            <div role="tablist" className="cd-rb-tabs">
              {(["blocks", "outline"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={leftTab === k} className={leftTab === k ? "cd-rb-tab cd-rb-tab--on" : "cd-rb-tab"} onClick={() => setLeftTab(k)}>
                  {t(k)}
                </button>
              ))}
            </div>
            {leftTab === "blocks" && (
              <div className="cd-rb-scroll">
                <label className="cd-rb-search">
                  <Icon d={ICONS.search} size={16} />
                  <input type="search" value={query} placeholder={t("searchBlocks")} aria-label={t("searchBlocks")} onChange={(e) => setQuery(e.target.value)} />
                </label>
                <div className="cd-rb-hint">{t("paletteHint")}</div>
                {groups.map((g) => {
                  const open = !!q || !closed[g.key];
                  return (
                    <div key={g.key} className="cd-rb-group">
                      <button type="button" className="cd-rb-group__head" aria-expanded={open} onClick={() => setClosed({ ...closed, [g.key]: open })}>
                        <span className={open ? "cd-rb-chev cd-rb-chev--open" : "cd-rb-chev"}>
                          <Icon d={ICONS.chevron} size={12} />
                        </span>
                        <span className="cd-rb-grow">{g.title}</span>
                        <span>{g.items.length}</span>
                      </button>
                      {open && g.key === "custom" && !g.items.length && (
                        <div className="cd-rb-custom">
                          <Icon d={["M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z", "M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"]} size={20} />
                          <span>{t("customChartsHint")}</span>
                        </div>
                      )}
                      {open &&
                        g.items.map((it) => (
                          <div
                            key={it.label + (it.block.kind || it.block.type) + (it.block.level || "")}
                            className={it.block.type === "chart" ? "cd-rb-item cd-rb-item--chart" : "cd-rb-item"}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(BLOCK_MIME, JSON.stringify(it.block));
                              e.dataTransfer.setData("text/plain", it.label);
                              e.dataTransfer.effectAllowed = "copy";
                              setDropping(true);
                            }}
                            onDragEnd={() => setDropping(false)}
                          >
                            {it.block.type === "chart" && (
                              <span className="cd-rb-item__thumb" aria-hidden="true">
                                {props.thumbs?.[it.block.kind || ""] ? <img src={props.thumbs[it.block.kind || ""]} alt="" draggable={false} /> : <Icon d={kindIcon("chart", it.block.kind)} size={22} />}
                              </span>
                            )}
                            {it.block.type !== "chart" && (
                              <span className={"cd-rb-item__icon cd-rb-item__icon--" + (it.block.type === "table" ? "table" : "text")}>
                                <Icon d={kindIcon(it.block.type || "", it.block.kind)} size={18} />
                              </span>
                            )}
                            <span className="cd-rb-item__text">
                              <b>{it.label}</b>
                              <span>{it.sub}</span>
                            </span>
                            <button type="button" aria-label={t("add") + ": " + it.label} title={t("add")} onClick={() => addAfterCurrent(it.block)}>
                              <Icon d={ICONS.plus} size={14} />
                            </button>
                          </div>
                        ))}
                    </div>
                  );
                })}
                {!groups.length && <div className="cd-rb-empty">{t("noBlocks")}</div>}
              </div>
            )}
            {leftTab === "outline" && (
              <div className="cd-rb-scroll">
                {project.blocks.map((b, i) => {
                  const page = pageOf(b.id);
                  const start = i === 0 || pageOf(project.blocks[i - 1].id) !== page;
                  const label = isText(b) || b.type === "list" || b.type === "quote" || b.type === "pre" ? plainText(fillFields(b.text, fields)) : b.type === "pagebreak" ? t("pagebreak") : b.type === "canvas" ? t("freePage") : b.type === "image" ? (typeof b.caption === "string" && b.caption) || t("image") : b.title || tr(kindOf(b)?.label, lang) + (b.indicator ? " · " + b.indicator : "");
                  return (
                    <React.Fragment key={b.id}>
                      {start && (
                        <div className="cd-rb-outline__page">
                          {t("page")} {page}
                        </div>
                      )}
                      <button
                        type="button"
                        className={sel?.id === b.id ? "cd-rb-outline cd-rb-outline--on" : "cd-rb-outline"}
                        style={{ paddingLeft: b.type === "heading" ? 8 + ((b.level || 1) - 1) * 10 : 20 + 20, fontWeight: b.type === "heading" ? 700 : 400 }}
                        onClick={() => {
                          setPanel(null);
                          if (multiPage) setZoom(1);
                          if (editor) setTimeout(() => selectBlock(editor, b.id), multiPage ? 80 : 0);
                        }}
                      >
                        <Icon d={kindIcon(b.type, b.kind)} size={14} />
                        <span>{label}</span>
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </aside>
        )}

        <main ref={pagesRef} className={"cd-rb-pages " + pan.className} aria-label={t("pages")}>
          <div className={multiPage ? "cd-rb-zoomer cd-rb-zoomer--multi" : "cd-rb-zoomer"} style={zoomerStyle}>
            {design.cover && (
              <div
                className={"cd-rb-page cd-rb-cover cd-rb-cover--" + cover.layout + (panel === "cover" ? " cd-rb-cover--editing" : "")}
                style={{ ...pageStyle, ["--rb-accent" as string]: design.accent }}
                onClick={() => !preview && setPanel("cover")}
                title={preview ? undefined : t("editCover")}
              >
                <div className="cd-rb-cover__inner" style={cover.layout === "full" ? { background: design.accent } : undefined}>
                  {cover.layout === "photo" && (cover.photo ? <img className="cd-rb-cover__photo" src={cover.photo} alt="" /> : <div className="cd-rb-cover__photo cd-rb-cover__photo--empty">{t("choosePhoto")}</div>)}
                  <div className="cd-rb-cover__text">
                    {(cover.show_flag && props.flag) || cover.logos.length ? (
                      <div className="cd-rb-cover__marks">
                        {cover.show_flag && props.flag && <img src={props.flag} alt="" />}
                        {cover.logos.map((l, i) => (
                          <img key={i} src={l.src} alt={l.name || ""} />
                        ))}
                      </div>
                    ) : null}
                    {/* the cover's texts are typed on it (as Word's cover page placeholders); the rest is in its pane */}
                    {(cover.kicker || !preview) && (
                      <CoverText
                        className="cd-rb-cover__kicker"
                        style={{ color: cover.layout === "full" ? "#fff" : design.accent }}
                        value={plainText(cover.kicker || "")}
                        shown={plainText(fillFields(cover.kicker || "", fields))}
                        placeholder={t("coverAddKicker")}
                        editable={!preview}
                        onChange={(v) => setCover({ kicker: v })}
                      />
                    )}
                    <CoverText
                      className="cd-rb-cover__title"
                      style={{ fontFamily: font.heading, fontSize: pt(design.title_size) }}
                      value={cover.title || project.name}
                      shown={coverTitle}
                      placeholder={t("coverAddTitle")}
                      editable={!preview}
                      multiline
                      onChange={(v) => setCover({ title: v })}
                    />
                    {(cover.subtitle || !preview) && (
                      <CoverText
                        className="cd-rb-cover__sub"
                        value={cover.subtitle || ""}
                        shown={fillFields(cover.subtitle || "", fields)}
                        placeholder={t("coverAddSubtitle")}
                        editable={!preview}
                        multiline
                        onChange={(v) => setCover({ subtitle: v })}
                      />
                    )}
                    {editors.length > 0 && (
                      <div className="cd-rb-cover__editors">
                        {editors.map((e, i) => (
                          <div key={i}>
                            <b>{e.name}</b>
                            {e.role ? <span> · {e.role}</span> : null}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="cd-rb-cover__date">{fields.report_date || ""}</div>
                    {(cover.reference || !preview) && (
                      <CoverText
                        className="cd-rb-cover__date"
                        value={cover.reference || ""}
                        shown={fillFields(cover.reference || "", fields)}
                        placeholder={t("coverAddReference")}
                        editable={!preview}
                        onChange={(v) => setCover({ reference: v })}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
            {design.contents && (
              <div className="cd-rb-page" style={pageStyle}>
                <Head />
                <div className="cd-rb-h1" style={headingStyle(1)}>
                  {t("contents")}
                </div>
                {headings.map((h) => (
                  <div key={h.id} className={h.level === 1 ? "cd-rb-toc" : "cd-rb-toc cd-rb-toc--2"}>
                    <span>{plainText(fillFields(h.text, fields))}</span>
                    <span className="cd-rb-toc__dots" />
                    <span>{pageOf(h.id)}</span>
                  </div>
                ))}
                <Foot n={design.cover ? 2 : 1} />
              </div>
            )}

            {/* the pages side by side, drawn from the last layout */}
            {multiPage &&
              Array.from({ length: flow.pages }, (_x, p) => (
                <div
                  key={"o" + p}
                  className="cd-rb-page cd-rb-page--overview"
                  style={{ ...pageStyle, height: box.h, minHeight: 0, position: "relative", overflow: "hidden" }}
                  role="button"
                  tabIndex={0}
                  title={t("page") + " " + (p + firstFlowPage)}
                  onClick={() => goToPage(p)}
                  onKeyDown={(e) => e.key === "Enter" && goToPage(p)}
                >
                  <Head />
                  <div className="cd-rb-overview__clip" style={{ left: box.padX, right: box.padX, top: box.padTop, height: box.contentH + 4 }}>
                    <div className="cd-rb-flowtext" style={{ ...themeVars, position: "relative", top: -p * (box.h + GAP) }} dangerouslySetInnerHTML={{ __html: overviewHtml }} />
                  </div>
                  <Foot n={p + firstFlowPage} />
                </div>
              ))}

            {/* the pages being edited: sheets behind one continuous document; gaps in the text reach each next sheet */}
            <div
              className="cd-rb-flowpages"
              style={{ width: box.w, height: flow.pages * (box.h + GAP) - GAP, display: multiPage ? "none" : undefined }}
              onMouseDown={(e) => {
                // a click on the page below the text puts the caret at the end, as in Word
                const target = e.target as HTMLElement;
                if (!preview && editor && (target.classList.contains("cd-rb-sheet") || target.classList.contains("cd-rb-flowpages"))) {
                  e.preventDefault();
                  editor.commands.focus("end");
                }
              }}
              onDragOver={(e) => dropping && e.preventDefault()}
              onDrop={(e) => {
                const data = e.dataTransfer.getData(BLOCK_MIME);
                if (!data || !editor) return;
                e.preventDefault();
                insertBlock(editor, fromTemplate(JSON.parse(data)), editor.state.doc.content.size);
                setDropping(false);
              }}
            >
              {Array.from({ length: flow.pages }, (_x, p) => (
                <div key={p} className="cd-rb-page cd-rb-sheet" style={{ ...pageStyle, position: "absolute", left: 0, top: p * (box.h + GAP), height: box.h, minHeight: 0 }}>
                  <Head />
                  <Foot n={p + firstFlowPage} />
                </div>
              ))}
              <div className="cd-rb-flowwrap" style={{ ...themeVars, position: "relative", padding: `${box.padTop}px ${box.padX}px 0`, color: design.text_color }}>
                <FlowContext.Provider value={ctx}>
                  <EditorContent editor={editor} />
                </FlowContext.Provider>
              </div>
            </div>
          </div>
        </main>

        {/* the theme and the cover are edited in a task pane opened from the ribbon (Design, Insert) or by clicking the
            cover, as Word's panes; everything about a selected block is on the ribbon */}
        {!preview && panel && (
          <aside className="cd-rb-right" aria-label={t("settings")}>
            {panel === "theme" && <ThemePanel design={design} themes={props.themes} fonts={props.fonts} texts={texts} onDesign={setDesign} onClose={() => setPanel(null)} />}
            {panel === "cover" && <CoverPanel cover={cover} flag={props.flag} texts={texts} onCover={setCover} onClose={() => setPanel(null)} />}
          </aside>
        )}
      </div>

      {/* the status bar, as Word's: the page the caret is on, the words and characters */}
      <div className="cd-rb-status" role="status" aria-live="off">
        <span>
          {t("page")} {state?.at ? pageOf(state.at) : firstFlowPage} {t("of")} {total}
        </span>
        <span>
          {(state?.words ?? 0).toLocaleString()} {t("words")}
        </span>
        <span>
          {(state?.chars ?? 0).toLocaleString()} {t("characters")}
        </span>
        <span className="cd-rb-grow" />
        <button type="button" className={leftOpen && !preview ? "cd-rb-view cd-rb-view--on" : "cd-rb-view"} aria-pressed={leftOpen} aria-label={t("showBlocksPanel")} title={t("showBlocksPanel")} disabled={preview} onClick={() => setLeftOpen(!leftOpen)}>
          <Icon d={["M4 5h16v14H4z", "M9 5v14"]} size={15} />
        </button>
        <button type="button" className="cd-rb-view cd-rb-view--text" aria-label={t("focus")} title={t("focusHint")} onClick={enterFocus}>
          <Icon d={["M4 9V4h5", "M20 9V4h-5", "M4 15v5h5", "M20 15v5h-5", "M9 8h6v8H9z"]} size={15} />
          <span>{t("focus")}</span>
        </button>
        {/* the views: editing, reading (no editing marks), and the print layout (the pages Word makes) */}
        <div className="cd-rb-views" role="group" aria-label={t("views")}>
          <button type="button" className={!preview ? "cd-rb-view cd-rb-view--on" : "cd-rb-view"} aria-pressed={!preview} aria-label={t("viewEdit")} title={t("viewEdit")} onClick={() => setPreview(false)}>
            <Icon d={["M4 20h4L19 9l-4-4L4 16z", "M13 7l4 4"]} size={15} />
          </button>
          <button type="button" className={preview ? "cd-rb-view cd-rb-view--on" : "cd-rb-view"} aria-pressed={preview} aria-label={t("viewRead")} title={t("viewRead")} onClick={() => setPreview(true)}>
            <Icon d={ICONS.eye} size={15} />
          </button>
          <button type="button" className={props.finalState ? "cd-rb-view cd-rb-view--on" : "cd-rb-view"} aria-pressed={!!props.finalState} aria-label={t("viewPrint")} title={t("viewPrint") + " – " + t("finalHint")} onClick={finalPages}>
            <Icon d={ICONS.pages} size={15} />
          </button>
        </div>
        <HandButton on={hand} onToggle={() => setHand(!hand)} t={t} />
        <ZoomControl zoom={zoom} onZoom={setZoom} max={4} fits={[[t("fitWidth"), () => fit("width")], [t("fitPage"), () => fit("page")]]} t={t} />
      </div>
      {focusMode && (
        <button type="button" className="cd-rb-focusexit" onClick={leaveFocus} title={t("leaveFocus") + " (Esc)"}>
          <Icon d={ICONS.close} size={14} />
          <span>{t("leaveFocus")}</span>
        </button>
      )}
      {linkBox && (
        <div className="cd-pop cd-rb-linkbox" role="dialog" aria-label={t("link")} style={{ position: "fixed", top: linkBox.top, left: linkBox.left }}>
          <label>
            <span>{t("linkAddress")}</span>
            <input
              type="text"
              className="cd-input"
              autoFocus
              value={linkBox.href}
              placeholder="https://"
              onChange={(e) => setLinkBox({ ...linkBox, href: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setLink(linkBox.href);
                  setLinkBox(null);
                } else if (e.key === "Escape") {
                  setLinkBox(null);
                  editorRef.current?.commands.focus();
                }
              }}
            />
          </label>
          <div className="cd-rb-linkbtns">
            <button type="button" className="cd-rb-btn cd-rb-btn--primary" onClick={() => { setLink(linkBox.href); setLinkBox(null); }}>
              {t("apply")}
            </button>
            <button type="button" className="cd-rb-btn" onClick={() => { setLink(""); setLinkBox(null); }}>
              {t("removeLink")}
            </button>
          </div>
        </div>
      )}
      {notice && (
        <div className="cd-rb-notice" role="status">
          <span>{notice}</span>
          <button type="button" className="cd-rb-icon cd-rb-icon--small" aria-label={t("close")} onClick={() => setNotice(null)}>
            <Icon d={ICONS.close} size={14} />
          </button>
        </div>
      )}
      {!preview && styleFor && sel && sel.id === styleFor && sel.type === "chart" && (
        <ChartStylePop anchorId={"rb-" + sel.id} deps={[zoom, flow.pages]} onClose={() => setStyleFor(null)}>
          <ChartStyle block={sel} preview={previews[sel.id]} schema={props.chartSchema} texts={texts} onUpdate={onPicked.update} onClose={() => setStyleFor(null)} />
        </ChartStylePop>
      )}

      {dialog && (
        <ExportDialog
          format={dialog}
          setFormat={(f) => setDialog(f === "pdf" ? "pdf" : "docx")}
          exportState={props.exportState}
          converter={props.converter}
          summary={`${total} ${t("pages")} · ${project.blocks.filter((b) => isData(b)).length} ${t("chartsAndTables")} · ${({ a4: "A4", letter: "Letter", a3: "A3", chartbook: t("sizeChartbook"), poster: t("sizePoster") } as Record<string, string>)[design.size] || "A4"}`}
          texts={texts}
          onStart={() => {
            // what was just typed is saved first: R writes the file from the saved report
            sync(true);
            send(projRef.current, true);
            props.onExport(dialog);
          }}
          onClose={() => {
            setDialog(null);
            props.onExportClosed();
          }}
        />
      )}
      {props.finalState && <FinalPages state={props.finalState} converter={props.converter} texts={texts} onRefresh={finalPages} onClose={props.onFinalClosed} />}
    </div>
  );
}
