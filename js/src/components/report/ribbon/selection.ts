import { activeEditor } from "../RichText";

// The editor keeps its selection while a colour input, a box or a select has the focus; the command puts the focus back
export function saveSelection() {
  /* nothing to keep: the editor keeps its selection */
}
export function restoreSelection(): boolean {
  const ed = activeEditor();
  if (!ed) return false;
  ed.commands.focus();
  return true;
}
