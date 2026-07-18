/**
 * Presentation-only TV channel title helper.
 * Strip trailing stream-resolution suffixes from user-facing labels.
 * Do not mutate stored catalog data, IDs, playback, or search indexes.
 */

const TRAILING_RESOLUTION_SUFFIX =
  /\s*\((?:4320|2160|1440|1080|720|576|480|360|240)p\)\s*$/i;

/**
 * Clean channel title for browsing / player chrome.
 * Removes trailing patterns like "(1080p)", "(720p)", "(480p)".
 * Leaves other parenthetical branding unchanged.
 */
export function formatTvChannelTitle(title?: string | null): string {
  const original = String(title || "").trim();
  if (!original) return "";

  let cleaned = original;
  // Strip one or more trailing resolution-only suffixes.
  while (TRAILING_RESOLUTION_SUFFIX.test(cleaned)) {
    cleaned = cleaned.replace(TRAILING_RESOLUTION_SUFFIX, "").trim();
  }

  return cleaned || original;
}

/** Alias used by some call sites / tests. */
export function formatChannelDisplayName(title?: string | null): string {
  return formatTvChannelTitle(title);
}
