import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  NormalizedRadioStation,
  RadioBrowserStation,
  normalizeRadioBrowserStationForImport,
} from "@/lib/radioNormalization";

type RadioWorkerCategory = {
  id: string;
  tag?: string;
  countryCode?: string;
};

type ImportClassification =
  | "inserted"
  | "updated"
  | "unchanged"
  | "duplicate_source"
  | "duplicate_canonical"
  | "conflict"
  | "skipped_invalid";

type ExistingRadioRow = Record<string, unknown> & {
  id: string;
  name?: string | null;
  normalized_name?: string | null;
  normalized_stream_url?: string | null;
  station_fingerprint?: string | null;
  source_name?: string | null;
  source_station_id?: string | null;
  source_station_uuid?: string | null;
  stream_url?: string | null;
  source_stream_url?: string | null;
  country_code?: string | null;
  normalized_homepage_host?: string | null;
  source_payload_hash?: string | null;
  metadata_locked?: boolean | null;
  manual_override?: boolean | null;
  is_curated?: boolean | null;
};

export type RadioCatalogWorkerResult = {
  success: boolean;
  category: string;
  table_available: boolean;
  dry_run: boolean;
  stations_found: number;
  stations_attempted: number;
  stations_inserted: number;
  stations_updated: number;
  stations_unchanged: number;
  stations_skipped: number;
  duplicate_source_count: number;
  duplicate_canonical_count: number;
  conflict_count: number;
  invalid_count: number;
  curated_protection_count: number;
  verification_preserved_count: number;
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
const RADIO_EXISTING_SELECT =
  "id, name, normalized_name, normalized_stream_url, station_fingerprint, source_name, source_station_id, source_station_uuid, stream_url, source_stream_url, country_code, normalized_homepage_host, source_payload_hash, metadata_locked, manual_override, is_curated, is_verified, playback_status, reliability_score, health_status, consecutive_failures, quarantined_at, quarantine_reason, is_active, is_featured";

function buildRadioBrowserPath(
  category: RadioWorkerCategory,
  options: {
    limit: number;
    offset: number;
  }
) {
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

      return {
        server,
        stations: JSON.parse(text) as RadioBrowserStation[],
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("radio_browser_failed");
}

async function radioTableAvailable() {
  const { error } = await supabaseAdmin
    .from("radio_stations")
    .select("id", { count: "exact", head: true });
  return !error;
}

function isCurated(row: ExistingRadioRow | null) {
  return row?.metadata_locked === true || row?.manual_override === true || row?.is_curated === true;
}

function buildInsertPayload(station: NormalizedRadioStation) {
  return {
    ...buildRadioSourceUpdatePayload(station, null),
    name: station.name,
    status: "approved",
    playback_status: "unchecked",
    is_active: true,
    is_verified: false,
    is_featured: false,
    is_mature: false,
    reliability_score: 0,
    consecutive_failures: 0,
    health_status: "unchecked",
    imported_at: station.source_last_seen_at,
  };
}

export function buildRadioSourceUpdatePayload(
  station: NormalizedRadioStation,
  existing: ExistingRadioRow | null
) {
  const payload: Record<string, unknown> = {
    normalized_name: station.normalized_name,
    station_fingerprint: station.station_fingerprint,
    fingerprint_version: station.fingerprint_version,
    source_name: station.source_name,
    source_type: station.source_type,
    source_uuid: station.source_uuid,
    source_station_id: station.source_station_id,
    source_station_uuid: station.source_station_uuid,
    source_server: station.source_server,
    source_stream_url: station.source_stream_url,
    stream_url: station.stream_url,
    normalized_stream_url: station.normalized_stream_url,
    homepage_url: station.homepage_url,
    normalized_homepage_host: station.normalized_homepage_host,
    favicon_url: station.favicon_url,
    country: station.country,
    country_code: station.country_code,
    state: station.state,
    language: station.language,
    tags: station.tags,
    bitrate: station.bitrate,
    codec: station.codec,
    votes: station.votes,
    click_count: station.click_count,
    category_slug: station.category_slug,
    categories: station.categories,
    source_payload_hash: station.source_payload_hash,
    source_last_seen_at: station.source_last_seen_at,
    last_checked_at: station.last_checked_at,
  };

  if (!isCurated(existing) && !existing?.name) {
    payload.name = station.name;
  }

  return payload;
}

function sourceFieldsEqual(existing: ExistingRadioRow, payload: Record<string, unknown>) {
  return Object.entries(payload).every(([key, value]) => {
    const existingValue = existing[key];
    if (Array.isArray(value) || Array.isArray(existingValue)) {
      return JSON.stringify(existingValue || []) === JSON.stringify(value || []);
    }
    return (existingValue ?? null) === (value ?? null);
  });
}

async function findBySourceMapping(station: NormalizedRadioStation) {
  const { data, error } = await supabaseAdmin
    .from("radio_station_sources")
    .select("station_id")
    .eq("source_name", station.source_name)
    .eq("source_station_id", station.source_station_id)
    .maybeSingle();

  if (error) throw error;
  if (!data?.station_id) return null;

  const { data: row, error: rowError } = await supabaseAdmin
    .from("radio_stations")
    .select(RADIO_EXISTING_SELECT)
    .eq("id", data.station_id)
    .maybeSingle();

  if (rowError) throw rowError;
  return row as ExistingRadioRow | null;
}

async function findExistingStation(station: NormalizedRadioStation) {
  const mapped = await findBySourceMapping(station);
  if (mapped) return { row: mapped, reason: "source" as const };

  const sourceMatch = await selectSingleStation([
    ["source_name", station.source_name],
    ["source_station_id", station.source_station_id],
  ]);
  if (sourceMatch) return { row: sourceMatch, reason: "source" as const };

  const legacySourceMatch = await selectSingleStation([
    ["source_type", station.source_type],
    ["source_station_uuid", station.source_station_uuid],
  ]);
  if (legacySourceMatch) return { row: legacySourceMatch, reason: "source" as const };

  const streamMatch = await selectSingleStation([
    ["normalized_stream_url", station.normalized_stream_url],
  ]);
  if (streamMatch) return { row: streamMatch, reason: "stream" as const };

  const fingerprintMatch = await selectSingleStation([
    ["station_fingerprint", station.station_fingerprint],
  ]);
  if (fingerprintMatch) return { row: fingerprintMatch, reason: "fingerprint" as const };

  if (station.country_code && station.normalized_homepage_host) {
    const compositeMatch = await selectSingleStation([
      ["normalized_name", station.normalized_name],
      ["country_code", station.country_code],
      ["normalized_homepage_host", station.normalized_homepage_host],
    ]);
    if (compositeMatch) return { row: compositeMatch, reason: "composite" as const };
  }

  return null;
}

async function selectSingleStation(filters: Array<[string, unknown]>) {
  let query = supabaseAdmin.from("radio_stations").select(RADIO_EXISTING_SELECT);
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  const { data, error } = await query.limit(2);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0] as ExistingRadioRow;
}

function isConflicting(existing: ExistingRadioRow, station: NormalizedRadioStation) {
  const streamChanged =
    existing.normalized_stream_url && existing.normalized_stream_url !== station.normalized_stream_url;
  const nameChanged = existing.normalized_name && existing.normalized_name !== station.normalized_name;
  const countryChanged = existing.country_code && station.country_code && existing.country_code !== station.country_code;

  return Boolean(isCurated(existing) && ((streamChanged && nameChanged) || countryChanged));
}

async function upsertSourceMapping(
  stationId: string,
  station: NormalizedRadioStation,
  dryRun: boolean
) {
  if (dryRun) return;

  const payload = {
    station_id: stationId,
    source_name: station.source_name,
    source_station_id: station.source_station_id,
    source_uuid: station.source_uuid,
    source_server: station.source_server,
    source_payload_hash: station.source_payload_hash,
    source_last_seen_at: station.source_last_seen_at,
  };

  const { error } = await supabaseAdmin
    .from("radio_station_sources")
    .upsert(payload, { onConflict: "source_name,source_station_id" });
  if (error) throw error;
}

async function updateThenInsertStation(
  station: NormalizedRadioStation,
  options: { dryRun: boolean }
): Promise<{
  classification: ImportClassification;
  curatedProtected: boolean;
  verificationPreserved: boolean;
}> {
  const match = await findExistingStation(station);
  const dryRun = options.dryRun;

  if (match?.row) {
    const existing = match.row;
    if (isConflicting(existing, station)) {
      return {
        classification: "conflict",
        curatedProtected: isCurated(existing),
        verificationPreserved: true,
      };
    }

    const updatePayload = buildRadioSourceUpdatePayload(station, existing);
    const unchanged =
      existing.source_payload_hash === station.source_payload_hash &&
      sourceFieldsEqual(existing, updatePayload);
    const classification: ImportClassification = unchanged
      ? "unchanged"
      : match.reason === "source"
        ? "updated"
        : "duplicate_canonical";

    if (!unchanged && !dryRun) {
      const { error: updateError } = await supabaseAdmin
        .from("radio_stations")
        .update(updatePayload)
        .eq("id", existing.id);
      if (updateError) throw updateError;
    }

    await upsertSourceMapping(existing.id, station, dryRun);
    return {
      classification,
      curatedProtected: isCurated(existing),
      verificationPreserved: true,
    };
  }

  if (dryRun) {
    return {
      classification: "inserted",
      curatedProtected: false,
      verificationPreserved: false,
    };
  }

  const { data, error: insertError } = await supabaseAdmin
    .from("radio_stations")
    .insert(buildInsertPayload(station))
    .select("id")
    .single();
  if (insertError) throw insertError;

  await upsertSourceMapping(data.id, station, dryRun);
  return {
    classification: "inserted",
    curatedProtected: false,
    verificationPreserved: false,
  };
}

export async function ingestRadioCatalogBatch(options: {
  categoryIndex: number;
  offset: number;
  batchSize: number;
  timeoutMs: number;
  dryRun?: boolean;
}): Promise<RadioCatalogWorkerResult> {
  const category =
    RADIO_WORKER_CATEGORIES[
      Math.max(0, options.categoryIndex) % RADIO_WORKER_CATEGORIES.length
    ];
  const dryRun = options.dryRun === true;

  const result: RadioCatalogWorkerResult = {
    success: true,
    category: category.id,
    table_available: true,
    dry_run: dryRun,
    stations_found: 0,
    stations_attempted: 0,
    stations_inserted: 0,
    stations_updated: 0,
    stations_unchanged: 0,
    stations_skipped: 0,
    duplicate_source_count: 0,
    duplicate_canonical_count: 0,
    conflict_count: 0,
    invalid_count: 0,
    curated_protection_count: 0,
    verification_preserved_count: 0,
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

  const fetched = await fetchRadioBrowserJson(
    buildRadioBrowserPath(category, {
      limit: options.batchSize,
      offset: options.offset,
    }),
    Math.min(options.timeoutMs, 12_000)
  );
  result.stations_found = fetched.stations.length;

  const seenSourceIds = new Set<string>();
  for (const rawStation of fetched.stations) {
    const station = normalizeRadioBrowserStationForImport(rawStation, category.id, {
      sourceServer: fetched.server,
    });
    if (!station) {
      result.stations_skipped += 1;
      result.invalid_count += 1;
      continue;
    }
    if (seenSourceIds.has(station.source_station_id)) {
      result.stations_skipped += 1;
      result.duplicate_source_count += 1;
      continue;
    }
    seenSourceIds.add(station.source_station_id);
    result.stations_attempted += 1;

    try {
      const writeResult = await updateThenInsertStation(station, { dryRun });
      if (writeResult.classification === "inserted") result.stations_inserted += 1;
      else if (writeResult.classification === "updated") result.stations_updated += 1;
      else if (writeResult.classification === "unchanged") result.stations_unchanged += 1;
      else if (writeResult.classification === "duplicate_source") result.duplicate_source_count += 1;
      else if (writeResult.classification === "duplicate_canonical") {
        result.duplicate_canonical_count += 1;
        result.stations_updated += dryRun ? 0 : 1;
      } else if (writeResult.classification === "conflict") {
        result.conflict_count += 1;
        result.stations_skipped += 1;
      }

      if (writeResult.curatedProtected) result.curated_protection_count += 1;
      if (writeResult.verificationPreserved) result.verification_preserved_count += 1;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  result.success = result.errors.length === 0;
  return result;
}
