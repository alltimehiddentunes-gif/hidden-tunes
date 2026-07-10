export type RadioBrowserStation = {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  homepage?: string;
  favicon?: string;
  country?: string;
  countrycode?: string;
  state?: string;
  language?: string;
  tags?: string;
  bitrate?: number;
  codec?: string;
  votes?: number;
  clickcount?: number;
};

export type NormalizedRadioStation = {
  name: string;
  normalized_name: string;
  station_fingerprint: string;
  fingerprint_version: number;
  source_name: "radio_browser";
  source_type: "radio_browser";
  source_uuid: string;
  source_station_id: string;
  source_station_uuid: string;
  source_server: string | null;
  source_stream_url: string;
  stream_url: string;
  normalized_stream_url: string;
  homepage_url: string | null;
  normalized_homepage_host: string | null;
  favicon_url: string | null;
  country: string | null;
  country_code: string | null;
  state: string | null;
  language: string | null;
  tags: string[];
  bitrate: number | null;
  codec: string | null;
  votes: number | null;
  click_count: number | null;
  category_slug: string;
  categories: string[];
  source_payload_hash: string;
  source_last_seen_at: string;
  is_active: true;
  last_checked_at: string;
};

export type ImportClassification =
  | "inserted"
  | "updated"
  | "unchanged"
  | "duplicate_source"
  | "duplicate_canonical"
  | "conflict"
  | "skipped_invalid";

const FINGERPRINT_VERSION = 1;
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
]);
const PROVIDER_TAG_PATTERN =
  /^(radio[- ]?browser|icecast|shoutcast|radionomy|tunein|streema|live365)$/i;
const LANGUAGE_ALIASES = new Map([
  ["en", "english"],
  ["eng", "english"],
  ["de", "german"],
  ["deu", "german"],
]);

export function cleanRadioText(value: unknown, maxLength = 300) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeRadioName(value: unknown) {
  return cleanRadioText(value, 300)
    .replace(/^[\s\-_.:;|/\\]+|[\s\-_.:;|/\\]+$/g, "")
    .replace(/[\s_\-|/\\]+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeRadioSourceId(value: unknown) {
  return cleanRadioText(value, 160).toLowerCase();
}

export function normalizeRadioCountryCode(value: unknown) {
  return cleanRadioText(value, 8).toUpperCase() || null;
}

export function normalizeRadioLanguage(value: unknown) {
  const normalized = cleanRadioText(value, 120).toLowerCase();
  if (!normalized) return null;
  return LANGUAGE_ALIASES.get(normalized) || normalized;
}

export function normalizeRadioTags(value: unknown) {
  const tags = String(value || "")
    .split(",")
    .map((tag) => cleanRadioText(tag, 80).toLowerCase())
    .filter((tag) => tag && !PROVIDER_TAG_PATTERN.test(tag));
  return Array.from(new Set(tags)).sort().slice(0, 12);
}

export function normalizeRadioUrl(value: unknown, options?: { stream?: boolean }) {
  const raw = cleanRadioText(value, 2000);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";

    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }

    if (!options?.stream) {
      for (const key of Array.from(url.searchParams.keys())) {
        if (TRACKING_PARAMS.has(key.toLowerCase())) {
          url.searchParams.delete(key);
        }
      }
    }

    const sortedParams = Array.from(url.searchParams.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    url.search = "";
    for (const [key, paramValue] of sortedParams) {
      url.searchParams.append(key, paramValue);
    }

    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "");
    }

    return url.toString();
  } catch {
    return "";
  }
}

export function getHomepageHost(value: unknown) {
  const url = normalizeRadioUrl(value);
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(input: string) {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildRadioStationFingerprint(input: {
  normalized_stream_url: string;
  normalized_name: string;
  country_code: string | null;
  normalized_homepage_host: string | null;
}) {
  const payload = [
    `v${FINGERPRINT_VERSION}`,
    input.normalized_stream_url,
    input.normalized_name,
    input.country_code || "",
    input.normalized_homepage_host || "",
  ].join("|");
  return `radio:${FINGERPRINT_VERSION}:${hashString(payload)}`;
}

export function normalizeRadioBrowserStationForImport(
  station: RadioBrowserStation,
  category: string,
  options?: { now?: string; sourceServer?: string | null }
): NormalizedRadioStation | null {
  const now = options?.now || new Date().toISOString();
  const sourceId = normalizeRadioSourceId(station.stationuuid);
  const sourceStreamUrl = normalizeRadioUrl(station.url_resolved || station.url, { stream: true });
  const normalizedStreamUrl = normalizeRadioUrl(sourceStreamUrl, { stream: true }).toLowerCase();
  const name = cleanRadioText(station.name, 300);
  const normalizedName = normalizeRadioName(name);
  const homepageUrl = normalizeRadioUrl(station.homepage) || null;
  const normalizedHomepageHost = getHomepageHost(homepageUrl);
  const countryCode = normalizeRadioCountryCode(station.countrycode);

  if (!sourceId || !name || !normalizedName || !sourceStreamUrl || !normalizedStreamUrl) {
    return null;
  }

  const fingerprint = buildRadioStationFingerprint({
    normalized_stream_url: normalizedStreamUrl,
    normalized_name: normalizedName,
    country_code: countryCode,
    normalized_homepage_host: normalizedHomepageHost,
  });
  const payloadHash = hashString(stableStringify(station));

  return {
    name,
    normalized_name: normalizedName,
    station_fingerprint: fingerprint,
    fingerprint_version: FINGERPRINT_VERSION,
    source_name: "radio_browser",
    source_type: "radio_browser",
    source_uuid: sourceId,
    source_station_id: sourceId,
    source_station_uuid: sourceId,
    source_server: options?.sourceServer || null,
    source_stream_url: sourceStreamUrl,
    stream_url: sourceStreamUrl,
    normalized_stream_url: normalizedStreamUrl,
    homepage_url: homepageUrl,
    normalized_homepage_host: normalizedHomepageHost,
    favicon_url: normalizeRadioUrl(station.favicon) || null,
    country: cleanRadioText(station.country, 120) || null,
    country_code: countryCode,
    state: cleanRadioText(station.state, 120) || null,
    language: normalizeRadioLanguage(station.language),
    tags: normalizeRadioTags(station.tags),
    bitrate: finiteNumber(station.bitrate),
    codec: cleanRadioText(station.codec, 80).toUpperCase() || null,
    votes: finiteNumber(station.votes),
    click_count: finiteNumber(station.clickcount),
    category_slug: category,
    categories: [category],
    source_payload_hash: payloadHash,
    source_last_seen_at: now,
    is_active: true,
    last_checked_at: now,
  };
}
