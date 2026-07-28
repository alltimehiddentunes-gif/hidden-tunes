import type { SupabaseClient } from "@supabase/supabase-js";

import { buildRadioSourceUpdatePayload } from "@/lib/radioCatalogWorker";
import type { NormalizedRadioStation } from "@/lib/radioNormalization";

export type InsertOnlyOutcome =
  | "inserted"
  | "duplicate"
  | "dry_run_would_insert"
  | "failed";

export type InsertOnlyResult = {
  outcome: InsertOnlyOutcome;
  reason?: string;
  stationId?: string;
  error?: string;
};

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

async function selectSingleStation(
  supabase: SupabaseClient,
  filters: Array<[string, unknown]>
) {
  let query = supabase.from("radio_stations").select("id").limit(1);
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0]?.id ? String(data[0].id) : null;
}

export async function findExistingRadioStationId(
  supabase: SupabaseClient,
  station: NormalizedRadioStation
): Promise<{ id: string; reason: string } | null> {
  const { data: mapped, error: mapError } = await supabase
    .from("radio_station_sources")
    .select("station_id")
    .eq("source_name", station.source_name)
    .eq("source_station_id", station.source_station_id)
    .maybeSingle();
  if (mapError) throw mapError;
  if (mapped?.station_id) {
    return { id: String(mapped.station_id), reason: "source_mapping" };
  }

  const sourceMatch = await selectSingleStation(supabase, [
    ["source_name", station.source_name],
    ["source_station_id", station.source_station_id],
  ]);
  if (sourceMatch) return { id: sourceMatch, reason: "source_id" };

  const legacyMatch = await selectSingleStation(supabase, [
    ["source_type", station.source_type],
    ["source_station_uuid", station.source_station_uuid],
  ]);
  if (legacyMatch) return { id: legacyMatch, reason: "legacy_source_uuid" };

  const streamMatch = await selectSingleStation(supabase, [
    ["normalized_stream_url", station.normalized_stream_url],
  ]);
  if (streamMatch) return { id: streamMatch, reason: "normalized_stream_url" };

  const fingerprintMatch = await selectSingleStation(supabase, [
    ["station_fingerprint", station.station_fingerprint],
  ]);
  if (fingerprintMatch) return { id: fingerprintMatch, reason: "fingerprint" };

  if (station.country_code && station.normalized_homepage_host) {
    const compositeMatch = await selectSingleStation(supabase, [
      ["normalized_name", station.normalized_name],
      ["country_code", station.country_code],
      ["normalized_homepage_host", station.normalized_homepage_host],
    ]);
    if (compositeMatch) return { id: compositeMatch, reason: "composite_identity" };
  }

  return null;
}

async function upsertSourceMapping(
  supabase: SupabaseClient,
  stationId: string,
  station: NormalizedRadioStation
) {
  const payload = {
    station_id: stationId,
    source_name: station.source_name,
    source_station_id: station.source_station_id,
    source_uuid: station.source_uuid,
    source_server: station.source_server,
    source_payload_hash: station.source_payload_hash,
    source_last_seen_at: station.source_last_seen_at,
  };
  const { error } = await supabase
    .from("radio_station_sources")
    .upsert(payload, { onConflict: "source_name,source_station_id" });
  if (error) throw error;
}

export async function insertNewRadioStationOnly(
  supabase: SupabaseClient,
  station: NormalizedRadioStation,
  options: { dryRun: boolean }
): Promise<InsertOnlyResult> {
  try {
    const existing = await findExistingRadioStationId(supabase, station);
    if (existing) {
      return { outcome: "duplicate", reason: existing.reason };
    }

    if (options.dryRun) {
      return { outcome: "dry_run_would_insert" };
    }

    const { data, error: insertError } = await supabase
      .from("radio_stations")
      .insert(buildInsertPayload(station))
      .select("id")
      .single();
    if (insertError) throw insertError;

    await upsertSourceMapping(supabase, String(data.id), station);
    return { outcome: "inserted", stationId: String(data.id) };
  } catch (error) {
    return {
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function bulkFindExistingSourceKeys(
  supabase: SupabaseClient,
  sourceKeys: string[]
) {
  const existing = new Set<string>();
  for (const sourceChunk of chunk(sourceKeys, 100)) {
    const names = Array.from(new Set(sourceChunk.map((key) => key.split(":")[0])));
    const ids = sourceChunk.map((key) => key.slice(key.indexOf(":") + 1));
    const { data, error } = await supabase
      .from("radio_station_sources")
      .select("source_name, source_station_id")
      .in("source_name", names)
      .in("source_station_id", ids);
    if (error) throw error;
    for (const row of data || []) {
      existing.add(`${row.source_name}:${row.source_station_id}`);
    }
  }
  return existing;
}
