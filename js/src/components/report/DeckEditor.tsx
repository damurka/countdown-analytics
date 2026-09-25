import React, { useEffect, useRef, useState } from "react";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { tr, useLang } from "../../lang";
import type { LocalText } from "../../lang";
import { copySlide, fillCrop, isTextItem, LAYOUT_IDS, LAYOUTS, newId, newSlide, relayoutSlide, resetSlide, round, signDeck, slideSize } from "./deck";
import { ExportDialog, FinalPages } from "./dialogs";
import { PX } from "./layout";
import { ChartStyle, ThemePanel } from "./panels";
import { Ribbon } from "./Ribbon";
import type { DeckCommands } from "./Ribbon";
import { BoxCanvas, canvasFields, useBoxEditing } from "./kit/BoxCanvas";
import type { Box } from "./kit/BoxCanvas";
import { ChartStylePop } from "./kit/ChartStylePop";
import { EditorTopBar, HandButton, ZoomControl } from "./kit/frame";
import { usePan } from "./kit/usePan";
import { readImage } from "./panels";
import { themeDesign, usePictureStore } from "./kit/pictures";
import { useReportProject } from "./kit/useReportProject";
import { fullCover, fullDesign } from "./types";
import type { RbBlock, RbChartSchema, RbExportState, RbField, RbFinalState, RbKind, RbPreview, RbProject, RbSlide, RbSlideItem, RbTheme, SlideLayout, Texts } from "./types";
import { Icon, ICONS, kindIcon } from "./ui";

// The slide deck builder (PowerPoint's): the slides down the left, the slide being edited in the middle with its notes
// under it, the ribbon above. What is on a slide (text boxes, charts, tables, pictures) sits in boxes that are moved and
// resized with the mouse (with guides to the slide's middle and edges and to the other boxes) or the arrow keys; a text
// box is typed in place with the ribbon's font and paragraph commands. cd2030.core::export_deck() writes the PowerPoint
// file (every box where it is here), and the PDF from it.

interface Props {
  project: RbProject;
  kinds: RbKind[];
  regions: string[];
  years: number[];
  previews: Record<string, RbPreview>;
  assets: Record<string, string>;
  onAsset: (id: string, src: string) => void;
  onAssetUrl: (id: string, url: string) => void;
  assetDone: { id: string; ratio: number } | null;
  themes: RbTheme[];
  fonts: string[];
  fieldCatalog: RbField[];
  fields: Record<string, string>;
  converter?: string | null;
  chartSchema: RbChartSchema;
  exportState: RbExportState | null;
  finalState: RbFinalState | null;
  saving: boolean;
  texts: Texts;
  onChange: (p: RbProject) => void;
  onClose: () => void;
  onExport: (format: "pptx" | "pdf") => void;
  onExportClosed: () => void;
  onFinal: () => void;
  onFinalClosed: () => void;
  /** An Office file to make a theme from, and the theme made (applied when it arrives). */
  onThemeFile?: (file: File) => void;
  themeArrived?: { theme?: RbTheme; failed?: string; nonce: number } | null;
}

const normalise = (p: RbProject, appLang: string): RbProject => {
  const design = fullDesign({ ...p.design, slide_size: p.design?.slide_size || "16:9" });
  const slides = p.slides && p.slides.length ? p.slides : [newSlide("title", design)];
  return signDeck({ ...p, kind: "deck", design, cover: fullCover(p.cover), blocks: [], slides }, appLang);
};

