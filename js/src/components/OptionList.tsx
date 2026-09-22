import React, { useRef, useState } from "react";
import { IconCheck, IconSearch } from "./ChipFrame";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";
import { SEARCH_AT } from "../types";
import type { ChipOption } from "../types";

// The searchable list inside a chip's popover. Long lists (many regions, many years) get a search box;
// arrow keys move through the options, and ArrowUp from the first option goes back to the search box.

interface Props {
  options: ChipOption[];
  isSelected: (key: string) => boolean;
  onPick: (key: string) => void;
  multi?: boolean;
  label: LocalText;
  searchLabel?: LocalText;
  emptyLabel?: LocalText;
}

export function OptionList({ options, isSelected, onPick, multi, label, searchLabel, emptyLabel }: Props) {
  const lang = useLang();
  const [query, setQuery] = useState("");
  const searchable = options.length > SEARCH_AT;
  const q = query.trim().toLowerCase();
  const shown = q
    ? options.filter((o) => tr(o.text, lang).toLowerCase().includes(q) || (o.group || "").toLowerCase().includes(q))
    : options;
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const items = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') || []);
  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[Math.min(list.length - 1, i + 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i <= 0 && searchable) searchRef.current?.focus();
      else list[Math.max(0, i - 1)]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    }
  };

  const rows: React.ReactNode[] = [];
  let lastGroup: string | null = null;
  shown.forEach((o, idx) => {
    if (o.group && o.group !== lastGroup) {
      rows.push(
        <div key={`g${idx}`} className="cd-group" role="presentation">
          {o.group}
        </div>
      );
    }
    lastGroup = o.group || null;
    const on = isSelected(o.key);
    rows.push(
      <button
        key={`o${idx}`}
        type="button"
        role="option"
        aria-selected={on ? "true" : "false"}
        className={`cd-opt${on ? " cd-opt--on" : ""}${multi ? " cd-opt--multi" : ""}`}
        onClick={() => onPick(o.key)}
      >
        {multi && <span className={`cd-box${on ? " cd-box--on" : ""}`}>{on && <IconCheck />}</span>}
        <span className="cd-opt__text">{tr(o.text, lang)}</span>
        {!multi && on && (
          <span className="cd-opt__check">
            <IconCheck />
          </span>
        )}
      </button>
    );
  });

  return (
    <>
      {searchable && (
        <label className="cd-search">
          <IconSearch />
          <input
            ref={searchRef}
            type="text"
            data-autofocus="true"
            value={query}
            placeholder={tr(searchLabel, lang) || "Search"}
            aria-label={tr(searchLabel, lang) || "Search"}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                items()[0]?.focus();
              }
            }}
          />
        </label>
      )}
      <div
        ref={listRef}
        role="listbox"
        aria-label={tr(label, lang)}
        aria-multiselectable={multi ? "true" : undefined}
        className="cd-list"
        onKeyDown={onListKey}
      >
        {rows.length ? rows : <div className="cd-empty">{tr(emptyLabel, lang) || "No matches"}</div>}
      </div>
    </>
  );
}
