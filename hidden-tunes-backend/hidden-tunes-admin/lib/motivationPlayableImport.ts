import {
  buildMotivationItemSlug,
  MOTIVATION_TARGET_ITEMS,
  resolveMotivationCategorySlug,
} from "@/lib/motivationCatalog";
import {
  dedupeMotivationCandidatesBounded,
  loadMotivationDedupeKeysForCandidates,
} from "@/lib/motivationBoundedDedupe";
import { isObviouslyUnsupportedForPlayableIngestion } from "@/lib/motivationFastReject";
import type { MotivationGrowthCandidate } from "@/lib/motivationHealth";
import { verifyArchiveItemRights } from "@/lib/motivationItemRights";
import {
  normalizeMotivationMetadata,
  sanitizeMotivationDurationSeconds,
} from "@/lib/motivationMetadataNormalize";
import {
  loadMotivationPlayableCheckpoint,
  writeMotivationPlayableCheckpoint,
  type MotivationPlayableCheckpoint,
} from "@/lib/motivationPlayableCheckpoint";
import { countPlayableLegalPendingMotivationItems } from "@/lib/motivationPlayableCount";
import {
  mapWithConcurrency,
  probeDirectPlayableMedia,
  type PlayableMediaProbeResult,
} from "@/lib/motivationPlayableMedia";
import {
  buildArchiveMotivationCandidates,
} from "@/lib/motivationSources/archiveSource";
import { mapCandidateToRegistrySource } from "@/lib/motivationItemRights";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MotivationPlayableImportOptions = {
  queryFamily?: string;
  sourceLimit?: number;
  insertBatchSize?: number;
  probeConcurrency?: number;
  rightsConcurrency?: number;
  maxPages?: number;
  dryRun?: boolean;
  resume?: boolean;
  targetItems?: number;
  onProgress?: (event: MotivationPlayableProgressEvent) => void;
};

export type MotivationPlayableProgressEvent = {
  type: "page" | "write_batch" | "checkpoint" | "summary";
  family: string;
  page: number;
  page_candidates: number;
  total_discovered: number;
  media_resolved: number;
  media_verified: number;
  rights_passed: number;
  duplicates: number;
  pending_inserted: number;
  failures: number;
  elapsed_ms: number;
  records_per_minute: number;
  checkpoint_saved: boolean;
  message?: string;
};

export type MotivationPlayableImportReport = {
  generated_at: string;
  dry_run: boolean;
  query_family: string;
  candidates_discovered: number;
  direct_media_resolved: number;
  playback_probes_passed: number;
  rights_checks_passed: number;
  duplicates_skipped: number;
  pending_inserted: number;
  failed_media: number;
  failed_rights: number;
  unsupported_files: number;
  errors: string[];
  total_database_playable_candidates: number;
  gap_to_target: number;
  checkpoint: MotivationPlayableCheckpoint;
  public_promotions: number;
};

