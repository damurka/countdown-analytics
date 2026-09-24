import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InputAdapter } from "@/shiny.react";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";
import { autoMatch, classifyMatch } from "../matching";

// Replaces modal_helpers.R's mapping_modal_ui()/createMappingModal(): a name-reconciliation UI (match the app's
// canonical admin-level-1 region names against however a specific uploaded dataset spells them) that used to
// be N shiny::selectizeInput()s stacked in a plain, entirely unstyled shiny::modalDialog() -- no auto-matching,
// no progress indicator, no duplicate detection, and Save wrote through with no validation at all (an unmapped
// or duplicated row saved silently). A fully React-owned modal (a portal, like Sidebar.tsx's own flyout) rather
// than Shiny's showModal()/modalDialog(): that modal had zero custom CSS applied anywhere in this app, so there
// was no existing styling investment to preserve by keeping it, and owning the whole thing here means the
// auto-match/progress/validation state below doesn't have to round-trip through Shiny to update the UI on every
// keystroke/selection.
//
// Sends the WHOLE mapping as one value on Save (an object, region name -> matched value), not N separate
// selectize inputs -- mapping_modal_server() (ui/modal_helpers.R) now reads this one object instead of looping
// over gregion_levels() to read N separate input[[...]] values.

export interface MappingTexts {
  cancelLabel: LocalText;
  saveLabel: LocalText;
  searchLabel: LocalText;
  mappedLabel: LocalText;
  /** "region names were matched automatically..." -- a count prefixes it directly in JSX (same pattern the
   *  toolbar's own "{mappedCount} / {regions.length} {mappedLabel}" already uses), not server-side
   *  interpolation. */
  autoMatchedLabel: LocalText;
  /** Per-row tags next to a still-pending auto-match, telling the user *why* it matched -- "based on spelling"
   *  alone reads as if every auto-match needed real spelling correction, when most are usually just a case or
   *  accent difference (user report, a same-spelling different-case match: "Alibori" -> "ALIBORI"). No tag is
   *  shown for an exact (character-for-character) match -- classifyMatch() never returns "exact" for a genuine
   *  autoMatch() result anyway, since identical strings need no matching, but the type covers it for safety. */
  matchCaseLabel: LocalText;
  matchAccentLabel: LocalText;
  matchFuzzyLabel: LocalText;
  noMatchLabel: LocalText;
  selectLabel: LocalText;
  usedTwiceLabel: LocalText;
  unmappedLabel: LocalText;
  duplicateLabel: LocalText;
  saveAnywayQuestion: LocalText;
  reviewLabel: LocalText;
  saveAnywayLabel: LocalText;
}

