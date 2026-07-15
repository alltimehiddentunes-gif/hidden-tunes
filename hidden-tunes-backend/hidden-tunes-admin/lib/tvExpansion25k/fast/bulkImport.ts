import { TV_VIDEO_SOURCE_TYPE } from "@/lib/tvCatalog";
import {
  type TvGrowthCandidate,
  type TvGrowthImportOptions,
  probeTvStation,
  validatePublicTvUrl,
} from "@/lib/tvStationHealth";
import type { TvDedupeCache } from "@/lib/tvExpansion25k/fast/dedupeCache";
import { guardDatabaseWrite } from "@/lib/tvExpansion25k/fast/dryRunGuard";
import { DomainConcurrencyLimiter } from "@/lib/tvExpansion25k/fast/domainLimiter";
import { mapWithConcurrency } from "@/lib/tvExpansion25k/fast/workerPool";
import {
  TvVerificationDiagnostics,
  type TvVerificationDiagnosticsSummary,
} from "@/lib/tvExpansion25k/fast/verificationDiagnostics";

export type BulkImportResult = {
  found: number;
  unique: number;
  imported: number;
  rejected: number;
  verificationChecks: number;
  databaseRoundTrips: number;
  staged: number;
  quarantined: number;
  wouldInsert: number;
  insertChunkCount: number;
  largestChunk: number;
  schemaValidationFailures: number;
  verificationDiagnostics: TvVerificationDiagnosticsSummary;
  perSourceDiagnostics: Record<string, TvVerificationDiagnosticsSummary>;
  preVerificationRejected?: number;
};

function sourceIdFromCandidate(candidate: TvGrowthCandidate) {
  const key = String(candidate.source_key || "");
  const colon = key.indexOf(":");
  if (colon > 0) return key.slice(0, colon);
  return "unknown";
}

function buildInsertRow(
  candidate: TvGrowthCandidate,
  probe: Awaited<ReturnType<typeof probeTvStation>>,
  url: string,
  options: TvGrowthImportOptions
) {
  const isMature = options.isMature === true;
  const matureSourceApproved = options.matureSourceApproved === true;
  const tags = [
    ...new Set(
      [
        ...(candidate.tags || []),
        ...(candidate.categories || []),
        candidate.category,
        candidate.genre,
        candidate.mood,
        candidate.format,
      ].filter(Boolean) as string[]
    ),
  ];

  return {
    source_type: candidate.source_type || TV_VIDEO_SOURCE_TYPE,
    source_id: candidate.source_id,
    source_url: url,
    embed_url: candidate.embed_url || null,
    title: candidate.title,
    description: candidate.description || null,
    channel_name: candidate.channel_name || null,
    thumbnail_url: candidate.thumbnail_url || null,
    category: candidate.category || candidate.categories?.[0] || null,
    genre: candidate.genre || null,
    mood: candidate.mood || null,
    format: candidate.format || null,
    tags: tags.length > 0 ? tags : null,
    language: candidate.language || null,
    region: candidate.country || candidate.region || null,
    source_key: candidate.source_key || `${candidate.source_type}:${candidate.source_id}`,
    status: "approved",
    playback_status: "playable",
    is_active: true,
    is_featured: candidate.is_featured === true,
    reliability_score: 100,
    consecutive_failures: 0,
    last_health_checked_at: new Date().toISOString(),
    ios_playable: probe.ios_playable === true,
    android_playable: probe.android_playable === true,
    stream_is_https: probe.stream_is_https === true,
    stream_protocol: probe.stream_protocol || null,
    validated_stream_url: probe.validated_stream_url || url,
    last_validation_result: probe.last_validation_result || null,
    is_mature: isMature || candidate.is_mature === true,
    mature_rating: options.matureRating || candidate.mature_rating || null,
    mature_source_approved: matureSourceApproved || candidate.mature_source_approved === true,
  };
}

function validateInsertRow(row: ReturnType<typeof buildInsertRow>) {
  if (!row.source_id || !row.title || !row.source_url) {
    return false;
  }
  return true;
}

