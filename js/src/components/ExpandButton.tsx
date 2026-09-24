import React, { useRef, useState } from "react";
import { svg } from "./ChipFrame";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// A per-card "make this chart fill the screen" toggle (the mockup's own card-header icon row, project/
// ReportingRate.dc.html). Purely a client-side visual toggle -- which .cd-card ancestor carries
// .cd-card--expanded (_shared/www/cd-ui.css) -- not a Shiny value: nothing server-side needs to know a card is
// expanded, so this owns its own boolean instead of going through InputAdapter/useValue() the way every other
// chip/tool here does (those all sync a real value back to Shiny; this has none to sync).

const IconExpand = () => svg(["M4 9V4h5", "M20 9V4h-5", "M4 15v5h5", "M20 15v5h-5"], 18);
const IconCollapse = () => svg(["M9 4H4v5", "M15 4h5v5", "M9 20H4v-5", "M15 20h5v-5"], 18);

export interface ExpandButtonProps {
  expandLabel: LocalText;
  collapseLabel: LocalText;
}

function ExpandButton({ expandLabel, collapseLabel }: ExpandButtonProps) {
  const lang = useLang();
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const card = ref.current?.closest<HTMLElement>(".cd-card");
    if (!card) {
      setExpanded((e) => !e);
      return;
    }
    const expanding = !card.classList.contains("cd-card--expanded");
    card.classList.toggle("cd-card--expanded");
    setExpanded((e) => !e);
    // Shiny's own plot outputs (cd_render_plot(..., height = "auto"), render-plot.R) measure THEIR OWN
    // .shiny-plot-output container's rendered height directly -- confirmed live, nothing in this card's own
    // CSS chain (.cd-card__body/.cd-plot-wrap, both plain block boxes, no flex/height of their own) stretches
    // that container to fill the now-fullscreen card, so it just kept the server's own height=400 fallback
    // while the rest of the card sat empty below it. Rather than rebuild that whole chain as flex (every
    // .cd-card__body across the app, most of which are NOT a lone plot, is not worth restructuring for this),
    // set the plot output's own height directly to the space actually available, then fire the same `resize`
    // event Shiny already listens for so it re-measures and re-requests the plot at that size. Cleared back
    // to "" on collapse so normal (non-expanded) height="auto" CSS sizing takes back over, not a leftover
    // inline height.
    const setHeights = () => {
      const outputs = card.querySelectorAll<HTMLElement>(".shiny-plot-output");
      outputs.forEach((el) => {
        if (expanding) {
          const top = el.getBoundingClientRect().top;
          const available = window.innerHeight - top - 24;
          el.style.height = `${Math.max(available, 200)}px`;
        } else {
          el.style.height = "";
        }
      });
      window.dispatchEvent(new Event("resize"));
    };
    requestAnimationFrame(() => {
      setHeights();
      // Shiny's ResizeObserver-based auto-height detection can catch an intermediate size while the card's
      // own `position: fixed` layout is still settling from this same click (confirmed live: the plot locked
      // onto a too-small height partway between its old size and the final available space, with nothing
      // afterward to correct it). Re-asserting the SAME target height once more, after the layout has had a
      // moment to settle, forces a second, now-accurate observation -- setHeights() is idempotent (same
      // computed height both times) so this is a correction, not a fight with the first pass.
      if (expanding) setTimeout(setHeights, 350);
    });
  };

  return (
    <button
      ref={ref}
      type="button"
      className="cd-tool"
      aria-label={tr(expanded ? collapseLabel : expandLabel, lang)}
      title={tr(expanded ? collapseLabel : expandLabel, lang)}
      aria-pressed={expanded}
      onClick={toggle}
    >
      {expanded ? <IconCollapse /> : <IconExpand />}
    </button>
  );
}

export default ExpandButton;