export function DeckEditor(props: Props) {
  const { kinds, regions, years, previews, texts, fields } = props;
  const lang = useLang();
  const t = (k: string) => tr(texts[k] as LocalText, lang) || k;
  const rp = useReportProject(() => normalise(props.project, lang), (p) => signDeck(p, lang), props.onChange);
  const { project, send, commit } = rp;
  const projRef = rp.ref;
  const [at, setAt] = useState(0);
  const [textEditor, setTextEditor] = useState<Editor | null>(null);
  const [zoom, setZoomState] = useState(1);
  const [fitted, setFitted] = useState(true);
  const [view, setView] = useState<"normal" | "sorter" | "reading">("normal");
  const [notesOpen, setNotesOpen] = useState(true);
  const [show, setShow] = useState<number | null>(null);
  const [dialog, setDialog] = useState<null | "pptx" | "pdf">(null);
  const [panel, setPanel] = useState<null | "theme">(null);
  const [styleFor, setStyleFor] = useState<string | null>(null);
  const [cropFor, setCropFor] = useState<string | null>(null);
  const [kindPick, setKindPick] = useState<{ item: string; type: "chart" | "table" } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const design = project.design;
  const [W, H] = slideSize(design);
  const slides = project.slides || [];
  const slide = slides[Math.min(at, slides.length - 1)] || slides[0];
  // the slide's boxes: selected, moved, resized, typed in (kit/BoxCanvas)
  const boxes = useBoxEditing({
    items: slide?.items || [],
    size: [W, H],
    zoom,
    active: view === "normal" && show === null,
    onBox: (id, box) => setItem(id, box),
    onRemove: (id) => removeItem(id),
    onDuplicate: (id) => duplicateItem(id),
    onPaste: (items) => setSlide(slide.id, (s) => ({ ...s, items: s.items.concat(items) })),
    cropFor,
    setCropFor
  });
  const { selected, setSelected, editing, setEditing, editAt, setEditAt, live, guides, onItemDown, onHandleDown } = boxes;
  const item = slide?.items.find((it) => it.id === selected) || null;

  // a deck is opened: sent straight back, which is what makes R draw its charts
  useEffect(() => {
    rp.open(normalise(props.project, lang));
    setAt(0);
  }, [props.project.id]);

  const undo = () => {
    setEditing(null);
    rp.undo();
  };
  const redo = () => {
    setEditing(null);
    rp.redo();
  };

  // ---- slides and their items
  const setSlides = (make: (slides: RbSlide[]) => RbSlide[], history = true) => commit((p) => ({ ...p, slides: make(p.slides || []) }), history);
  const setSlide = (id: string, make: (s: RbSlide) => RbSlide, history = true) => setSlides((all) => all.map((s) => (s.id === id ? make(s) : s)), history);
  const setItem = (itemId: string, patch: Partial<RbSlideItem>, history = true) =>
    setSlide(slide.id, (s) => ({ ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }), history);
  const setBlock = (itemId: string, patch: Partial<RbBlock>, history = true) =>
    setSlide(slide.id, (s) => ({ ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, block: { ...it.block, ...patch } } : it)) }), history);
  // (`count`: how many slides there are once a slide just added is counted)
  const go = (i: number, count = slides.length) => {
    setAt(Math.max(0, Math.min(count - 1, i)));
    setSelected(null);
    setEditing(null);
    setCropFor(null);
  };
  const addSlide = (layout: SlideLayout, after = at) => {
    const s = newSlide(layout, design);
    setSlides((all) => [...all.slice(0, after + 1), s, ...all.slice(after + 1)]);
    go(after + 1, slides.length + 1);
  };
  const duplicateSlide = (i = at) => {
    setSlides((all) => [...all.slice(0, i + 1), copySlide(all[i]), ...all.slice(i + 1)]);
    go(i + 1, slides.length + 1);
  };
  const deleteSlide = (i = at) => {
    if (slides.length <= 1) return;
    setSlides((all) => all.filter((_, k) => k !== i));
    go(Math.min(i, slides.length - 2));
  };
  const moveSlide = (from: number, to: number) => {
    if (from === to) return;
    setSlides((all) => {
      const next = all.slice();
      const [s] = next.splice(from, 1);
      next.splice(to, 0, s);
      return next;
    });
    setAt(to);
  };
  /** A new item on the slide: in the middle, or in the empty content placeholder it fills. */
  const addItem = (block: Partial<RbBlock>, size?: Box, replace?: string) => {
    const id = newId("i");
    const box = size || { x: W * 0.2, y: H * 0.22, w: W * 0.6, h: H * 0.6 };
    const it: RbSlideItem = { id, x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h), block: { ...block, id } as RbBlock };
    setSlide(slide.id, (s) => {
      if (!replace) return { ...s, items: s.items.concat([it]) };
      return { ...s, items: s.items.map((x) => (x.id === replace ? { ...it, role: x.role, x: x.x, y: x.y, w: x.w, h: x.h } : x)) };
    });
    setSelected(id);
    setEditing(null);
    return id;
  };
  const removeItem = (id: string) => {
    setSlide(slide.id, (s) => ({ ...s, items: s.items.filter((it) => it.id !== id) }));
    setSelected(null);
    setEditing(null);
  };
  const duplicateItem = (id: string) => {
    const src = slide.items.find((it) => it.id === id);
    if (!src) return;
    const nid = newId("i");
    setSlide(slide.id, (s) => ({ ...s, items: s.items.concat([{ ...src, id: nid, x: round(src.x + 0.2), y: round(src.y + 0.2), role: undefined, block: { ...src.block, id: nid } }]) }));
    setSelected(nid);
  };
  /** The stacking order: forward (-1 in the toolbar, as "up") or backward. */
  const restack = (id: string, dir: number) =>
    setSlide(slide.id, (s) => {
      const i = s.items.findIndex((it) => it.id === id);
      const j = dir < 0 ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= s.items.length) return s;
      const items = s.items.slice();
      [items[i], items[j]] = [items[j], items[i]];
      return { ...s, items };
    });

  // pictures are kept once in the dataset ("asset:<id>")
  const pictures = usePictureStore(props);
  const assetOf = pictures.assetOf;
  const pictureBox = (ratio: number, within?: Box): Box => {
    const area = within || { x: W * 0.15, y: H * 0.15, w: W * 0.7, h: H * 0.7 };
    let w = area.w;
    let h = w * ratio;
    if (h > area.h) {
      h = area.h;
      w = h / ratio;
    }
    return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
  };
  const addPicture = (img: { src: string; ratio: number }, replace?: RbSlideItem) => {
    // a picture placeholder is filled: the picture takes its box, cut to its shape
    if (replace?.role === "picture") {
      const src = assetOf(img.src);
      setSlide(slide.id, (s) => ({
        ...s,
        items: s.items.map((x) => (x.id === replace.id ? { ...x, block: { id: x.id, type: "image", src, ratio: img.ratio, shape: "rect", crop: fillCrop(img.ratio, x.w, x.h) } } : x))
      }));
      return;
    }
    const box = pictureBox(img.ratio, replace);
    const id = addItem({ type: "image", src: assetOf(img.src), ratio: img.ratio, shape: "rect" }, box);
    if (replace) setSlide(slide.id, (s) => ({ ...s, items: s.items.filter((x) => x.id !== replace.id).map((x) => (x.id === id ? { ...x, role: replace.role } : x)) }), false);
  };
  // a picture from a web address: R downloads it; it is added when it arrives
  const addPictureFromUrl = (url: string) => pictures.fromUrl(url, (src, ratio) => addItem({ type: "image", src, ratio, shape: "rect" }, pictureBox(ratio)));

  // ---- the deck's keys (the boxes' are useBoxEditing's): Ctrl+M a new slide, F5 the slide show, Ctrl+Z / Y, and Page
  // Up / Down (or the arrows when nothing is selected) from slide to slide
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (show !== null) return;
      const typing = !!(e.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "m") {
        e.preventDefault();
        addSlide(slide.layout === "title" ? "title_content" : slide.layout);
      } else if (e.key === "F5") {
        e.preventDefault();
        setShow(e.shiftKey ? at : 0);
      } else if (typing) {
        return;
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (!selected && (e.key === "PageDown" || e.key === "ArrowDown" || e.key === "ArrowRight")) {
        e.preventDefault();
        go(at + 1);
      } else if (!selected && (e.key === "PageUp" || e.key === "ArrowUp" || e.key === "ArrowLeft")) {
        e.preventDefault();
        go(at - 1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // ---- zoom: the slide fitted to the space it has (until zoomed by hand)
  const setZoom = (z: number) => {
    setFitted(false);
    setZoomState(Math.min(4, Math.max(0.2, Math.round(z * 100) / 100)));
  };
  const fit = () => {
    const el = stageRef.current;
    if (!el) return;
    setFitted(true);
    setZoomState(Math.max(0.2, Math.min((el.clientWidth - 48) / (W * PX), (el.clientHeight - 40) / (H * PX))));
  };
  // the slide stays fitted while the window changes, until it is zoomed by hand (then the zoom is kept: zooming must not
  // snap back to the fit)
  const fittedRef = useRef(fitted);
  fittedRef.current = fitted;
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => fittedRef.current && fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H, view]);
  useEffect(() => {
    if (fitted) fit();
  }, [W, H, notesOpen, view]);
  // Ctrl + mouse wheel zooms
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setFitted(false);
      setZoomState((z) => Math.min(4, Math.max(0.2, Math.round(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1) * 100) / 100)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view]);
  // the hand (and Space, and the middle button) moves the view when the slide is bigger than it
  const [hand, setHand] = useState(false);
  const pan = usePan(stageRef, hand);

  // pictures dropped on the slide (where they are dropped) or pasted (in the middle)
  const slideAt = (clientX: number, clientY: number) => {
    const el = stageRef.current?.querySelector(".cd-rb-slide");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: (clientX - r.left) / zoom / PX, y: (clientY - r.top) / zoom / PX };
  };
  const dropPictures = (files: File[], at?: { x: number; y: number } | null) => {
    files
      .filter((f) => f.type.startsWith("image/"))
      .forEach((file, k) =>
        readImage(file).then((img) => {
          if (!at) return addPicture(img);
          const w = Math.min(W * 0.5, (H * 0.6) / img.ratio);
          const h = w * img.ratio;
          const x = Math.max(0, Math.min(W - w, at.x - w / 2 + k * 0.25));
          const y = Math.max(0, Math.min(H - h, at.y - h / 2 + k * 0.25));
          addItem({ type: "image", src: assetOf(img.src), ratio: img.ratio, shape: "rect" }, { x, y, w, h });
        })
      );
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (view !== "normal" || show !== null) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]")) return;
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      dropPictures(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  // ---- the ribbon: text commands on the text box being typed in; the selected chart / picture's own tabs
  const edState = useEditorState({
    editor: textEditor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            align: (["center", "right", "justify"] as const).find((a) => ed.isActive({ textAlign: a })) || "left",
            list: ed.isActive("bulletList") ? "bullet" : ed.isActive("orderedList") ? "number" : null,
            canUndo: ed.can().undo(),
            canRedo: ed.can().redo()
          }
        : null
  });
  const current: RbBlock | null = editing && item ? { id: item.id, type: "paragraph", align: (edState?.align as RbBlock["align"]) || "left" } : null;
  const sel = item && !isTextItem(item) ? { ...item.block, id: item.id } : null;
  const onBlock = (patch: Partial<RbBlock>) => {
    if (textEditor && patch.align) textEditor.chain().focus().setTextAlign(patch.align).run();
    else if (item && isTextItem(item) && patch.align) setBlock(item.id, { align: patch.align });
  };
  const toggleList = (kind: "bullet" | "number") => {
    if (!textEditor) return;
    const c = textEditor.chain().focus();
    (kind === "bullet" ? c.toggleBulletList() : c.toggleOrderedList()).run();
  };
  const indent = (dir: 1 | -1) => {
    if (!textEditor) return;
    if (dir > 0) textEditor.chain().focus().sinkListItem("listItem").run();
    else textEditor.chain().focus().liftListItem("listItem").run();
  };
  const onInsert = (block: Partial<RbBlock>) => {
    if (block.type === "image" && typeof block.src === "string") {
      addPicture({ src: block.src, ratio: block.ratio || 0.6 });
      return;
    }
    if (block.type === "chart" || block.type === "table") {
      const target = kindPick ? slide.items.find((x) => x.id === kindPick.item) : undefined;
      setKindPick(null);
      if (target) {
        addItem(block, undefined, target.id);
        return;
      }
      addItem(block, { x: W * 0.1, y: H * 0.2, w: W * 0.8, h: H * 0.7 });
      return;
    }
    addItem({ type: "paragraph", text: block.text || "" }, { x: W * 0.3, y: H * 0.4, w: W * 0.4, h: H * 0.15 });
  };
  const deck: DeckCommands = {
    layouts: LAYOUT_IDS.map((id) => ({ id, label: t("layout_" + id), items: LAYOUTS[id] })),
    layout: slide?.layout,
    onNewSlide: (l) => addSlide(l as SlideLayout),
    onLayout: (l) => setSlide(slide.id, (s) => relayoutSlide(s, l as SlideLayout, design)),
    onResetSlide: () => setSlide(slide.id, (s) => resetSlide(s, design)),
    onDuplicateSlide: () => duplicateSlide(),
    onDeleteSlide: () => deleteSlide(),
    onTextBox: () => {
      const id = addItem({ type: "paragraph", text: "" }, { x: W * 0.3, y: H * 0.42, w: W * 0.4, h: H * 0.14 });
      setEditAt(null);
      setEditing(id);
    },
    slideSize: design.slide_size === "4:3" ? "4:3" : "16:9",
    onSlideSize: (size) => {
      // the boxes keep their place relative to the slide's width
      const [oldW] = slideSize(design);
      const [newW] = slideSize({ ...design, slide_size: size });
      const k = newW / oldW;
      commit((p) => ({
        ...p,
        design: { ...p.design, slide_size: size },
        slides: (p.slides || []).map((s) => ({ ...s, items: s.items.map((it) => ({ ...it, x: round(it.x * k), w: round(it.w * k) })) }))
      }));
    }
  };

  // a theme made from an Office file: applied when it arrives, with its slide size
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const a = props.themeArrived;
    if (!a) return;
    if (a.theme) {
      const th = a.theme;
      commit((p) => ({ ...p, design: { ...p.design, ...themeDesign(th) } }));
      if (th.slide_size && th.slide_size !== (design.slide_size || "16:9")) deck.onSlideSize(th.slide_size);
    }
    setNotice(a.failed ? t("themeFileFailed") + " " + a.failed : a.theme ? t("themeFileDone") : null);
  }, [props.themeArrived?.nonce]);
  const fieldsOf = (s: RbSlide) => canvasFields(s.items, fields, kinds, years, project.lang || lang, tr(texts.and as LocalText, project.lang || lang) || "and");
  // (the editor keeps the callback it was made with: only the text is changed, on the deck as it is now)
  const onText = (it: RbSlideItem, html: string) =>
    setSlides((all) => all.map((s) => (s.items.some((x) => x.id === it.id) ? { ...s, items: s.items.map((x) => (x.id === it.id ? { ...x, block: { ...x.block, text: html } } : x)) } : s)), false);
  // what is typed is one step of the deck's undo: the deck as it was when typing started
  const typedFrom = useRef<string | null>(null);
  useEffect(() => {
    if (editing && typedFrom.current !== editing) {
      typedFrom.current = editing;
      rp.snapshot();
    }
    if (!editing) typedFrom.current = null;
  }, [editing]);

  const onFill = (it: RbSlideItem, what: "chart" | "table" | "picture", img?: { src: string; ratio: number }) => {
    if (what === "picture" && img) addPicture(img, it);
    else if (what !== "picture") setKindPick({ item: it.id, type: what });
  };
  const onCrop = (it: RbSlideItem, crop: RbBlock["crop"] | undefined) => {
    // the box keeps the picture's scale: it is as much smaller as the part cut off
    const old = it.block.crop || [0, 0, 0, 0];
    const nw = crop || [0, 0, 0, 0];
    const kx = (100 - nw[1] - nw[3]) / Math.max(5, 100 - old[1] - old[3]);
    const ky = (100 - nw[0] - nw[2]) / Math.max(5, 100 - old[0] - old[2]);
    setItem(it.id, { w: round(it.w * kx), h: round(it.h * ky), block: { ...it.block, crop } });
  };

  const total = slides.length;
  const slideW = W * PX;
  const railScale = 168 / slideW;

  const thumb = (s: RbSlide, scale: number) => (
    <div className="cd-rb-slidethumb" style={{ width: slideW * scale, height: H * PX * scale }}>
      <div style={{ zoom: scale }}>
        <BoxCanvas slide={s} design={design} fields={fieldsOf(s)} previews={previews} assets={props.assets} t={t} />
      </div>
    </div>
  );

  // the slide show: one slide at a time on the whole screen; a click, the arrows or space go on, Esc stops
  const showRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (show === null) return undefined;
    showRef.current?.requestFullscreen?.().catch(() => undefined);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShow(null);
      else if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) setShow((i) => (i === null ? null : i + 1 >= total ? null : i + 1));
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) setShow((i) => (i === null ? null : Math.max(0, i - 1)));
      else return;
      e.preventDefault();
    };
    const onFs = () => !document.fullscreenElement && setShow(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, [show === null]);
  const showScale = Math.min(window.innerWidth / slideW, window.innerHeight / (H * PX));

  const railDrag = useRef<number | null>(null);
  const kindsOf = (type: "chart" | "table") => kinds.filter((k) => k.type === type);

  return (
    <div className="cd-rb cd-rb--deck">
      <EditorTopBar
        name={project.name}
        onName={(name) => commit((p) => ({ ...p, name }))}
        summary={`${t("slideDeck")} · ${total} ${t("slidesCount")} · ${props.saving ? t("saving") : t("saved")}`}
        t={t}
        onClose={props.onClose}
        onDownload={() => setDialog("pptx")}
      >
        <button type="button" className="cd-rb-btn" onClick={() => setShow(0)} title={t("slideShow") + " (F5)"}>
          <Icon d={["M4 5h16v11H4z", "M10 8.5v4.5l4-2.25z", "M9 20h6"]} size={16} />
          {t("slideShow")}
        </button>
      </EditorTopBar>

      {view !== "reading" && (
        <Ribbon
          design={design}
          themes={props.themes}
          fonts={props.fonts}
          kinds={kinds}
          canUndo={!!edState?.canUndo || rp.canUndo}
          canRedo={!!edState?.canRedo || rp.canRedo}
          onUndo={() => (edState?.canUndo && textEditor ? textEditor.chain().focus().undo().run() : undo())}
          onRedo={() => (edState?.canRedo && textEditor ? textEditor.chain().focus().redo().run() : redo())}
          fieldCatalog={props.fieldCatalog}
          fields={fields}
          current={current}
          texts={texts}
          onStyle={() => undefined}
          styleNow={null}
          listNow={(edState?.list as "bullet" | "number" | null) || null}
          onList={toggleList}
          onIndent={indent}
          onBlock={onBlock}
          onInsert={onInsert}
          onInsertUrl={addPictureFromUrl}
          onOpenBlocks={() => undefined}
          selected={sel}
          selectedKind={sel ? kinds.find((k) => k.kind === sel.kind) : undefined}
          entries={sel ? previews[sel.id]?.entries : undefined}
          facets={sel ? previews[sel.id]?.facets : undefined}
          years={years}
          onSelected={(patch) => item && setBlock(item.id, patch)}
          onCustomize={() => item && setStyleFor(item.id)}
          cropping={!!item && cropFor === item.id}
          onCropMode={() => item && setCropFor(cropFor === item.id ? null : item.id)}
          onMove={(d) => item && restack(item.id, d)}
          onDuplicate={() => item && duplicateItem(item.id)}
          onRemove={() => item && removeItem(item.id)}
          textBox={
            item && isTextItem(item) && item.role !== "picture" && editing !== item.id
              ? { id: item.id, fill: item.block.fill, fill_opacity: item.block.fill_opacity, outline: item.block.outline, onPatch: (patch) => setBlock(item.id, patch) }
              : undefined
          }
          onDesign={(patch) => commit((p) => ({ ...p, design: { ...p.design, ...patch } }))}
          regions={regions}
          region={project.region}
          onRegion={(r) => commit((p) => ({ ...p, region: r || undefined }))}
          reportLang={project.lang || (lang as RbProject["lang"])}
          onReportLang={(l) => commit((p) => ({ ...p, lang: l }))}
          onTheme={(th) => commit((p) => ({ ...p, design: { ...p.design, ...themeDesign(th) } }))}
          onPanel={(pn) => pn === "theme" && setPanel("theme")}
          onThemeFile={props.onThemeFile}
          deck={deck}
        />
      )}

      <div className="cd-rb-body">
        {view === "normal" && (
          <aside className="cd-rb-left cd-rb-rail" aria-label={t("slidesGroup")}>
            <div className="cd-rb-scroll">
              {slides.map((s, i) => (
                <div
                  key={s.id}
                  className={i === at ? "cd-rb-railitem cd-rb-railitem--on" : "cd-rb-railitem"}
                  draggable
                  onDragStart={() => (railDrag.current = i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (railDrag.current !== null) moveSlide(railDrag.current, i);
                    railDrag.current = null;
                  }}
                  onClick={() => go(i)}
                  role="button"
                  tabIndex={0}
                  aria-label={t("slide") + " " + (i + 1)}
                  aria-current={i === at}
                >
                  <span className="cd-rb-railitem__n">{i + 1}</span>
                  {thumb(s, railScale)}
                  <span className="cd-rb-railitem__tools">
                    <button type="button" aria-label={t("duplicateSlide")} title={t("duplicateSlide")} onClick={(e) => { e.stopPropagation(); duplicateSlide(i); }}>
                      <Icon d={ICONS.copy} size={12} />
                    </button>
                    <button type="button" aria-label={t("deleteSlide")} title={t("deleteSlide")} disabled={slides.length <= 1} onClick={(e) => { e.stopPropagation(); deleteSlide(i); }}>
                      <Icon d={ICONS.trash} size={12} />
                    </button>
                  </span>
                </div>
              ))}
              <button type="button" className="cd-rb-railnew" onClick={() => addSlide(slide?.layout === "title" ? "title_content" : slide?.layout || "title_content", slides.length - 1)}>
                <Icon d={ICONS.plus} size={14} />
                {t("newSlide")}
              </button>
            </div>
          </aside>
        )}

        {view === "sorter" ? (
          <main className="cd-rb-pages cd-rb-sorter" aria-label={t("slideSorter")}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={i === at ? "cd-rb-sortitem cd-rb-sortitem--on" : "cd-rb-sortitem"}
                draggable
                onDragStart={() => (railDrag.current = i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (railDrag.current !== null) moveSlide(railDrag.current, i);
                  railDrag.current = null;
                }}
                onClick={() => setAt(i)}
                onDoubleClick={() => {
                  setAt(i);
                  setView("normal");
                }}
              >
                {thumb(s, 260 / slideW)}
                <span>{i + 1}</span>
              </button>
            ))}
          </main>
        ) : (
          <main className="cd-rb-deckmain">
            <div
              ref={stageRef}
              className={"cd-rb-stage " + pan.className}
              onDragOver={(e) => {
                if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
              }}
              onDrop={(e) => {
                const files = Array.from(e.dataTransfer.files || []);
                if (!files.length) return;
                e.preventDefault();
                dropPictures(files, slideAt(e.clientX, e.clientY));
              }}
              onPointerDown={() => {
                setSelected(null);
                setEditing(null);
                setCropFor(null);
              }}
            >
              {slide && (
                <div className="cd-rb-slidewrap" style={{ zoom }}>
                  <BoxCanvas
                    slide={slide}
                    design={design}
                    fields={fieldsOf(slide)}
                    previews={previews}
                    assets={props.assets}
                    t={t}
                    interactive={view === "normal"}
                    selected={selected}
                    editing={editing}
                    editAt={editAt}
                    live={live}
                    cropFor={cropFor}
                    zoom={zoom}
                    guides={guides}
                    onItemDown={onItemDown}
                    onHandleDown={onHandleDown}
                    onText={onText}
                    onEditor={setTextEditor}
                    onFill={onFill}
                    onCrop={onCrop}
                    onCropDone={() => setCropFor(null)}
                  />
                </div>
              )}
            </div>
            {notesOpen && view === "normal" && slide && (
              <textarea
                className="cd-rb-notes"
                aria-label={t("speakerNotes")}
                placeholder={t("notesPlaceholder")}
                value={slide.notes || ""}
                onChange={(e) => setSlide(slide.id, (s) => ({ ...s, notes: e.target.value }), false)}
              />
            )}
          </main>
        )}
        {panel === "theme" && (
          <ThemePanel design={design} themes={props.themes} fonts={props.fonts} texts={texts} onDesign={(patch) => commit((p) => ({ ...p, design: { ...p.design, ...patch } }))} onClose={() => setPanel(null)} />
        )}
      </div>

      <div className="cd-rb-status" role="status">
        <span>
          {t("slide")} {Math.min(at + 1, total)} {t("of")} {total}
        </span>
        <span>{t(("layout_" + (slide?.layout || "blank")) as string)}</span>
        <span className="cd-rb-grow" />
        <button type="button" className={notesOpen ? "cd-rb-view cd-rb-view--text cd-rb-view--on" : "cd-rb-view cd-rb-view--text"} aria-pressed={notesOpen} onClick={() => setNotesOpen(!notesOpen)}>
          <Icon d={["M5 4h14v16H5z", "M8 9h8", "M8 13h8", "M8 17h5"]} size={15} />
          <span>{t("notes")}</span>
        </button>
        <div className="cd-rb-views" role="group" aria-label={t("views")}>
          {([
            ["normal", t("viewNormal"), ["M3 5h18v14H3z", "M8 5v14"]],
            ["sorter", t("slideSorter"), ["M3 4h8v7H3z", "M13 4h8v7h-8z", "M3 13h8v7H3z", "M13 13h8v7h-8z"]],
            ["reading", t("viewRead"), ICONS.eye]
          ] as ["normal" | "sorter" | "reading", string, string[]][]).map(([k, label, icon]) => (
            <button key={k} type="button" className={view === k ? "cd-rb-view cd-rb-view--on" : "cd-rb-view"} aria-pressed={view === k} aria-label={label} title={label} onClick={() => { setView(k); setSelected(null); setEditing(null); }}>
              <Icon d={icon} size={15} />
            </button>
          ))}
          <button type="button" className="cd-rb-view" aria-label={t("slideShow")} title={t("slideShow") + " (F5)"} onClick={() => setShow(at)}>
            <Icon d={["M4 5h16v11H4z", "M10 8.5v4.5l4-2.25z", "M9 20h6"]} size={15} />
          </button>
          <button type="button" className={props.finalState ? "cd-rb-view cd-rb-view--on" : "cd-rb-view"} aria-label={t("viewPrint")} title={t("viewPrint")} onClick={props.onFinal}>
            <Icon d={ICONS.pages} size={15} />
          </button>
        </div>
        <HandButton on={hand} onToggle={() => setHand(!hand)} t={t} />
        <ZoomControl zoom={zoom} onZoom={setZoom} min={0.2} max={4} fits={[[t("fitSlide"), fit]]} t={t} />
      </div>

      {notice && (
        <div className="cd-rb-notice" role="status">
          <span>{notice}</span>
          <button type="button" className="cd-rb-icon cd-rb-icon--small" aria-label={t("close")} onClick={() => setNotice(null)}>
            <Icon d={ICONS.close} size={14} />
          </button>
        </div>
      )}
      {kindPick && (
        <div className="cd-rb-overlay" role="presentation" onPointerDown={() => setKindPick(null)}>
          <div className="cd-rb-dialog cd-rb-kindpick" role="dialog" aria-label={t(kindPick.type)} onPointerDown={(e) => e.stopPropagation()}>
            <div className="cd-rb-dialog__head">
              <b>{t(kindPick.type === "chart" ? "insertChart" : "insertTable")}</b>
              <button type="button" className="cd-rb-icon" aria-label={t("close")} onClick={() => setKindPick(null)}>
                <Icon d={ICONS.close} />
              </button>
            </div>
            <div className="cd-rb-kindpick__list">
              {kindsOf(kindPick.type).map((k) => (
                <button key={k.kind} type="button" className="cd-rb-mitem" onClick={() => onInsert({ type: k.type, kind: k.kind, ...k.defaults })}>
                  <Icon d={kindIcon(k.type, k.kind)} size={16} />
                  <span>{tr(k.label, lang)}</span>
                  <small>{tr(k.groupLabel, lang)}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {styleFor && item && item.id === styleFor && item.block.type === "chart" && (
        <ChartStylePop anchorId={"rb-" + item.id} deps={[zoom, at]} onClose={() => setStyleFor(null)}>
          <ChartStyle block={{ ...item.block, id: item.id }} preview={previews[item.id]} schema={props.chartSchema} texts={texts} onUpdate={(patch) => setBlock(item.id, patch)} onClose={() => setStyleFor(null)} />
        </ChartStylePop>
      )}

      {show !== null && slides[show] && (
        <div ref={showRef} className="cd-rb-show" onClick={() => setShow((i) => (i === null ? null : i + 1 >= total ? null : i + 1))} role="dialog" aria-label={t("slideShow")}>
          <div style={{ zoom: showScale }}>
            <BoxCanvas slide={slides[show]} design={design} fields={fieldsOf(slides[show])} previews={previews} assets={props.assets} t={t} />
          </div>
          <span className="cd-rb-show__n">
            {show + 1} / {total}
          </span>
        </div>
      )}

      {dialog && (
        <ExportDialog
          format={dialog}
          formats={["pptx", "pdf"]}
          setFormat={(f) => setDialog(f === "pdf" ? "pdf" : "pptx")}
          exportState={props.exportState}
          converter={props.converter}
          summary={`${total} ${t("slidesCount")} · ${slides.reduce((n, s) => n + s.items.filter((it) => it.block.type === "chart" || it.block.type === "table").length, 0)} ${t("chartsAndTables")} · ${design.slide_size === "4:3" ? "4:3" : "16:9"}`}
          texts={texts}
          onStart={() => {
            send(projRef.current, true);
            props.onExport(dialog);
          }}
          onClose={() => {
            setDialog(null);
            props.onExportClosed();
          }}
        />
      )}
      {props.finalState && <FinalPages state={props.finalState} converter={props.converter} texts={texts} onRefresh={props.onFinal} onClose={props.onFinalClosed} />}
    </div>
  );
}

