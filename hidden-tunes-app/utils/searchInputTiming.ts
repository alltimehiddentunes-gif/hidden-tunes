import { normalizeSearchQueryKey } from "./searchQueryCache";

/** Target debounce window for search UI input (150–200ms). */
export const SEARCH_UI_DEBOUNCE_MS = 175;
export const SEARCH_UI_DEBOUNCE_MAX_MS = 200;

export function normalizeSearchInput(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isSameSearchInputQuery(previous: string, next: string) {
  return (
    normalizeSearchQueryKey(previous, "ui") ===
    normalizeSearchQueryKey(next, "ui")
  );
}

export type SearchDebounceGate = {
  getLastSubmittedQuery: () => string;
  shouldRun: (query: string) => boolean;
  markSubmitted: (query: string) => void;
  reset: () => void;
};

export function createSearchDebounceGate(): SearchDebounceGate {
  let lastSubmittedQuery = "";

  return {
    getLastSubmittedQuery: () => lastSubmittedQuery,
    shouldRun(query: string) {
      const normalized = normalizeSearchInput(query);
      if (!normalized) {
        lastSubmittedQuery = "";
        return true;
      }
      return !isSameSearchInputQuery(lastSubmittedQuery, normalized);
    },
    markSubmitted(query: string) {
      lastSubmittedQuery = normalizeSearchInput(query);
    },
    reset() {
      lastSubmittedQuery = "";
    },
  };
}
