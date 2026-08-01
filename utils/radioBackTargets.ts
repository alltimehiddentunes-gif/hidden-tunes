import { getRadioCategory } from "../constants/radioCategories";

/** Live Radio hub — browse home for stations (not `/radio` listening rooms). */
export const RADIO_HOME_ROUTE = "/stations";

/** Radio station search. */
export const RADIO_SEARCH_ROUTE = "/stations/search";

/**
 * Exit destination when leaving Radio Home with no history.
 * Library is the primary in-app entry that links to Live Radio.
 */
export const RADIO_EXIT_FALLBACK_ROUTE = "/library";

export type RadioNavigationOrigin =
  | { type: "home" }
  | { type: "search"; query?: string }
  | { type: "category"; categoryId: string }
  | { type: "favorites" }
  | { type: "recent" };

export type RadioBackHref =
  | typeof RADIO_HOME_ROUTE
  | typeof RADIO_SEARCH_ROUTE
  | typeof RADIO_EXIT_FALLBACK_ROUTE
  | { pathname: "/stations/[categoryId]"; params: { categoryId: string } }
  | { pathname: "/stations/search"; params: { q: string } };

function normalizeQuery(raw?: string | null): string {
  return String(raw || "").trim();
}

function normalizeCategoryId(raw?: string | null): string {
  return String(raw || "").trim();
}

/** True when a category id maps to a known Radio category screen. */
export function isValidRadioCategoryId(categoryId?: string | null): boolean {
  const id = normalizeCategoryId(categoryId);
  if (!id) return false;
  return Boolean(getRadioCategory(id));
}

/**
 * Resolve the single logical parent for a Radio screen / live-radio player.
 * Never returns an unbounded history walk — only the immediate parent.
 */
export function resolveRadioBackTarget(input: {
  screen: "home" | "category" | "search" | "player";
  categoryId?: string | null;
  searchQuery?: string | null;
  /** Optional explicit origin from queue / launch context. */
  origin?: RadioNavigationOrigin | null;
  railId?: string | null;
}): RadioBackHref {
  const origin = input.origin || null;

  if (input.screen === "home") {
    return RADIO_EXIT_FALLBACK_ROUTE;
  }

  if (input.screen === "category" || input.screen === "search") {
    return RADIO_HOME_ROUTE;
  }

  // Player (live radio): explicit origin → queue fields → home.
  if (origin?.type === "search") {
    const query = normalizeQuery(origin.query);
    if (query) {
      return { pathname: "/stations/search", params: { q: query } };
    }
    return RADIO_SEARCH_ROUTE;
  }

  if (origin?.type === "category" && isValidRadioCategoryId(origin.categoryId)) {
    return {
      pathname: "/stations/[categoryId]",
      params: { categoryId: normalizeCategoryId(origin.categoryId) },
    };
  }

  if (origin?.type === "home" || origin?.type === "favorites" || origin?.type === "recent") {
    return RADIO_HOME_ROUTE;
  }

  const searchQuery = normalizeQuery(input.searchQuery);
  if (searchQuery) {
    return { pathname: "/stations/search", params: { q: searchQuery } };
  }

  const railId = normalizeCategoryId(input.railId || input.categoryId);
  if (isValidRadioCategoryId(railId)) {
    return {
      pathname: "/stations/[categoryId]",
      params: { categoryId: railId },
    };
  }

  return RADIO_HOME_ROUTE;
}
