import React, { useEffect, useRef, useState } from "react";

/** A text of the cover typed on the page: it shows its fields filled in, and its own text (with {fields}) while it is
 *  typed; Enter (or a click elsewhere) keeps it, Esc puts it back. An empty one shows what it is for, in brackets. */
export function CoverText({ value, shown, placeholder, editable, multiline, className, style, onChange }: {
  value: string;
  shown: string;
  placeholder: string;
  editable: boolean;
  multiline?: boolean;
  className: string;
  style?: React.CSSProperties;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!typing && ref.current) ref.current.textContent = shown;
  }, [shown, typing]);
  const done = () => {
    const el = ref.current;
    if (!el) return;
    const next = (el.innerText || "").replace(/\u00a0/g, " ").replace(/\n+$/, "");
    setTyping(false);
    if (next !== value) onChange(next);
  };
  return (
    <div
      ref={ref}
      className={className + (editable ? " cd-rb-covertext" : "") + (!shown ? " cd-rb-covertext--empty" : "")}
      style={style}
      data-placeholder={placeholder}
      contentEditable={editable}
      suppressContentEditableWarning
      role={editable ? "textbox" : undefined}
      aria-label={placeholder}
      spellCheck
      onClick={(e) => editable && e.stopPropagation()}
      onFocus={() => {
        setTyping(true);
        if (ref.current) ref.current.textContent = value;
      }}
      onBlur={done}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
          e.preventDefault();
          ref.current?.blur();
        } else if (e.key === "Escape") {
          if (ref.current) ref.current.textContent = value;
          ref.current?.blur();
        }
      }}
    />
  );
}
