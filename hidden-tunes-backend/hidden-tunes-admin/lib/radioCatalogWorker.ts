import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RadioWorkerCategory = {
  id: string;
  tag?: string;
  countryCode?: string;
};

type RadioBrowserStation = {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  favicon?: string;
  country?: string;
  countrycode?: string;
  language?: string;
  tags?: string;
  bitrate?: number;
  codec?: string;
  votes?: number;
  clickcount?: number;
};

export type RadioCatalogWorkerResult = {
  success: boolean;
  category: string;
  table_available: boolean;
  stations_found: number;
  stations_attempted: number;
  stations_inserted: number;
  stations_updated: number;
  stations_skipped: number;
  errors: string[];
};

export const RADIO_WORKER_CATEGORIES: RadioWorkerCategory[] = [
  { id: "country", tag: "country" },
  { id: "gospel", tag: "gospel" },
  { id: "afrobeats", tag: "afrobeat" },
  { id: "jazz", tag: "jazz" },
  { id: "classical", tag: "classical" },
  { id: "news", tag: "news" },
  { id: "global" },
  { id: "mood", tag: "chill" },
  { id: "location", countryCode: "US" },
  { id: "relationship", tag: "love" },
  { id: "faith", tag: "christian" },
  { id: "focus", tag: "ambient" },
];

const RADIO_BROWSER_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
] as const;

const RADIO_BROWSER_USER_AGENT = "HiddenTunes/1.0 (catalog worker)";
const HIDDEN_PROVIDER_TAG =
  /^(radio[- ]?browser|icecast|shoutcast|radionomy|tunein|streema|live365)$/i;

function cleanText(value: unknown, maxLength = 300) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeTags(value: unknown) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag && !HIDDEN_PROVIDER_TAG.test(tag))
    .slice(0, 8);
}

function cleanHttpsUrl(value: unknown) {
  const raw = cleanText(value, 2000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function buildRadioBrowserPath(category: RadioWorkerCategory, options: {
  limit: number;
  offset: number;
}) {
  const limit = Math.max(1, Math.min(25, options.limit));
  const offset = Math.max(0, options.offset);

  if (category.countryCode) {
    return `/json/stations/bycountrycodeexact/${encodeURIComponent(
      category.countryCode
    )}?limit=${limit}&offset=${offset}&order=votes&reverse=true&hidebroken=true`;
  }

  if (category.tag) {
    return `/json/stations/search?tag=${encodeURIComponent(
      category.tag
    )}&limit=${limit}&offset=${offset}&order=votes&reverse=true&hidebroken=true`;
  }

  return `/json/stations/search?limit=${limit}&offset=${offset}&order=votes&reverse=true&hidebroken=true`;
}

async function fetchRadioBrowserJson(path: string, timeoutMs: number) {
  let lastError: unknown = null;

  for (const server of RADIO_BROWSER_SERVERS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${server}${path}`, {
        headers: {
          "User-Agent": RADIO_BROWSER_USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        lastError = new Error(`radio_browser_${response.status}`);
        continue;
      }

      const text = await response.text();
      if (!text.trim().startsWith("[")) {
        lastError = new Error("radio_browser_invalid_json");
        continue;
      }

      return JSON.parse(text) as RadioBrowserStation[];
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("radio_browser_failed");
}

function normalizeRadioStation(station: RadioBrowserStation, category: string) {
  const sourceStationUuid = cleanText(station.stationuuid, 120).toLowerCase();
  const streamUrl = cleanHttpsUrl(station.url_resolved || station.url);
  const name = cleanText(station.name, 300);

  if (!sourceStationUuid || !name || !streamUrl) return null;

  return {
    name,
    source_type: "radio_browser",
    source_station_uuid: sourceStationUuid,
    stream_url: streamUrl,
    favicon_url: cleanHttpsUrl(station.favicon) || null,
    country: cleanText(station.country, 120) || null,
    country_code: cleanText(station.countrycode, 2).toUpperCase() || null,
    language: cleanText(station.language, 120) || null,
    tags: normalizeTags(station.tags),
    bitrate: Number.isFinite(Number(station.bitrate)) ? Number(station.bitrate) : null,
    codec: cleanText(station.codec, 80) || null,
    votes: Number.isFinite(Number(station.votes)) ? Number(station.votes) : null,
    click_count: Number.isFinite(Number(station.clickcount))
      ? Number(station.clickcount)
      : null,
    category_slug: category,
    categories: [category],
    status: "approved",
    playback_status: "unchecked",
    is_active: true,
    is_verified: false,
    last_checked_at: new Date().toISOString(),
  };
}

async function radioTableAvailable() {
  const { error } = await supabaseAdmin
    .from("radio_stations")
    .select("id", { count: "exact", head: true });
  return !error;
}

async function updateThenInsertStation(
  station: NonNullable<ReturnType<typeof normalizeRadioStation>>
) {
  const { data: existing, error: selectError } = await supabaseAdmin
    .from("radio_stations")
    .select("id")
    .eq("source_type", station.source_type)
    .eq("source_station_uuid", station.source_station_uuid)
    .limit(1);

  if (selectError) throw selectError;

  if (existing && existing.length > 0) {
    const { error: updateError } = await supabaseAdmin
      .from("radio_stations")
      .update(station)
      .eq("id", existing[0].id);
    if (updateError) throw updateError;
    return "updated" as const;
  }

  const { error: insertError } = await supabaseAdmin
    .from("radio_stations")
    .insert(station);
  if (insertError) throw insertError;
  return "inserted" as const;
}

export async function ingestRadioCatalogBatch(options: {
  categoryIndex: number;
  offset: number;
  batchSize: number;
  timeoutMs: number;
}): Promise<RadioCatalogWorkerResult> {
  const category =
    RADIO_WORKER_CATEGORIES[
      Math.max(0, options.categoryIndex) % RADIO_WORKER_CATEGORIES.length
    ];

  const result: RadioCatalogWorkerResult = {
    success: true,
    category: category.id,
    table_available: true,
    stations_found: 0,
    stations_attempted: 0,
    stations_inserted: 0,
    stations_updated: 0,
    stations_skipped: 0,
    errors: [],
  };

  if (!(await radioTableAvailable())) {
    return {
      ...result,
      table_available: false,
      stations_skipped: options.batchSize,
      errors: ["radio_stations table is not available"],
    };
  }

  const rawStations = await fetchRadioBrowserJson(
    buildRadioBrowserPath(category, {
      limit: options.batchSize,
      offset: options.offset,
    }),
    Math.min(options.timeoutMs, 12_000)
  );
  result.stations_found = rawStations.length;

  const seen = new Set<string>();
  for (const rawStation of rawStations) {
    const station = normalizeRadioStation(rawStation, category.id);
    if (!station || seen.has(station.source_station_uuid)) {
      result.stations_skipped += 1;
      continue;
    }
    seen.add(station.source_station_uuid);
    result.stations_attempted += 1;

    try {
      const writeResult = await updateThenInsertStation(station);
      if (writeResult === "updated") result.stations_updated += 1;
      else result.stations_inserted += 1;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  result.success = result.errors.length === 0;
  return result;
}
