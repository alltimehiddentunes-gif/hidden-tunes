/**
 * Approved radio source adapters for the 40k worldwide expansion.
 *
 * Source families with status "enabled" may be used under the listed restrictions.
 * Directory presence alone NEVER grants public eligibility — independent stream
 * verification is always required.
 */
export type RadioSourceAdapterStatus = "enabled" | "disabled" | "pending_approval";

export type RadioSourceAdapter = {
  source_name: string;
  access_method: string;
  terms_licensing_notes: string;
  rate_limits: string;
  retry_policy: string;
  source_confidence: number;
  fields_supplied: string[];
  duplicate_identifier_strategy: string[];
  last_successful_crawl: string | null;
  enabled: boolean;
  status: RadioSourceAdapterStatus;
  /** Hard restrictions that adapters and importers must enforce. */
  restrictions: string[];
  /** Absolute reject rules. */
  reject_rules: string[];
};

export const RADIO_SOURCE_ADAPTERS: RadioSourceAdapter[] = [
  {
    source_name: "radio_browser",
    access_method: "HTTPS JSON API (public mirrors: de1/nl1/at1/all.api.radio-browser.info)",
    terms_licensing_notes:
      "Community-maintained open directory. Station streams remain owned by broadcasters. Use polite User-Agent and rate limits. Do not scrape TuneIn.",
    rate_limits: "Page size ≤25; inter-request delay ≥750ms; rotate mirrors on failure; Wave1 max 250 candidates/source family",
    retry_policy: "Up to 5 retries with exponential backoff; failover across mirrors",
    source_confidence: 0.85,
    fields_supplied: [
      "name",
      "stream_url",
      "homepage",
      "favicon",
      "country",
      "countrycode",
      "state",
      "language",
      "tags",
      "bitrate",
      "codec",
      "votes",
      "clickcount",
      "stationuuid",
    ],
    duplicate_identifier_strategy: [
      "source_uuid/stationuuid",
      "normalized_stream_url",
      "station_fingerprint",
      "normalized_name+country+homepage_host",
    ],
    last_successful_crawl: null,
    enabled: true,
    status: "enabled",
    restrictions: [
      "retain source attribution (stationuuid, mirror)",
      "independent stream verification required before public eligibility",
      "never overwrite locked/manual/curated metadata with lower-confidence RB data",
      "do not fabricate city/region/coordinates",
    ],
    reject_rules: ["TuneIn or restricted commercial directories", "temporary session URLs", "unauthorized restreams"],
  },
  {
    source_name: "hidden_tunes_trusted_catalog",
    access_method: "Existing production radio_stations / radio_station_sources",
    terms_licensing_notes:
      "First-party curated and previously verified inventory. Never overwrite locked/manual metadata with lower-quality imports.",
    rate_limits: "N/A (internal DB)",
    retry_policy: "Standard DB retry",
    source_confidence: 1,
    fields_supplied: ["full canonical radio_stations row"],
    duplicate_identifier_strategy: ["id", "station_fingerprint", "source mappings"],
    last_successful_crawl: null,
    enabled: true,
    status: "enabled",
    restrictions: ["metadata_locked / manual_override / is_curated take precedence"],
    reject_rules: [],
  },
  {
    source_name: "icecast_yp",
    access_method: "Public Icecast Yellow Pages (e.g. dir.xiph.org) HTTPS listings where publicly accessible",
    terms_licensing_notes:
      "Approved with restrictions: directory must be publicly accessible; terms must permit automated access; robots and rate limits respected; throttled discovery; source attribution retained; each stream independently verified. Directory presence alone does not make a station public eligible.",
    rate_limits: "Respect robots.txt and Retry-After; ≤1 rps; Wave1 max 250 candidates/source family",
    retry_policy: "3 retries, 5s+ backoff; abort on robots disallow or auth wall",
    source_confidence: 0.7,
    fields_supplied: ["name", "stream_url", "genre", "listeners", "bitrate", "server_type"],
    duplicate_identifier_strategy: ["normalized_stream_url", "mount+host", "normalized_name"],
    last_successful_crawl: null,
    enabled: true,
    status: "enabled",
    restrictions: [
      "public directory only",
      "terms must permit automated access",
      "robots + rate limits mandatory",
      "throttle discovery",
      "retain source attribution",
      "independent stream verification required",
      "directory presence ≠ public eligibility",
    ],
    reject_rules: [
      "robots.txt disallow",
      "terms prohibit automated collection",
      "login/auth walls",
      "private network mounts",
    ],
  },
  {
    source_name: "broadcaster_published_playlists",
    access_method: "Public M3U/PLS/XSPF/HLS intentionally published by the broadcaster/station/network/university/community/public org",
    terms_licensing_notes:
      "Approved with restrictions: playlist must be intentionally published by the rights-holding broadcaster entity; reachable without login; no auth/cookies/subscription; not from a private player session; no short-lived tokens; no DRM/access-control bypass; store broadcaster attribution + playlist origin; independent playback verification required.",
    rate_limits: "Per-domain ≤1 rps; respect Retry-After; Wave1 max 250 candidates/source family",
    retry_policy: "2 retries; abort on auth/captive-portal/tokenized URL",
    source_confidence: 0.9,
    fields_supplied: ["stream_url", "homepage", "playlist_origin", "codec hints"],
    duplicate_identifier_strategy: ["resolved_stream_url", "homepage_host+name", "playlist_origin"],
    last_successful_crawl: null,
    enabled: true,
    status: "enabled",
    restrictions: [
      "intentionally published by broadcaster/station/network/university/community/public broadcaster",
      "no login required",
      "store broadcaster attribution and playlist origin",
      "independent playback verification required",
    ],
    reject_rules: [
      "private or authenticated playlists",
      "copied commercial aggregator playlists without clear origin",
      "session-captured URLs",
      "signed URLs that expire",
      "tokenized player URLs",
      "DRM streams",
      "pages whose terms prohibit automated collection",
      "guessed or brute-forced playlist paths",
    ],
  },
];

/** Metadata field precedence (highest first). Never overwrite higher with lower. */
export const RADIO_METADATA_PRECEDENCE = [
  "broadcaster_owned_published",
  "public_government_broadcaster",
  "university_community_broadcaster",
  "trusted_directory",
  "inferred_deterministic",
] as const;

export function listEnabledRadioSources() {
  return RADIO_SOURCE_ADAPTERS.filter((source) => source.enabled && source.status === "enabled");
}

export function listPendingApprovalRadioSources() {
  return RADIO_SOURCE_ADAPTERS.filter((source) => source.status === "pending_approval");
}

export function getRadioSourceAdapter(sourceName: string) {
  return RADIO_SOURCE_ADAPTERS.find((source) => source.source_name === sourceName) || null;
}

export function isRejectedPlaylistUrl(url: string): { rejected: boolean; reason?: string } {
  const raw = String(url || "").trim();
  if (!raw) return { rejected: true, reason: "empty_url" };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { rejected: true, reason: "invalid_url" };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { rejected: true, reason: "unsupported_protocol" };
  }
  const lower = raw.toLowerCase();
  if (/[?&](token|sig|signature|expires|exp|access_token|auth)=/.test(lower)) {
    return { rejected: true, reason: "tokenized_or_signed_url" };
  }
  if (/drm|widevine|fairplay|playready/.test(lower)) {
    return { rejected: true, reason: "drm_indicator" };
  }
  return { rejected: false };
}
