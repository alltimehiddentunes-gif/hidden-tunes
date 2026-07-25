/**
 * Public TV description sanitation.
 *
 * Public `tv_videos.description` must never expose importer/discovery/provenance text.
 * A missing description (null) is preferred over filler or internal notes.
 */

export type TvDescriptionSanitizeResult = {
  text: string | null;
  rejected: boolean;
  reason: string | null;
};

/** Precise internal / importer templates — not bare words like "national" alone. */
const INTERNAL_DESCRIPTION_PATTERNS: Array<{ reason: string; re: RegExp }> = [
  { reason: "discovered_via", re: /discovered\s+via/i },
  { reason: "deep_city_search", re: /deep\s+city\s+search/i },
  { reason: "deep_search", re: /deep\s+search/i },
  { reason: "country_channel_website", re: /country[-_]channel[-_]website|country[-_]stream[-_]national/i },
  { reason: "source_pack", re: /source[-\s]?pack/i },
  { reason: "imported_from", re: /imported\s+from/i },
  { reason: "crawler_note", re: /\bcrawler\b|\bcrawler\s+notes?\b/i },
  { reason: "runner_note", re: /\b(?:import|discovery|expansion)[- ]?runner\b|\brunner:\s*/i },
  {
    reason: "provider_legal_meta",
    re: /(?:^|\|\s*)Provider:\s*|Legal\s+basis:\s*|Station\s+ID:\s*|Discovered:\s*\d{4}-\d{2}-\d{2}/i,
  },
  {
    reason: "deep_source_candidate",
    re: /deep-source\s+candidate|Free-TV\s+master\s+playlist\s+deep-source/i,
  },
  {
    reason: "directory_verification_template",
    re: /television\s+stream\s+discovered|public\s+directory\s+verification/i,
  },
  {
    reason: "iptv_org_directory_template",
    re: /iptv-org\s+public\s+directory/i,
  },
  {
    reason: "africa_europe_expansion_note",
    re: /(?:Africa|Europe)\s+expansion|Africa\s+deep-source/i,
  },
  {
    reason: "internal_city_slug",
    re: /_(?:national|regional|local)\b/,
  },
  {
    reason: "bracketed_internal_slug",
    re: /\[_(?:national|regional|local)\]/i,
  },
  {
    reason: "national_television_stream_template",
    re: /_(?:national|regional|local)\s+television\s+stream/i,
  },
  {
    reason: "verification_notes",
    re: /\bverification\s+notes?\b|\bimporter\s+notes?\b|\bcrawler\s+notes?\b/i,
  },
  {
    reason: "candidate_provenance",
    re: /\bcandidate\s*\(/i,
  },
];

export function isInternalTvDescription(value: unknown): boolean {
  return sanitizePublicTvDescription(value).rejected;
}

/**
 * Returns a consumer-safe description, or null when empty / internal.
 * Does not rewrite legitimate editorial text into generic filler.
 */
export function sanitizePublicTvDescription(
  value: unknown
): TvDescriptionSanitizeResult {
  if (value == null) {
    return { text: null, rejected: false, reason: null };
  }
  if (typeof value !== "string") {
    return { text: null, rejected: true, reason: "non_string" };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { text: null, rejected: false, reason: null };
  }

  for (const pattern of INTERNAL_DESCRIPTION_PATTERNS) {
    if (pattern.re.test(trimmed)) {
      return { text: null, rejected: true, reason: pattern.reason };
    }
  }

  // Underscore-heavy machine keys that are not natural language (e.g. foo_bar_baz alone).
  if (
    /^[a-z0-9]+(?:_[a-z0-9]+){2,}$/i.test(trimmed) &&
    !/\s/.test(trimmed)
  ) {
    return { text: null, rejected: true, reason: "underscore_slug" };
  }

  return { text: trimmed, rejected: false, reason: null };
}

export function cleanPublicTvDescription(value: unknown): string | null {
  return sanitizePublicTvDescription(value).text;
}
