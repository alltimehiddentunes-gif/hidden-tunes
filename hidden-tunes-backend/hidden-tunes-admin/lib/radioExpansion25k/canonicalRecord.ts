/**
 * Canonical radio station record for the 40k worldwide expansion.
 * Maps onto radio_stations (+ additive geography columns). Unknown values stay null.
 */
export type RadioDeliveryMode = "direct_https" | "backend_relay" | "hls" | "unsupported";

export type CanonicalRadioRecord = {
  /** Stable internal ID (uuid). */
  id: string;
  /** Display / canonical station name. */
  name: string;
  normalized_name: string;
  aliases: string[];
  broadcaster_name: string | null;
  stream_url: string;
  resolved_stream_url: string | null;
  homepage_url: string | null;
  artwork_url: string | null;
  country_code: string | null;
  country: string | null;
  /** Administrative region / territory when known. */
  administrative_region: string | null;
  /** state/province column. */
  state: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  languages: string[];
  normalized_genres: string[];
  raw_source_tags: string[];
  codec: string | null;
  bitrate: number | null;
  sample_rate: number | null;
  is_hls: boolean | null;
  is_public: boolean;
  is_mature: boolean;
  source_provider: string;
  source_external_id: string;
  source_record_url: string | null;
  first_discovered_at: string;
  last_discovered_at: string;
  last_verified_at: string | null;
  consecutive_success_count: number;
  consecutive_failure_count: number;
  reliability_score: number;
  latency_ms: number | null;
  final_resolved_host: string | null;
  delivery_mode: RadioDeliveryMode | null;
  public_eligibility: boolean;
  quarantine_reason: string | null;
  metadata_confidence: number | null;
};

/**
 * Map a DB radio_stations row into the canonical shape without fabricating geography.
 */
export function toCanonicalRadioRecord(row: Record<string, unknown>): CanonicalRadioRecord {
  const languageRaw = String(row.language || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const tags = Array.isArray(row.tags)
    ? row.tags.map((t) => String(t).toLowerCase())
    : [];
  const categories = Array.isArray(row.categories)
    ? row.categories.map((t) => String(t).toLowerCase())
    : [];

  const streamUrl = String(row.stream_url || "");
  const reliability = Math.max(0, Math.min(100, Number(row.reliability_score) || 0));
  const publicEligibility =
    row.status === "approved" &&
    row.is_active === true &&
    row.is_verified === true &&
    row.playback_status === "playable" &&
    row.is_mature !== true &&
    !row.quarantined_at &&
    !row.disabled_at &&
    reliability >= 60;

  return {
    id: String(row.id || ""),
    name: String(row.name || ""),
    normalized_name: String(row.normalized_name || ""),
    aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
    broadcaster_name: row.broadcaster_name ? String(row.broadcaster_name) : null,
    stream_url: streamUrl,
    resolved_stream_url: row.resolved_stream_url
      ? String(row.resolved_stream_url)
      : null,
    homepage_url: row.homepage_url ? String(row.homepage_url) : null,
    artwork_url: row.favicon_url ? String(row.favicon_url) : null,
    country_code: row.country_code ? String(row.country_code).toUpperCase() : null,
    country: row.country ? String(row.country) : null,
    administrative_region: row.state ? String(row.state) : null,
    state: row.state ? String(row.state) : null,
    city: row.city ? String(row.city) : null,
    latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
    longitude: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
    timezone: row.timezone ? String(row.timezone) : null,
    languages: languageRaw,
    normalized_genres: categories.length ? categories : tags.slice(0, 12),
    raw_source_tags: tags,
    codec: row.codec ? String(row.codec) : null,
    bitrate: Number.isFinite(Number(row.bitrate)) ? Number(row.bitrate) : null,
    sample_rate: Number.isFinite(Number(row.sample_rate)) ? Number(row.sample_rate) : null,
    is_hls:
      typeof row.is_hls === "boolean"
        ? row.is_hls
        : /\.m3u8(\?|$)/i.test(streamUrl) || /hls/i.test(String(row.codec || "")),
    is_public: publicEligibility,
    is_mature: row.is_mature === true,
    source_provider: String(row.source_name || row.source_type || "unknown"),
    source_external_id: String(row.source_station_id || row.source_uuid || ""),
    source_record_url: null,
    first_discovered_at: String(row.imported_at || row.created_at || ""),
    last_discovered_at: String(row.source_last_seen_at || row.updated_at || ""),
    last_verified_at: row.last_verified_at
      ? String(row.last_verified_at)
      : row.last_health_checked_at
        ? String(row.last_health_checked_at)
        : null,
    consecutive_success_count: Math.max(0, Number(row.consecutive_successes) || 0),
    consecutive_failure_count: Math.max(0, Number(row.consecutive_failures) || 0),
    reliability_score: reliability,
    latency_ms: Number.isFinite(Number(row.latency_ms)) ? Number(row.latency_ms) : null,
    final_resolved_host: row.final_resolved_host ? String(row.final_resolved_host) : null,
    delivery_mode: (row.delivery_mode as RadioDeliveryMode | null) || null,
    public_eligibility: publicEligibility,
    quarantine_reason: row.quarantine_reason ? String(row.quarantine_reason) : null,
    metadata_confidence: Number.isFinite(Number(row.metadata_confidence))
      ? Number(row.metadata_confidence)
      : null,
  };
}
