import type { SupabaseClient } from "@supabase/supabase-js";

import { chunk } from "@/lib/radioExpansion25k/insertOnlyImport";

export type CatalogDedupeIndex = {
  sourceKeys: Set<string>;
  streams: Set<string>;
  fingerprints: Set<string>;
  legacyUuids: Set<string>;
  loaded_at: string;
  source_key_count: number;
  stream_count: number;
  fingerprint_count: number;
  legacy_uuid_count: number;
};

async function paginateSelect<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  pageSize: number,
  onPage: (rows: T[]) => void
) {
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    if (rows.length === 0) break;
    onPage(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
}

export async function loadCatalogDedupeIndex(
  supabase: SupabaseClient,
  options: { pageSize?: number } = {}
): Promise<CatalogDedupeIndex> {
  const pageSize = options.pageSize ?? 1000;
  const sourceKeys = new Set<string>();
  const streams = new Set<string>();
  const fingerprints = new Set<string>();
  const legacyUuids = new Set<string>();

  await paginateSelect<{ source_name: string; source_station_id: string }>(
    supabase,
    "radio_station_sources",
    "source_name, source_station_id",
    pageSize,
    (rows) => {
      for (const row of rows) {
        if (row.source_name && row.source_station_id) {
          sourceKeys.add(`${row.source_name}:${row.source_station_id}`);
        }
      }
    }
  );

  await paginateSelect<{
    normalized_stream_url: string | null;
    station_fingerprint: string | null;
    source_station_uuid: string | null;
  }>(
    supabase,
    "radio_stations",
    "normalized_stream_url, station_fingerprint, source_station_uuid",
    pageSize,
    (rows) => {
      for (const row of rows) {
        if (row.normalized_stream_url) streams.add(row.normalized_stream_url);
        if (row.station_fingerprint) fingerprints.add(row.station_fingerprint);
        if (row.source_station_uuid) legacyUuids.add(row.source_station_uuid.toLowerCase());
      }
    }
  );

  return {
    sourceKeys,
    streams,
    fingerprints,
    legacyUuids,
    loaded_at: new Date().toISOString(),
    source_key_count: sourceKeys.size,
    stream_count: streams.size,
    fingerprint_count: fingerprints.size,
    legacy_uuid_count: legacyUuids.size,
  };
}

export function mergeCatalogIntoCandidateIndexes(
  indexes: {
    source: Set<string>;
    stream: Set<string>;
    fingerprint: Set<string>;
  },
  catalog: CatalogDedupeIndex
) {
  for (const key of catalog.sourceKeys) indexes.source.add(key);
  for (const stream of catalog.streams) indexes.stream.add(stream);
  for (const fingerprint of catalog.fingerprints) indexes.fingerprint.add(fingerprint);
}

export function isCatalogDuplicate(
  normalized: {
    source_name: string;
    source_station_id: string;
    source_station_uuid: string;
    normalized_stream_url: string;
    station_fingerprint: string;
  },
  catalog: CatalogDedupeIndex
) {
  const sourceKey = `${normalized.source_name}:${normalized.source_station_id}`;
  if (catalog.sourceKeys.has(sourceKey)) return "catalog_source";
  if (catalog.legacyUuids.has(normalized.source_station_uuid.toLowerCase())) return "catalog_legacy_uuid";
  if (catalog.streams.has(normalized.normalized_stream_url)) return "catalog_stream";
  if (catalog.fingerprints.has(normalized.station_fingerprint)) return "catalog_fingerprint";
  return null;
}

export async function bulkFindExistingSourceKeysPaged(
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