type PreparedCandidate = {
  candidate: MotivationGrowthCandidate;
  probe: PlayableMediaProbeResult;
  rightsLabel: string;
  licenseUrl: string | null;
  sourcePageUrl: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function elapsedMs(startedAt: number) {
  return Date.now() - startedAt;
}

function recordsPerMinute(count: number, elapsed: number) {
  if (elapsed <= 0) return 0;
  return Math.round((count / elapsed) * 60_000);
}

function emitProgress(
  options: MotivationPlayableImportOptions,
  event: MotivationPlayableProgressEvent
) {
  const line = JSON.stringify({
    motivation_playable_import: true,
    ...event,
  });
  console.error(line);
  options.onProgress?.(event);
}

function growthCandidateFromArchive(
  growth: MotivationGrowthCandidate,
  queryFamily: string
): MotivationGrowthCandidate {
  return {
    ...growth,
    source_key: growth.source_key || `archive:${growth.source_id}`,
    tags: [...(growth.tags || []), queryFamily],
  };
}

function stripOptionalPlayableColumns(payload: Record<string, unknown>) {
  const next = { ...payload };
  for (const key of [
    "source_page_url",
    "license_url",
    "media_mime_type",
    "media_size_bytes",
    "probe_timestamp",
    "query_family",
  ]) {
    delete next[key];
  }
  return next;
}

async function upsertPlayableItem(
  prepared: PreparedCandidate,
  queryFamily: string
) {
  const candidate = prepared.candidate;
  const probe = prepared.probe;
  const nowIso = probe.probed_at;
  const categorySlug = resolveMotivationCategorySlug(candidate.category, candidate.subcategory);
  const sourceKey = candidate.source_key || `${candidate.source_type}:${candidate.source_id}`;
  const sourcePageUrl = prepared.sourcePageUrl;

  const itemPayload: Record<string, unknown> = {
    source_type: candidate.source_type,
    source_id: candidate.source_id,
    source_url: probe.probed_url,
    embed_url: candidate.embed_url || `https://archive.org/embed/${encodeURIComponent(candidate.source_id)}`,
    slug: buildMotivationItemSlug(candidate.title, candidate.source_id),
    title: candidate.title,
    description: candidate.description || null,
    thumbnail_url: candidate.thumbnail_url || null,
    channel_name: candidate.channel_name || null,
    speaker_name: candidate.speaker_name || null,
    creator_name: candidate.creator_name || null,
    category: candidate.category || "Motivation",
    subcategory: candidate.subcategory || null,
    category_slug: categorySlug,
    categories: [categorySlug],
    tags: candidate.tags?.length ? candidate.tags : ["Motivation"],
    language: candidate.language || null,
    region: candidate.region || null,
    duration_seconds: sanitizeMotivationDurationSeconds(candidate.duration_seconds),
    source_key: sourceKey,
    rights: prepared.rightsLabel,
    source_page_url: sourcePageUrl,
    license_url: prepared.licenseUrl,
    media_mime_type: probe.mime_type,
    media_size_bytes: probe.media_size_bytes,
    probe_timestamp: nowIso,
    query_family: queryFamily,
    content_classification: "hold",
    content_classification_reason: "Awaiting post-import classification job.",
    content_classification_confidence: null,
    rights_status: "passed",
    media_probe_status: "passed",
    health_status: "unchecked",
    duplicate_status: "none",
    status: "pending",
    playback_status: "playable",
    is_active: false,
    is_verified: false,
    is_featured: false,
    reliability_score: 50,
    consecutive_failures: 0,
    quarantined_at: null,
    last_health_checked_at: nowIso,
    last_health_error: null,
    sort_order: 0,
  };

  const { data: existingItem } = await supabaseAdmin
    .from("motivation_items")
    .select("id")
    .eq("source_key", sourceKey)
    .maybeSingle();

  let itemId = existingItem?.id ? String(existingItem.id) : "";
  let inserted = false;

  if (existingItem?.id) {
    let { error } = await supabaseAdmin
      .from("motivation_items")
      .update(itemPayload)
      .eq("id", existingItem.id);
    if (error?.message?.includes("Could not find")) {
      ({ error } = await supabaseAdmin
        .from("motivation_items")
        .update(stripOptionalPlayableColumns(itemPayload))
        .eq("id", existingItem.id));
    }
    if (error) throw new Error(error.message);
    itemId = String(existingItem.id);
  } else {
    let { data, error } = await supabaseAdmin
      .from("motivation_items")
      .insert(itemPayload)
      .select("id")
      .single();
    if (error?.message?.includes("Could not find")) {
      ({ data, error } = await supabaseAdmin
        .from("motivation_items")
        .insert(stripOptionalPlayableColumns(itemPayload))
        .select("id")
        .single());
    }
    if (error) throw new Error(error.message);
    itemId = String(data?.id || "");
    inserted = true;
  }

  const isAudio = probe.media_kind === "audio";
  const filePayload: Record<string, unknown> = {
    item_id: itemId,
    title: candidate.title,
    audio_url: isAudio ? probe.probed_url : null,
    video_url: !isAudio ? probe.probed_url : null,
    media_type: probe.media_kind === "stream" ? "stream" : isAudio ? "audio" : "video",
    mime_type: probe.mime_type,
    media_size_bytes: probe.media_size_bytes,
    duration_seconds: sanitizeMotivationDurationSeconds(candidate.duration_seconds),
    is_primary: true,
    playback_status: "playable",
    is_active: false,
    source_key: `${sourceKey}:file:primary`,
  };

  const { data: existingFile } = await supabaseAdmin
    .from("motivation_files")
    .select("id")
    .eq("source_key", filePayload.source_key)
    .maybeSingle();

  if (existingFile?.id) {
    let { error } = await supabaseAdmin.from("motivation_files").update(filePayload).eq("id", existingFile.id);
    if (error?.message?.includes("Could not find")) {
      const fallback = { ...filePayload };
      delete fallback.media_size_bytes;
      ({ error } = await supabaseAdmin.from("motivation_files").update(fallback).eq("id", existingFile.id));
    }
    if (error) throw new Error(error.message);
  } else {
    let { error } = await supabaseAdmin.from("motivation_files").insert(filePayload);
    if (error?.message?.includes("Could not find")) {
      const fallback = { ...filePayload };
      delete fallback.media_size_bytes;
      ({ error } = await supabaseAdmin.from("motivation_files").insert(fallback));
    }
    if (error) throw new Error(error.message);
  }

  return { inserted, itemId };
}

async function loadEnabledRegistryKeys() {
  const { data, error } = await supabaseAdmin
    .from("motivation_source_registry")
    .select("source_key")
    .eq("section", "motivation")
    .eq("enabled", true)
    .eq("reviewed", true);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => String(row.source_key));
}

