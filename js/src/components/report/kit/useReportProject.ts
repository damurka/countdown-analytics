import { useRef, useState } from "react";
import type { RbProject } from "../types";

// A report (document or slide deck) being edited: its state, saving it (sent after a pause, and never twice the same:
// Shiny drops a value equal to the last one it was sent, so it would never be confirmed as saved), and undo / redo for
// what is not typed (the text has its editor's own history). Shared by every builder.

export interface ReportProject {
  project: RbProject;
  /** The report as it is now (for callbacks made before the last change). */
  ref: React.MutableRefObject<RbProject>;
  /** Show a report without saving it or making an undo step. */
  set: (p: RbProject) => void;
  /** Save a report (after a pause, or `now`). */
  send: (p: RbProject, now?: boolean) => void;
  /** Change the report: shown, saved, and (with `history`) one undo step. */
  commit: (make: (p: RbProject) => RbProject, history?: boolean) => void;
  /** Make the report as it is now an undo step (before a change that is made bit by bit, e.g. typing). */
  snapshot: () => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** A report just opened: shown, no history, and sent back (R draws its charts from what it is sent). */
  open: (p: RbProject) => void;
}

export function useReportProject(initial: () => RbProject, sign: (p: RbProject) => RbProject, onChange: (p: RbProject) => void): ReportProject {
  const [project, setState] = useState<RbProject>(initial);
  const ref = useRef(project);
  const [past, setPast] = useState<RbProject[]>([]);
  const [future, setFuture] = useState<RbProject[]>([]);
  const lastSent = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const set = (p: RbProject) => {
    ref.current = p;
    setState(p);
  };
  const send = (next: RbProject, now = false) => {
    if (timer.current) clearTimeout(timer.current);
    const go = () => {
      const json = JSON.stringify(next);
      if (json === lastSent.current) return;
      lastSent.current = json;
      onChange(next);
    };
    if (now) go();
    else timer.current = setTimeout(go, 400);
  };
  const snapshot = () => {
    const prev = ref.current;
    setPast((p) => p.concat([prev]).slice(-100));
    setFuture([]);
  };
  const commit = (make: (p: RbProject) => RbProject, history = true) => {
    const next = sign(make(ref.current));
    if (history) snapshot();
    set(next);
    send(next);
  };
  const undo = () => {
    if (!past.length) return false;
    const prev = past[past.length - 1];
    setFuture((f) => [ref.current].concat(f));
    setPast((p) => p.slice(0, -1));
    set(prev);
    send(prev, true);
    return true;
  };
  const redo = () => {
    if (!future.length) return false;
    const next = future[0];
    setPast((p) => p.concat([ref.current]));
    setFuture((f) => f.slice(1));
    set(next);
    send(next, true);
    return true;
  };
  const open = (p: RbProject) => {
    set(p);
    setPast([]);
    setFuture([]);
    lastSent.current = JSON.stringify(p);
    onChange(p);
  };
  return { project, ref, set, send, commit, snapshot, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0, open };
}
