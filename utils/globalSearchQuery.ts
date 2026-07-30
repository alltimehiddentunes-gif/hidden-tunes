/**
 * Search-boundary query normalisation for global mobile Search.
 * Does not rewrite stored catalogue titles — only shapes the request string.
 */

import { getCanonicalGenre, getGenreAliases } from "./genreAliases";
import { resolveMediaSearchExpansion } from "./mediaSearchQueryExpansion";
import { normalizeTvSearchQuery } from "./tvSearchQuery";

const PRESERVE_EXACT_TOKENS = new Set(["r&b", "r and b", "hip-hop", "k-pop", "k pop"]);

function normalizeComparable(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** Trim, collapse whitespace, and normalise hyphen/underscore separators. */
export function normalizeGlobalSearchQuery(raw: string): string {
  return normalizeTvSearchQuery(raw);
}

/**
 * Canonical query to send to backend music search.
 * - Afrobeat → Afrobeats (genre alias)
 * - Al-Jazeera → Al Jazeera (separator normalisation)
 * - Leaves intentional exact tokens like R&B intact after trim/case fold only
 * - Multi-word phrases (e.g. "Afrobeats latest") are not collapsed to a genre token
 */
export function resolveGlobalSearchBackendQuery(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();
  if (
    PRESERVE_EXACT_TOKENS.has(lower) ||
    PRESERVE_EXACT_TOKENS.has(normalizeGlobalSearchQuery(lower).toLowerCase())
  ) {
    return trimmed.replace(/\s+/g, " ").trim();
  }

  const spaced = normalizeGlobalSearchQuery(trimmed);
  const words = spaced.split(/\s+/).filter(Boolean);

  // Whole-query genre/alias only (single token or exact multi-word genre title).
  const canonicalGenre = getCanonicalGenre(spaced);
  if (canonicalGenre) {
    const spacedKey = normalizeComparable(spaced);
    const aliasKeys = getGenreAliases(canonicalGenre).map(normalizeComparable);
    if (aliasKeys.includes(spacedKey) || normalizeComparable(canonicalGenre) === spacedKey) {
      // "Afrobeats latest" has extra words — keep the phrase.
      if (words.length === 1 || normalizeComparable(spaced) === normalizeComparable(canonicalGenre)) {
        return canonicalGenre;
      }
    }
  }

  const expansion = resolveMediaSearchExpansion(spaced);
  if (words.length === 1 && expansion.canonical) {
    const fromExpansion = getCanonicalGenre(expansion.canonical);
    if (fromExpansion) return fromExpansion;
  }

  return spaced;
}

/** Variant list for alias-aware matching (display/local filters). Cap keeps request fan-out bounded. */
export function expandGlobalSearchQueryVariants(raw: string, max = 4): string[] {
  const primary = resolveGlobalSearchBackendQuery(raw);
  if (!primary) return [];

  const expansion = resolveMediaSearchExpansion(primary);
  const variants: string[] = [];
  const seen = new Set<string>();

  const push = (value: string) => {
    const clean = String(value || "").trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(clean);
  };

  push(primary);
  push(normalizeGlobalSearchQuery(raw));
  push(expansion.canonical);
  for (const alias of expansion.aliases) push(alias);

  return variants.slice(0, Math.max(1, max));
}
