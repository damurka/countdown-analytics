// Lightweight string-similarity matching for MappingModal.tsx's auto-suggest -- no server round trip, no new R
// dependency (e.g. the {stringdist} package): both sides of a match (the canonical region list and the
// uploaded data's own region-name column) are already passed down as props when the modal opens, so this runs
// entirely client-side, once, at that moment.

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Case/accent/whitespace-insensitive: region names very often differ only in this ("North" vs "north",
// "Région du Nord" vs "Region du Nord") -- normalizing first means the Levenshtein distance below is scoring
// genuine spelling differences, not incidental formatting ones.
function normalize(s: string): string {
  return stripAccents(s).toLowerCase().trim().replace(/\s+/g, " ");
}

// Classic Levenshtein edit distance (insertions/deletions/substitutions), iterative two-row DP -- O(n*m) time,
// O(m) space. Region names are short (a few words at most), so this is cheap even run for every
// canonical-x-candidate pair.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// 1 = identical (after normalizing), 0 = completely different. Divides by the longer string's length so a
// one-character difference on a long name scores much closer to 1 than the same one-character difference on a
// short name would.
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

export interface BestMatch {
  value: string;
  score: number;
}

// A small floor, not zero: below this, a "best" match is almost certainly a false positive (two unrelated
// region names that happen to share a few characters) and is more misleading pre-filled than left blank for
// the user to pick themselves.
const MIN_CONFIDENCE = 0.5;

export function bestMatch(target: string, candidates: string[]): BestMatch | null {
  let best: BestMatch | null = null;
  for (const candidate of candidates) {
    const score = similarity(target, candidate);
    if (!best || score > best.score) best = { value: candidate, score };
  }
  if (!best || best.score < MIN_CONFIDENCE) return null;
  return best;
}

/**
 * Auto-suggests a match for every target (canonical region) against the shared candidate pool, without
 * assigning the same candidate to two different targets -- once a candidate is claimed by whichever target
 * matched it most confidently, it's removed from the pool for the rest (a stable greedy assignment, not a
 * globally-optimal one, but simple and predictable, and this is a starting suggestion the user reviews and can
 * always override, not a final answer).
 */
export function autoMatch(targets: string[], candidates: string[]): Record<string, string> {
  const pool = new Set(candidates);
  const scored = targets
    .map((target) => ({ target, match: bestMatch(target, Array.from(pool)) }))
    .filter((r): r is { target: string; match: BestMatch } => r.match != null)
    .sort((a, b) => b.match.score - a.match.score);

  const result: Record<string, string> = {};
  for (const { target, match } of scored) {
    if (!pool.has(match.value)) continue; // already claimed by a higher-scoring target
    result[target] = match.value;
    pool.delete(match.value);
  }
  return result;
}

export type MatchType = "exact" | "case" | "accent" | "fuzzy";

/**
 * Classifies *why* target and value ended up matched -- UI-only, so MappingModal.tsx can tell a user "this one
 * was only a case difference" apart from "this one needed real spelling correction", instead of one generic
 * "matched automatically based on spelling" note that reads as if every row needed a genuine spelling fix (user
 * report: a same-spelling, different-case match, e.g. "Alibori" -> "ALIBORI", read as misleading under that
 * wording). Checked cheapest-first, most-specific-first: identical -> differs only in case -> differs only in
 * case and/or accents -> anything else is a genuine (Levenshtein) spelling difference.
 */
export function classifyMatch(target: string, value: string): MatchType {
  if (target === value) return "exact";
  if (target.toLowerCase() === value.toLowerCase()) return "case";
  if (stripAccents(target).toLowerCase() === stripAccents(value).toLowerCase()) return "accent";
  return "fuzzy";
}
