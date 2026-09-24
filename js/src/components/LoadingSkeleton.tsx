import React from "react";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// The custom-code replacement for shinycssloaders::withSpinner()'s default spinner -- explicit user request
// ("replace all withSpinner ... use react component"), matching project/Patterns.dc.html's own "Empty and
// loading" pattern card (its second example, the bar-skeleton one) exactly. Bar count/width/heights are that
// mockup's own fixed set (confirmed by reading its raw markup), not randomized or content-derived -- this is
// a generic "something is loading" placeholder shown for whatever's underneath (a chart, a table, a plain
// uiOutput()), not a literal preview of the real chart's shape.
const BAR_HEIGHTS = [70, 110, 90, 140, 120, 160, 100];

export interface LoadingSkeletonProps {
  /** Always supplied translated from R (cd_text()) -- no hardcoded English fallback here, same convention
   *  every other text-carrying component in this app follows. */
  label: LocalText;
}

function LoadingSkeleton({ label }: LoadingSkeletonProps) {
  const lang = useLang();
  return (
    <div className="cd-skeleton" role="status" aria-live="polite">
      <div className="cd-skeleton__bars">
        {BAR_HEIGHTS.map((h, i) => (
          <span key={i} className="cd-skeleton__bar" style={{ height: h }} />
        ))}
      </div>
      <div className="cd-skeleton__caption">{tr(label, lang)}</div>
    </div>
  );
}

export default LoadingSkeleton;