export interface MappingModalProps extends MappingTexts {
  id?: string;
  /** The trigger button's own text (was mapping_modal_ui()'s separate `name` argument). */
  label: LocalText;
  /** Modal title -- was a raw untranslated string for one of the two callers (map_mapping); both now go
   *  through a real translation key. */
  title: LocalText;
  /** The canonical list every entry must be matched against (cache()$subnational_regions$adminlevel_1). */
  regions: string[];
  /** What the uploaded dataset actually calls each region -- the pool a match is picked from. */
  choices: string[];
  /** Any previously-saved mapping (region -> matched value), pre-filling those rows exactly as chosen before;
   *  auto-match only fills the rows this doesn't cover. */
  existing?: Record<string, string>;
  /** Region -> {matched value, "auto" if it's still exactly autoMatch()'s own untouched suggestion for that
   *  row, "user" otherwise (the user picked/edited it, or it had no suggestion to begin with -- e.g. an
   *  `existing` row from a previous save). Saved alongside the value itself (modal_helpers.R's
   *  mapping_modal_server() persists it as the mapping tibble's own `source` column) so the step page outside
   *  this modal can say how much of a saved mapping was actually auto-matched vs reviewed/entered by the user,
   *  not just that a mapping exists -- explicit user request: the auto-match banner below only shows once,
   *  inside the modal, while it's open; nothing said so afterward. */
  onChange?: (value: Record<string, { value: string; source: "auto" | "user" }>) => void;
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function MappingModal({ label, title, regions, choices, existing, onChange, ...texts }: MappingModalProps) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState(false);
  // What autoMatch() itself filled in on THIS open, as opposed to a previously-saved `existing` choice -- set
  // once per open() call, alongside `mapping`, not derived from it: mapping itself can't tell an auto-suggested
  // value apart from one the user has since picked by hand from the same dropdown. Keeping the whole
  // region -> suggested-value map (not just a count) is what lets each row look up *why* it was suggested
  // (classifyMatch()) below, and a row's tag disappears the moment the user picks something else for it,
  // since it's compared against the live `mapping` value on every render, not cached.
  const [autoSuggested, setAutoSuggested] = useState<Record<string, string>>({});
  const autoMatchedCount = Object.keys(autoSuggested).length;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Auto-match runs once, when the modal opens -- not on every render (re-running it while the user is
  // actively editing would overwrite their own choices with a fresh guess the moment a dropdown's onChange
  // fires a re-render). A previously-saved mapping (`existing`) always wins over a fresh guess: it's a real
  // choice someone already made, not a suggestion.
  const openModal = () => {
    const unresolved = regions.filter((r) => !existing?.[r]);
    const suggested = autoMatch(unresolved, choices);
    const seeded: Record<string, string> = {};
    regions.forEach((r) => {
      seeded[r] = existing?.[r] || suggested[r] || "";
    });
    setMapping(seeded);
    setAutoSuggested(suggested);
    setSearch("");
    setConfirming(false);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const mappedCount = useMemo(() => regions.filter((r) => mapping[r]).length, [regions, mapping]);

  // A source value picked for more than one region -- almost certainly a mistake (the same source region can't
  // actually BE two different canonical regions), flagged per-row rather than silently accepted.
  const duplicates = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(mapping).forEach((v) => {
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    return new Set(Object.entries(counts).filter(([, c]) => c > 1).map(([v]) => v));
  }, [mapping]);

  const unmappedCount = regions.length - mappedCount;
  const duplicateRowCount = regions.filter((r) => mapping[r] && duplicates.has(mapping[r])).length;
  const issueCount = unmappedCount + duplicateRowCount;

  const filteredRegions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return regions;
    return regions.filter((r) => r.toLowerCase().includes(q));
  }, [regions, search]);