export async function runMotivationPlayableImport(
  options: MotivationPlayableImportOptions = {}
): Promise<MotivationPlayableImportReport> {
  const startedAt = Date.now();
  const queryFamily = options.queryFamily || "speeches";
  const sourceLimit = Math.max(100, Math.min(2000, Number(options.sourceLimit ?? 1000)));
  const insertBatchSize = Math.max(100, Math.min(500, Number(options.insertBatchSize ?? 200)));
  const probeConcurrency = Math.max(1, Math.min(12, Number(options.probeConcurrency ?? 6)));
  const rightsConcurrency = Math.max(1, Math.min(8, Number(options.rightsConcurrency ?? 4)));
  const maxPages = Math.max(1, Math.min(20, Number(options.maxPages ?? 5)));
  const dryRun = options.dryRun !== false;
  const resume = options.resume !== false;
  const targetItems = Math.max(100, Number(options.targetItems ?? MOTIVATION_TARGET_ITEMS));

  const checkpoint = resume
    ? loadMotivationPlayableCheckpoint(queryFamily)
    : loadMotivationPlayableCheckpoint(queryFamily);
  const startPage = Math.max(1, Number(checkpoint.source_page || 0) + 1);

  const report: MotivationPlayableImportReport = {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    query_family: queryFamily,
    candidates_discovered: 0,
    direct_media_resolved: 0,
    playback_probes_passed: 0,
    rights_checks_passed: 0,
    duplicates_skipped: 0,
    pending_inserted: 0,
    failed_media: 0,
    failed_rights: 0,
    unsupported_files: 0,
    errors: [],
    total_database_playable_candidates: 0,
    gap_to_target: targetItems,
    checkpoint,
    public_promotions: 0,
  };

  const registryKeys = await loadEnabledRegistryKeys();
  if (registryKeys.length === 0) {
    report.errors.push("No reviewed and enabled Motivationals sources in registry.");
    return report;
  }

  const archiveResult = await buildArchiveMotivationCandidates({
    target: sourceLimit,
    rowsPerPage: Math.min(200, sourceLimit),
    maxPagesPerQuery: maxPages,
    startPage,
    concurrency: 4,
    queryFamily,
  });

  const pageCandidates = archiveResult.candidates;
  report.candidates_discovered = pageCandidates.length;
  checkpoint.totals.candidates_discovered += pageCandidates.length;
  checkpoint.source_page = archiveResult.endPage;
  checkpoint.source_cursor = String(archiveResult.endPage + 1);
  checkpoint.last_identifier =
    pageCandidates[pageCandidates.length - 1]?.source_id || checkpoint.last_identifier;

  emitProgress(options, {
    type: "page",
    family: queryFamily,
    page: archiveResult.endPage,
    page_candidates: pageCandidates.length,
    total_discovered: report.candidates_discovered,
    media_resolved: 0,
    media_verified: 0,
    rights_passed: 0,
    duplicates: 0,
    pending_inserted: 0,
    failures: 0,
    elapsed_ms: elapsedMs(startedAt),
    records_per_minute: 0,
    checkpoint_saved: false,
    message: `Discovered ${pageCandidates.length} archive candidates from page ${archiveResult.startPage}-${archiveResult.endPage}`,
  });

  const growthCandidates: MotivationGrowthCandidate[] = [];
  for (const raw of pageCandidates) {
    const growth = growthCandidateFromArchive(raw, queryFamily);
    report.direct_media_resolved += 1;
    checkpoint.totals.direct_media_resolved += 1;

    const normalized = normalizeMotivationMetadata({
      title: growth.title,
      description: growth.description,
      creator: growth.creator_name || growth.channel_name,
      language: growth.language,
      subjects: growth.subjects,
      fileNames: growth.file_names,
    });

    const obvious = isObviouslyUnsupportedForPlayableIngestion({
      title: normalized.title || growth.title,
      sourceUrl: growth.source_url,
      sourceId: growth.source_id,
      fileNames: growth.file_names,
    });
    if (obvious.blocked) {
      report.unsupported_files += 1;
      checkpoint.totals.unsupported_files += 1;
      continue;
    }

    const registrySource = mapCandidateToRegistrySource(String(growth.source_key || ""), registryKeys);
    if (!registrySource) {
      report.failed_rights += 1;
      checkpoint.totals.failed_rights += 1;
      continue;
    }

    growthCandidates.push({
      ...growth,
      title: normalized.title || growth.title,
      description: normalized.description || growth.description,
      language: normalized.language || growth.language,
      tags: normalized.tags.length ? normalized.tags : growth.tags,
    });
  }

  const existing = await loadMotivationDedupeKeysForCandidates(growthCandidates);
  const unique = dedupeMotivationCandidatesBounded(growthCandidates, existing);
  report.duplicates_skipped = Math.max(0, growthCandidates.length - unique.length);
  checkpoint.totals.duplicates_skipped += report.duplicates_skipped;

  const rightsResults = await mapWithConcurrency(unique, rightsConcurrency, async (candidate) => {
    try {
      const rights = await verifyArchiveItemRights(candidate.source_id);
      if (!rights.ok) {
        return { ok: false as const, candidate, reason: rights.reason };
      }
      return {
        ok: true as const,
        candidate,
        rightsLabel: rights.rights_label || "public_domain",
        licenseUrl: rights.license_url,
      };
    } catch (error) {
      return {
        ok: false as const,
        candidate,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const rightsPassed = rightsResults.filter(
    (result): result is Extract<(typeof rightsResults)[number], { ok: true }> => result.ok
  );
  for (const result of rightsResults) {
    if (!result.ok) {
      report.failed_rights += 1;
      checkpoint.totals.failed_rights += 1;
    }
  }
  report.rights_checks_passed = rightsPassed.length;
  checkpoint.totals.rights_checks_passed += rightsPassed.length;

  const probeResults = await mapWithConcurrency(rightsPassed, probeConcurrency, async (result) => {
    const probe = await probeDirectPlayableMedia(result.candidate.source_url, {
      retryLimit: 2,
      responseTimeoutMs: 15_000,
      redirectLimit: 3,
    });
    return { ...result, probe };
  });

  const rightsAccepted: PreparedCandidate[] = [];
  for (const result of probeResults) {
    if (!result.probe.playable) {
      report.failed_media += 1;
      checkpoint.totals.failed_media += 1;
      continue;
    }
    report.playback_probes_passed += 1;
    checkpoint.totals.playback_probes_passed += 1;
    rightsAccepted.push({
      candidate: result.candidate,
      probe: result.probe,
      rightsLabel: result.rightsLabel,
      licenseUrl: result.licenseUrl,
      sourcePageUrl: `https://archive.org/details/${encodeURIComponent(result.candidate.source_id)}`,
    });
  }

  if (!dryRun) {
    for (let offset = 0; offset < rightsAccepted.length; offset += insertBatchSize) {
      const chunk = rightsAccepted.slice(offset, offset + insertBatchSize);
      let batchInserted = 0;
      for (const prepared of chunk) {
        try {
          const result = await upsertPlayableItem(prepared, queryFamily);
          if (result.inserted) {
            batchInserted += 1;
            report.pending_inserted += 1;
            checkpoint.totals.pending_inserted += 1;
          }
        } catch (error) {
          report.errors.push(error instanceof Error ? error.message : String(error));
          checkpoint.totals.errors += 1;
        }
      }

      emitProgress(options, {
        type: "write_batch",
        family: queryFamily,
        page: checkpoint.source_page,
        page_candidates: pageCandidates.length,
        total_discovered: report.candidates_discovered,
        media_resolved: report.direct_media_resolved,
        media_verified: report.playback_probes_passed,
        rights_passed: report.rights_checks_passed,
        duplicates: report.duplicates_skipped,
        pending_inserted: report.pending_inserted,
        failures: report.failed_media + report.failed_rights + report.unsupported_files,
        elapsed_ms: elapsedMs(startedAt),
        records_per_minute: recordsPerMinute(report.pending_inserted, elapsedMs(startedAt)),
        checkpoint_saved: false,
        message: `Write batch inserted ${batchInserted} pending records`,
      });
      await sleep(50);
    }
  } else {
    report.pending_inserted = rightsAccepted.length;
  }

  if (!dryRun) {
    writeMotivationPlayableCheckpoint(checkpoint);
  }

  const count = await countPlayableLegalPendingMotivationItems(targetItems);
  report.total_database_playable_candidates = count.total_playable_legal_pending;
  report.gap_to_target = count.gap_to_target;
  report.checkpoint = checkpoint;

  emitProgress(options, {
    type: "checkpoint",
    family: queryFamily,
    page: checkpoint.source_page,
    page_candidates: pageCandidates.length,
    total_discovered: report.candidates_discovered,
    media_resolved: report.direct_media_resolved,
    media_verified: report.playback_probes_passed,
    rights_passed: report.rights_checks_passed,
    duplicates: report.duplicates_skipped,
    pending_inserted: report.pending_inserted,
    failures: report.failed_media + report.failed_rights + report.unsupported_files,
    elapsed_ms: elapsedMs(startedAt),
    records_per_minute: recordsPerMinute(report.pending_inserted, elapsedMs(startedAt)),
    checkpoint_saved: !dryRun,
    message: dryRun ? "Dry-run checkpoint not saved" : "Checkpoint saved",
  });

  emitProgress(options, {
    type: "summary",
    family: queryFamily,
    page: checkpoint.source_page,
    page_candidates: pageCandidates.length,
    total_discovered: report.candidates_discovered,
    media_resolved: report.direct_media_resolved,
    media_verified: report.playback_probes_passed,
    rights_passed: report.rights_checks_passed,
    duplicates: report.duplicates_skipped,
    pending_inserted: report.pending_inserted,
    failures: report.failed_media + report.failed_rights + report.unsupported_files,
    elapsed_ms: elapsedMs(startedAt),
    records_per_minute: recordsPerMinute(report.pending_inserted, elapsedMs(startedAt)),
    checkpoint_saved: !dryRun,
    message: `Database playable pending total=${count.total_playable_legal_pending} gap=${count.gap_to_target}`,
  });

  return report;
}
