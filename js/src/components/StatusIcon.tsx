import React from "react";


export type StatusKind = "success" | "warning" | "error" | "info";

const commonProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export default function StatusIcon({ status }: { status: string }) {
  if (status === "success") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l3 3 5-6" />
      </svg>
    );
  }
  if (status === "warning") {
    return (
      <svg {...commonProps}>
        <path d="M12 3l10 18H2z" />
        <path d="M12 10v4M12 17h.01" />
      </svg>
    );
  }
  if (status === "error") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    );
  }
  // "info", or anything else -- the same "i" glyph for a neutral note.
  return (
    <svg {...commonProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M12 11v5" />
    </svg>
  );
}