async function verifyCandidate(
  candidate: TvGrowthCandidate,
  hostLimiter: DomainConcurrencyLimiter,
  diagnostics: TvVerificationDiagnostics,
  perSourceDiagnostics: Map<string, TvVerificationDiagnostics>
) {
  const sourceId = sourceIdFromCandidate(candidate);
  const sourceDiagnostics = perSourceDiagnostics.get(sourceId) || new TvVerificationDiagnostics();
  perSourceDiagnostics.set(sourceId, sourceDiagnostics);

  const started = Date.now();
  const urlCheck = validatePublicTvUrl(candidate.source_url);
  if (!urlCheck.ok) {
    const durationMs = Date.now() - started;
    diagnostics.recordFailure(urlCheck.reason, String(candidate.source_url || ""), candidate.country, durationMs);
    sourceDiagnostics.recordFailure(urlCheck.reason, String(candidate.source_url || ""), candidate.country, durationMs);
    return { ok: false as const, candidate, reason: urlCheck.reason };
  }

  return hostLimiter.run(urlCheck.url, async () => {
    const probe = await probeTvStation({
      id: "candidate",
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      source_url: urlCheck.url,
      embed_url: candidate.embed_url || null,
      title: candidate.title,
      status: "approved",
      playback_status: "unchecked",
      is_active: false,
      reliability_score: 100,
      consecutive_failures: 0,
    });

    const durationMs = Date.now() - started;
    if (!probe.playable) {
      const reason = probe.reason || probe.last_validation_result || "unknown_failure";
      diagnostics.recordFailure(reason, urlCheck.url, candidate.country || candidate.region, durationMs);
      sourceDiagnostics.recordFailure(reason, urlCheck.url, candidate.country || candidate.region, durationMs);
      return { ok: false as const, candidate, reason: probe.reason };
    }

    diagnostics.recordPass(durationMs);
    sourceDiagnostics.recordPass(durationMs);
    return {
      ok: true as const,
      candidate,
      url: urlCheck.url,
      probe,
    };
  });
}

function summarizePerSourceDiagnostics(perSourceDiagnostics: Map<string, TvVerificationDiagnostics>) {
  const summary: Record<string, TvVerificationDiagnosticsSummary> = {};
  for (const [sourceId, diagnostics] of perSourceDiagnostics.entries()) {
    summary[sourceId] = diagnostics.summary();
  }
  return summary;
}

/**
 * Discovery is separate from verification — bounded parallel probes, bulk inserts.
 * Dry-run performs verification and builds insert payloads without writing.
 */
