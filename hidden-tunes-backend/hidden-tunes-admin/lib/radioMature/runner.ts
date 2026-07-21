import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CatalogDedupeIndex,
  isCatalogDuplicate,
  loadCatalogDedupeIndex,
} from "@/lib/radioExpansion25k/catalogDedupeIndex";
import { fetchRadioBrowserJson, sleep } from "@/lib/radioExpansion25k/radioBrowserFetch";
import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";
import {
  classifyMatureRadioCandidate,
  shouldAutoInsertMatureCandidate,
  shouldQueueMatureReview,
  shouldRejectMatureCandidate,
} from "@/lib/radioMature/classifier";
import type { MatureRadioExpansionCheckpoint } from "@/lib/radioMature/checkpoint";
import {
  RADIO_MATURE_DEFAULT_PAGE_SIZE,
  RADIO_MATURE_EMPTY_PAGE_EXHAUST_THRESHOLD,
  RADIO_MATURE_EXPANSION_SOURCE_KEY,
  RADIO_MATURE_USER_AGENT,
} from "@/lib/radioMature/constants";
import { buildMatureRadioBrowserPath, buildMatureRadioDiscoveryQueries } from "@/lib/radioMature/discoveryQueries";
import {
  insertMatureRadioStationOnly,
  queueMatureRadioReviewItem,
} from "@/lib/radioMature/insertMatureImport";
import { getMatureRadioSource } from "@/lib/radioMature/sourceRegistry";
import {
  normalizeRadioBrowserStationForImport,
  type RadioBrowserStation,
} from "@/lib/radioNormalization";

export type MatureRadioRunnerOptions = {
  mode: "dry-run" | "execute";
  maxPages: number;
  delayMs: number;
  timeoutMs: number;
  pageSize: number;
};

type BatchIndexes = {
  source: Set<string>;
  stream: Set<string>;
  fingerprint: Set<string>;
};

function uniqueIndexes() {
  return {
    source: new Set<string>(),
    stream: new Set<string>(),
    fingerprint: new Set<string>(),
  };
}

function isBatchDuplicate(indexes: BatchIndexes, normalized: {
  source_name: string;
  source_station_id: string;
  normalized_stream_url: string;
  station_fingerprint: string;
}) {
  const sourceKey = `${normalized.source_name}:${normalized.source_station_id}`;
  if (indexes.source.has(sourceKey)) return "batch_source";
  if (indexes.stream.has(normalized.normalized_stream_url)) return "batch_stream";
  if (indexes.fingerprint.has(normalized.station_fingerprint)) return "batch_fingerprint";
  return null;
}

function rememberBatch(indexes: BatchIndexes, normalized: {
  source_name: string;
  source_station_id: string;
  normalized_stream_url: string;
  station_fingerprint: string;
}) {
  indexes.source.add(`${normalized.source_name}:${normalized.source_station_id}`);
  indexes.stream.add(normalized.normalized_stream_url);
  indexes.fingerprint.add(normalized.station_fingerprint);
}

function markQueryExhausted(checkpoint: MatureRadioExpansionCheckpoint, queryKey: string) {
  if (!checkpoint.exhausted_queries.includes(queryKey)) {
    checkpoint.exhausted_queries.push(queryKey);
  }
}

async function fetchMatureQueryPage(
  query: RadioExpansionQuery,
  offset: number,
  options: MatureRadioRunnerOptions
) {
  const path = buildMatureRadioBrowserPath(query, options.pageSize, offset);
  return fetchRadioBrowserJson(path, {
    timeoutMs: options.timeoutMs,
    userAgent: RADIO_MATURE_USER_AGENT,
    maxRetries: 4,
  });
}

