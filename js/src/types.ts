import type { LocalText } from "./lang";

export interface ChipOption {
  key: string;
  text: LocalText;
  /** A heading is drawn whenever this changes between neighbouring options. */
  group?: string;
}

/** Lists longer than this get a search box. */
export const SEARCH_AT = 10;
