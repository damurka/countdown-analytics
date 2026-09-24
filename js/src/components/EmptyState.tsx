import React from "react";
import { svg } from "./ChipFrame";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// project/Patterns.dc.html's own "Empty and loading" pattern card, first example -- an icon, a title, a
// muted message, and an optional single action button. Explicit user request, alongside LoadingSkeleton.tsx
// (the pattern card's second example): "say what is missing and where to fix it," not a bare "no data" plot
// caption.

const IconInbox = () => svg(["M4 13l2-8h12l2 8v6H4z", "M4 13h5l1 2h4l1-2h5"], 24);
const IconUpload = () => svg(["M12 16V4M7 9l5-5 5 5", "M4 20h16"], 18);

export interface EmptyStateProps {
  /** This instance's own DOM id -- ns()'d from R, same as every other component's `id` prop -- used to build
   *  the one-shot action event's input id below (`${id}_action`), not to bind a value Shiny reads back. */
  id?: string;
  title: LocalText;
  message: LocalText;
  actionLabel?: LocalText;
}

function EmptyState({ id, title, message, actionLabel }: EmptyStateProps) {
  const lang = useLang();

  // A plain one-shot Shiny input, the same `${id}_<verb>` convention FieldNumber.tsx's own `_cleared` event
  // and FileUploadZone.tsx's own `_reset` event already use -- not InputAdapter (that's for a value Shiny
  // hands back on re-render, e.g. a controlled select; a click here has no "current value" to persist). The
  // R side observes it with observeEvent(input$<id>_action, ..., ignoreInit = TRUE) and decides what "go"
  // means for this particular empty state (cd_navigate_to(), most often).
  const handleAction = () => {
    if (id) window.Shiny?.setInputValue?.(`${id}_action`, Date.now(), { priority: "event" });
  };

  return (
    <div className="cd-empty">
      <span className="cd-empty__icon">
        <IconInbox />
      </span>
      <div className="cd-empty__title">{tr(title, lang)}</div>
      <div className="cd-empty__message">{tr(message, lang)}</div>
      {actionLabel && (
        <button type="button" className="cd-empty__action" onClick={handleAction}>
          <IconUpload />
          <span>{tr(actionLabel, lang)}</span>
        </button>
      )}
    </div>
  );
}

export default EmptyState;