  const save = () => {
    if (issueCount > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    if (onChange) {
      const withSource: Record<string, { value: string; source: "auto" | "user" }> = {};
      regions.forEach((region) => {
        const value = mapping[region] || "";
        const auto = autoSuggested[region];
        // Still exactly the untouched suggestion for this row -> "auto"; anything else (the user picked or
        // edited it, or it had no suggestion -- e.g. carried over from a previous save's `existing`) -> "user".
        withSource[region] = { value, source: auto != null && value === auto ? "auto" : "user" };
      });
      onChange(withSource);
    }
    setOpen(false);
  };

  return (
    <>
      <button type="button" className="cd-button" onClick={openModal}>
        {tr(label, lang)}
      </button>
      {open &&
        createPortal(
          <div className="cd-modal-overlay" onMouseDown={() => setOpen(false)}>
            <div
              ref={dialogRef}
              className="cd-modal"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="cd-modal__header">
                <h2 className="cd-modal__title">{tr(title, lang)}</h2>
                <button type="button" className="cd-modal__close" aria-label="Close" onClick={() => setOpen(false)}>
                  <CloseIcon />
                </button>
              </div>

              <div className="cd-modal__toolbar">
                <span className="cd-map-search">
                  <SearchIcon />
                  <input
                    type="text"
                    placeholder={tr(texts.searchLabel, lang)}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </span>
                <span className={`cd-map-progress${issueCount === 0 ? " cd-map-progress--done" : ""}`}>
                  {mappedCount} / {regions.length} {tr(texts.mappedLabel, lang)}
                </span>
              </div>

              {autoMatchedCount > 0 && (
                <div className="cd-map-automatch-note">
                  {autoMatchedCount} {tr(texts.autoMatchedLabel, lang)}
                </div>
              )}

              <div className="cd-modal__body">
                {filteredRegions.length === 0 ? (
                  <div className="cd-map-empty">
                    {tr(texts.noMatchLabel, lang)} &ldquo;{search}&rdquo;
                  </div>
                ) : (
                  filteredRegions.map((region) => {
                    const value = mapping[region] || "";
                    const isDuplicate = value !== "" && duplicates.has(value);
                    // Still showing autoMatch()'s own suggestion for this row (untouched by the user since) --
                    // classify *why* it matched so the tag below can say "case differs" instead of a blanket
                    // "matched automatically" that reads as a real spelling fix even when it wasn't one. The
                    // moment the user picks a different value, `value !== auto` and the tag disappears on its
                    // own -- no extra state to clear.
                    const auto = autoSuggested[region];
                    const matchType = auto != null && value === auto ? classifyMatch(region, auto) : null;
                    const matchLabel =
                      matchType === "case"
                        ? texts.matchCaseLabel
                        : matchType === "accent"
                          ? texts.matchAccentLabel
                          : matchType === "fuzzy"
                            ? texts.matchFuzzyLabel
                            : null;
                    return (
                      <div key={region} className={`cd-map-row${isDuplicate ? " cd-map-row--warn" : ""}`}>
                        <span className="cd-map-row__status">
                          {value !== "" && !isDuplicate && <CheckIcon />}
                        </span>
                        <span className="cd-map-row__name">{region}</span>
                        <select
                          className="cd-field-input cd-field-select cd-map-row__select"
                          value={value}
                          onChange={(e) => setMapping((prev) => ({ ...prev, [region]: e.target.value }))}
                        >
                          <option value="">{tr(texts.selectLabel, lang)}</option>
                          {choices.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        {matchLabel && <span className="cd-map-row__match-tag">{tr(matchLabel, lang)}</span>}
                        {isDuplicate && <span className="cd-map-row__warn-text">{tr(texts.usedTwiceLabel, lang)}</span>}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="cd-modal__footer">
                {confirming ? (
                  <div className="cd-map-confirm">
                    <span>
                      {unmappedCount > 0 && `${unmappedCount} ${tr(texts.unmappedLabel, lang)}`}
                      {unmappedCount > 0 && duplicateRowCount > 0 && ", "}
                      {duplicateRowCount > 0 && `${duplicateRowCount} ${tr(texts.duplicateLabel, lang)}`}
                      {". "}
                      {tr(texts.saveAnywayQuestion, lang)}
                    </span>
                    <span className="cd-modal__footer-actions">
                      <button type="button" className="cd-button" onClick={() => setConfirming(false)}>
                        {tr(texts.reviewLabel, lang)}
                      </button>
                      <button type="button" className="cd-button cd-button--primary" onClick={save}>
                        {tr(texts.saveAnywayLabel, lang)}
                      </button>
                    </span>
                  </div>
                ) : (
                  <span className="cd-modal__footer-actions">
                    <button type="button" className="cd-button" onClick={() => setOpen(false)}>
                      {tr(texts.cancelLabel, lang)}
                    </button>
                    <button type="button" className="cd-button cd-button--primary" onClick={save}>
                      {issueCount > 0 ? `${tr(texts.saveLabel, lang)} (${issueCount})` : tr(texts.saveLabel, lang)}
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export default InputAdapter<MappingModalProps, Record<string, { value: string; source: "auto" | "user" }> | null>(
  MappingModal,
  (_value, setValue) => ({
    onChange: (v: Record<string, { value: string; source: "auto" | "user" }>) => setValue(v),
  }),
);