async function processStation(
  supabase: SupabaseClient,
  catalogIndex: CatalogDedupeIndex,
  batchIndexes: BatchIndexes,
  checkpoint: MatureRadioExpansionCheckpoint,
  station: RadioBrowserStation,
  query: RadioExpansionQuery,
  options: MatureRadioRunnerOptions
) {
  checkpoint.stats.raw_candidates += 1;

  const classification = classifyMatureRadioCandidate(station);
  const bucket = classification.classification;

  if (bucket === "confirmed_mature") checkpoint.stats.confirmed_mature += 1;
  else if (bucket === "borderline" || bucket === "likely_mature") checkpoint.stats.borderline += 1;
  else if (bucket === "adult_contemporary_false_positive") checkpoint.stats.false_positive += 1;
  else if (bucket === "podcast_or_on_demand") checkpoint.stats.podcast_or_on_demand += 1;
  else checkpoint.stats.not_mature += 1;

  const normalized = normalizeRadioBrowserStationForImport(station, query.categorySlug, {
    sourceServer: null,
  });
  if (!normalized) {
    checkpoint.stats.rejected += 1;
    return;
  }

  const batchDup = isBatchDuplicate(batchIndexes, normalized);
  if (batchDup) {
    checkpoint.stats.duplicates += 1;
    return;
  }

  const catalogDup = isCatalogDuplicate(normalized, catalogIndex);

  const source = getMatureRadioSource(RADIO_MATURE_EXPANSION_SOURCE_KEY);
  const rightsStatus = source?.rights_status === "approved" ? "approved" : "pending";

  if (shouldRejectMatureCandidate(bucket)) {
    checkpoint.stats.rejected += 1;
    return;
  }

  if (shouldQueueMatureReview(bucket)) {
    // Borderline duplicates already in the general catalog stay there until manual review.
    if (catalogDup) {
      checkpoint.stats.duplicates += 1;
      return;
    }
    rememberBatch(batchIndexes, normalized);
    if (options.mode === "execute") {
      await queueMatureRadioReviewItem(supabase, {
        source_key: RADIO_MATURE_EXPANSION_SOURCE_KEY,
        source_name: source?.source_name || "Radio Browser",
        station_name: normalized.name,
        country_code: normalized.country_code,
        language: normalized.language,
        tags: normalized.tags,
        homepage_url: normalized.homepage_url,
        stream_url: normalized.stream_url,
        classification: bucket,
        classification_reason: classification.reason,
        mature_evidence: classification.evidence.join(", "),
        rights_evidence: source?.rights_notes || null,
        source_station_uuid: normalized.source_station_uuid,
        station_fingerprint: normalized.station_fingerprint,
        raw_payload: station as Record<string, unknown>,
      });
    }
    checkpoint.stats.review_queued += 1;
    return;
  }

  if (!shouldAutoInsertMatureCandidate(bucket)) {
    checkpoint.stats.rejected += 1;
    return;
  }

  // Confirmed mature: insert new rows, or convert existing general-catalog duplicates.
  rememberBatch(batchIndexes, normalized);

  const insertResult = await insertMatureRadioStationOnly(supabase, normalized, {
    dryRun: options.mode === "dry-run",
    matureReviewStatus: "confirmed",
    matureReviewReason: `${classification.classification}: ${classification.reason}`,
    matureEvidenceUrl: normalized.homepage_url,
    matureEvidenceType: classification.mature_evidence_type,
    rightsStatus,
    rightsNotes: source?.rights_notes || null,
    sourceAuthorizationStatus: rightsStatus === "approved" ? "approved" : "pending",
    contentRating: "adult",
  });

  if (insertResult.outcome === "inserted" || insertResult.outcome === "dry_run_would_insert") {
    checkpoint.stats.inserted += 1;
  } else if (insertResult.outcome === "duplicate") {
    checkpoint.stats.duplicates += 1;
  } else {
    checkpoint.stats.rejected += 1;
  }
}

export async function runMatureRadioDiscoveryImport(
  supabase: SupabaseClient,
  checkpoint: MatureRadioExpansionCheckpoint,
  options: MatureRadioRunnerOptions
) {
  const queries = buildMatureRadioDiscoveryQueries().filter(
    (query) => !checkpoint.exhausted_queries.includes(query.key)
  );
  const catalogIndex = await loadCatalogDedupeIndex(supabase);
  const batchIndexes = uniqueIndexes();
  let pagesProcessed = 0;

  for (const query of queries) {
    if (pagesProcessed >= options.maxPages) break;

    let offset = checkpoint.query_offsets[query.key] || 0;
    let emptyStreak = checkpoint.empty_streak[query.key] || 0;

    while (pagesProcessed < options.maxPages) {
      let response: { stations: RadioBrowserStation[] };
      try {
        response = await fetchMatureQueryPage(query, offset, options);
      } catch (error) {
        checkpoint.failed_pages.push({
          query_key: query.key,
          offset,
          attempts: 1,
          reason: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        break;
      }

      pagesProcessed += 1;
      const stations = response.stations || [];

      if (stations.length === 0) {
        emptyStreak += 1;
        checkpoint.empty_streak[query.key] = emptyStreak;
        if (emptyStreak >= RADIO_MATURE_EMPTY_PAGE_EXHAUST_THRESHOLD) {
          markQueryExhausted(checkpoint, query.key);
        }
        break;
      }

      emptyStreak = 0;
      checkpoint.empty_streak[query.key] = 0;

      for (const station of stations) {
        await processStation(
          supabase,
          catalogIndex,
          batchIndexes,
          checkpoint,
          station,
          query,
          options
        );
      }

      offset += stations.length;
      checkpoint.query_offsets[query.key] = offset;
      checkpoint.completed_pages.push({ query_key: query.key, offset });

      if (stations.length < Math.min(options.pageSize, RADIO_MATURE_DEFAULT_PAGE_SIZE)) {
        markQueryExhausted(checkpoint, query.key);
        break;
      }

      if (options.delayMs > 0) await sleep(options.delayMs);
    }
  }

  const allQueries = buildMatureRadioDiscoveryQueries();
  checkpoint.cursor_complete =
    allQueries.length > 0 &&
    allQueries.every((query) => checkpoint.exhausted_queries.includes(query.key));

  return {
    pagesProcessed,
    remainingQueries: allQueries.filter((query) => !checkpoint.exhausted_queries.includes(query.key)).length,
    cursorComplete: checkpoint.cursor_complete,
  };
}