export async function bulkImportVerifiedCandidates(
  candidates: TvGrowthCandidate[],
  dedupeCache: TvDedupeCache,
  options: {
    dryRun?: boolean;
    verifyConcurrency: number;
    perHostConcurrency: number;
    importBatchSize: number;
    importOptions?: TvGrowthImportOptions;
    skipPrefilter?: boolean;
  }
): Promise<BulkImportResult> {
  const dryRun = options.dryRun === true;
  const prefilter = options.skipPrefilter
    ? { accepted: candidates, removed: 0 }
    : await dedupeCache.prefilter(candidates);
  const uniqueCandidates = prefilter.accepted;
  let rejected = candidates.length - uniqueCandidates.length;
  let imported = 0;
  let verificationChecks = 0;
  let databaseRoundTrips = 0;
  let schemaValidationFailures = 0;
  const diagnostics = new TvVerificationDiagnostics();
  const perSourceDiagnostics = new Map<string, TvVerificationDiagnostics>();
  const emptyDiagnostics = diagnostics.summary();

  const importOptions = options.importOptions || {};
  if (importOptions.isMature && !importOptions.matureSourceApproved) {
    return {
      found: candidates.length,
      unique: uniqueCandidates.length,
      imported: 0,
      rejected: candidates.length,
      verificationChecks: 0,
      databaseRoundTrips: 0,
      staged: uniqueCandidates.length,
      quarantined: 0,
      wouldInsert: 0,
      insertChunkCount: 0,
      largestChunk: 0,
      schemaValidationFailures: 0,
      verificationDiagnostics: emptyDiagnostics,
      perSourceDiagnostics: {},
    };
  }

  if (uniqueCandidates.length === 0) {
    return {
      found: candidates.length,
      unique: 0,
      imported: 0,
      rejected,
      verificationChecks: 0,
      databaseRoundTrips: 0,
      staged: 0,
      quarantined: 0,
      wouldInsert: 0,
      insertChunkCount: 0,
      largestChunk: 0,
      schemaValidationFailures: 0,
      verificationDiagnostics: emptyDiagnostics,
      perSourceDiagnostics: {},
    };
  }

  const hostLimiter = new DomainConcurrencyLimiter(options.perHostConcurrency);
  const verified: Array<{
    candidate: TvGrowthCandidate;
    url: string;
    probe: Awaited<ReturnType<typeof probeTvStation>>;
  }> = [];

  await mapWithConcurrency(
    uniqueCandidates,
    options.verifyConcurrency,
    async (candidate) => {
      verificationChecks += 1;
      const result = await verifyCandidate(candidate, hostLimiter, diagnostics, perSourceDiagnostics);
      if (result.ok) {
        verified.push({
          candidate: result.candidate,
          url: result.url,
          probe: result.probe,
        });
      } else {
        rejected += 1;
      }
    }
  );

  const validRows: ReturnType<typeof buildInsertRow>[] = [];
  for (const row of verified) {
    const payload = buildInsertRow(row.candidate, row.probe, row.url, importOptions);
    if (!validateInsertRow(payload)) {
      schemaValidationFailures += 1;
      rejected += 1;
      continue;
    }
    validRows.push(payload);
  }

  const chunkCount =
    validRows.length === 0 ? 0 : Math.ceil(validRows.length / options.importBatchSize);
  let largestChunk = 0;
  for (let offset = 0; offset < validRows.length; offset += options.importBatchSize) {
    largestChunk = Math.max(
      largestChunk,
      Math.min(options.importBatchSize, validRows.length - offset)
    );
  }

  if (dryRun) {
    dedupeCache.registerAccepted(verified.map((row) => row.candidate));
    return {
      found: candidates.length,
      unique: uniqueCandidates.length,
      imported: 0,
      rejected,
      verificationChecks,
      databaseRoundTrips: 0,
      staged: uniqueCandidates.length,
      quarantined: Math.max(0, uniqueCandidates.length - validRows.length),
      wouldInsert: validRows.length,
      insertChunkCount: chunkCount,
      largestChunk,
      schemaValidationFailures,
      verificationDiagnostics: diagnostics.summary(),
      perSourceDiagnostics: summarizePerSourceDiagnostics(perSourceDiagnostics),
    };
  }

  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  guardDatabaseWrite(false, "bulkImportVerifiedCandidates");
  for (let offset = 0; offset < validRows.length; offset += options.importBatchSize) {
    const chunk = validRows.slice(offset, offset + options.importBatchSize);
    databaseRoundTrips += 1;
    const { error } = await supabaseAdmin.from("tv_videos").insert(chunk);
    if (error) {
      rejected += chunk.length;
    } else {
      imported += chunk.length;
      dedupeCache.registerAccepted(
        verified
          .slice(offset, offset + chunk.length)
          .map((row) => row.candidate)
      );
    }
  }

  return {
    found: candidates.length,
    unique: uniqueCandidates.length,
    imported,
    rejected,
    verificationChecks,
    databaseRoundTrips,
    staged: uniqueCandidates.length,
    quarantined: Math.max(0, uniqueCandidates.length - imported),
    wouldInsert: validRows.length,
    insertChunkCount: chunkCount,
    largestChunk,
    schemaValidationFailures,
    verificationDiagnostics: diagnostics.summary(),
    perSourceDiagnostics: summarizePerSourceDiagnostics(perSourceDiagnostics),
  };
}
