import { createHash } from "node:crypto";

import {
  buildRadioStationFingerprint,
  cleanRadioText,
  getHomepageHost,
  normalizeRadioName,
  normalizeRadioUrl,
  type NormalizedRadioStation,
} from "@/lib/radioNormalization";
import type { WorldwideRadioCountry } from "@/lib/radioWorldwideExpansion/types";

export type DeepSourceSeed = {
  code: string;
  name: string;
  url: string;
  attribution: string;
  source_family:
    | "junguler_m3u"
    | "radio_garden_site"
    | "radio_browser_deep"
    | "manual";
};

export function hashId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 32);
}

export function isRejectedDeepUrl(url: string): string | null {
  if (/[?&]k=\d{8,}/i.test(url) && /openstream\.co/i.test(url)) return "short_lived_signed_url";
  if (/halo\.streamerr\.co\/listen\/italiavera/i.test(url)) return "wrong_country_antenna_web";
  if (/antenna.?web/i.test(url)) return "antenna_web";
  return null;
}

export function buildCuratedNormalizedStation(options: {
  country: WorldwideRadioCountry;
  name: string;
  streamUrl: string;
  attribution: string;
  tags?: string[];
}): NormalizedRadioStation | null {
  if (isRejectedDeepUrl(options.streamUrl)) return null;
  const sourceStreamUrl = normalizeRadioUrl(options.streamUrl, { stream: true });
  const normalizedStreamUrl = normalizeRadioUrl(sourceStreamUrl, { stream: true }).toLowerCase();
  const cleanedName = cleanRadioText(options.name, 300);
  const normalizedName = normalizeRadioName(cleanedName);
  if (!sourceStreamUrl || !normalizedStreamUrl || !cleanedName || !normalizedName) return null;
  const now = new Date().toISOString();
  const sourceStationId = `curated_${options.country.code.toLowerCase()}_${hashId(normalizedStreamUrl)}`;
  return {
    name: cleanedName,
    normalized_name: normalizedName,
    station_fingerprint: buildRadioStationFingerprint({
      normalized_stream_url: normalizedStreamUrl,
      normalized_name: normalizedName,
      country_code: options.country.code,
      normalized_homepage_host: null,
    }),
    fingerprint_version: 1,
    source_name: "radio_browser",
    source_type: "radio_browser",
    source_uuid: sourceStationId,
    source_station_id: sourceStationId,
    source_station_uuid: sourceStationId,
    source_server: `hidden_tunes_trusted_catalog:${options.attribution}`,
    source_stream_url: sourceStreamUrl,
    stream_url: sourceStreamUrl,
    normalized_stream_url: normalizedStreamUrl,
    homepage_url: null,
    normalized_homepage_host: getHomepageHost(null),
    favicon_url: null,
    country: options.country.name,
    country_code: options.country.code,
    state: null,
    language: null,
    tags: options.tags || [
      options.country.name.toLowerCase(),
      options.country.continent,
      "curated",
      "deep_source",
    ],
    bitrate: null,
    codec: null,
    votes: null,
    click_count: null,
    category_slug: "global",
    categories: ["global"],
    source_payload_hash: hashId(`${cleanedName}|${normalizedStreamUrl}`),
    source_last_seen_at: now,
    is_active: true,
    last_checked_at: now,
  };
}
