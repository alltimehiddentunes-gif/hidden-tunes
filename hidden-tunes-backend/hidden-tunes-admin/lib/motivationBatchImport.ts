import {
  createMotivationExpansionCheckpoint,
  isMotivationCheckpointItemCompleted,
  loadMotivationExpansionCheckpoint,
  markMotivationCheckpointItemCompleted,
  markMotivationCheckpointItemFailed,
  writeMotivationExpansionCheckpoint,
} from "@/lib/motivationExpansionCheckpoint";
import { buildArchiveMotivationCandidates } from "@/lib/motivationArchiveSource";
import {
  dedupeMotivationCandidatesBounded,
  loadMotivationDedupeKeysForCandidates,
} from "@/lib/motivationBoundedDedupe";
import {
  classifyMotivationContent,
  contentClassificationBlocksImport,
  type MotivationContentDecision,
} from "@/lib/motivationContentClassifier";
import {
  buildMotivationItemSlug,
  resolveMotivationCategorySlug,
} from "@/lib/motivationCatalog";
import {
  probeMotivationItem,
  type MotivationGrowthCandidate,
  type MotivationProbeResult,
} from "@/lib/motivationHealth";
import {
  normalizeMotivationMetadata,
  sanitizeMotivationDurationSeconds,
} from "@/lib/motivationMetadataNormalize";
import {
  mapCandidateToRegistrySource,
  verifyArchiveItemRights,
} from "@/lib/motivationItemRights";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanText } from "@/lib/tvCatalog";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";

export type MotivationBatchImportOptions = {
  batchNumber?: number;
  examineLimit?: number;
  dryRun?: boolean;
  queryFamily?: string;
  sourceRequestConcurrency?: number;
  writeChunkSize?: number;
  mediaValidationConcurrency?: number;
};

export type MotivationBatchImportResult = {
  success: boolean;
  dry_run: boolean;
  batch_number: number;
  candidates_fetched: number;
  records_examined: number;
  records_accepted: number;
  records_inserted: number;
  records_updated: number;
  records_skipped: number;
  records_rejected: number;
  rights_accepted: number;
  rights_rejected: number;
  rights_rejection_reasons: string[];
  metadata_accepted: number;
  metadata_rejected: number;
  media_verified: number;
  media_failed: number;
  proposed_item_inserts: number;
  proposed_item_updates: number;
  proposed_file_inserts: number;
  files_inserted: number;
  public_promotions: number;
  duplicate_records: number;
  dedupe_matches: number;
  classified_accept: number;
  classified_hold: number;
  classified_reject: number;
  classified_routed: number;
  sources_used: string[];
  checkpoint_id: string | null;
  errors: string[];
};

const DEFAULT_EXAMINE_LIMIT = 200;
const DEFAULT_WRITE_CHUNK = 100;
const DEFAULT_SOURCE_CONCURRENCY = 2;
const DEFAULT_MEDIA_CONCURRENCY = 2;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripMotivationQualityColumns(payload: Record<string, unknown>) {
  const next = { ...payload };
  delete next.content_classification;
  delete next.content_classification_reason;
  delete next.content_classification_confidence;
  delete next.normalized_title_hash;
  return next;
}

function isMissingMotivationQualityColumnError(message: string) {
  return /content_classification|normalized_title_hash|schema cache/i.test(message);
}

async function upsertMotivationItemRow(
  existingItemId: string | undefined,
  itemPayload: Record<string, unknown>
) {
  if (existingItemId) {
    let { error } = await supabaseAdmin
      .from("motivation_items")
      .update(itemPayload)
      .eq("id", existingItemId);
    if (error && isMissingMotivationQualityColumnError(error.message)) {
      ({ error } = await supabaseAdmin
        .from("motivation_items")
        .update(stripMotivationQualityColumns(itemPayload))
        .eq("id", existingItemId));
    }
    if (error) return { ok: false as const, error: error.message, itemId: existingItemId };
    return { ok: true as const, itemId: existingItemId, updated: true };
  }

  let { data, error } = await supabaseAdmin
    .from("motivation_items")
    .insert(itemPayload)
    .select("id")
    .single();
  if (error && isMissingMotivationQualityColumnError(error.message)) {
    ({ data, error } = await supabaseAdmin
      .from("motivation_items")
      .insert(stripMotivationQualityColumns(itemPayload))
      .select("id")
      .single());
  }
  if (error) return { ok: false as const, error: error.message, itemId: "" };
  if (!data?.id) return { ok: false as const, error: "Insert returned no item id.", itemId: "" };
  return { ok: true as const, itemId: String(data.id), updated: false };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => runWorker()));
  return results;
}

async function loadEnabledSources() {
  const { data, error } = await supabaseAdmin
    .from("motivation_source_registry")
    .select("source_key, source_name, source_type, rights_type, enabled, reviewed, redistribution_allowed, embedding_allowed")
    .eq("section", "motivation")
    .eq("enabled", true)
    .eq("reviewed", true);

  if (error) throw new Error(error.message);
  return data || [];
}

function normalizeCandidate(candidate: MotivationGrowthCandidate): MotivationGrowthCandidate {
  const normalized = normalizeMotivationMetadata({
    title: candidate.title,
    description: candidate.description,
    creator: candidate.creator_name || candidate.channel_name,
    speaker: candidate.speaker_name,
    channel: candidate.channel_name,
    tags: candidate.tags,
    subjects: candidate.subjects,
    language: candidate.language,
    country: candidate.region,
    fileNames: candidate.file_names,
  });

  const classification = classifyMotivationContent({
    title: normalized.title,
    description: normalized.description,
    subjects: normalized.subjects,
    tags: normalized.tags,
    creator: normalized.creator,
    speaker: normalized.speaker,
    channel: normalized.channel,
    collection: candidate.collection,
    provider: candidate.provider,
    sourceType: candidate.source_type,
    runtimeSeconds: candidate.duration_seconds,
    language: normalized.language,
    category: candidate.category,
    fileNames: normalized.fileNames,
  });

  return {
    ...candidate,
    title: normalized.title || candidate.title,
    description: normalized.description || candidate.description || null,
    creator_name: normalized.creator,
    channel_name: normalized.channel,
    speaker_name: normalized.speaker,
    tags: normalized.tags.length ? normalized.tags : candidate.tags,
    language: normalized.language || candidate.language,
    region: normalized.country || candidate.region,
    duration_seconds: sanitizeMotivationDurationSeconds(candidate.duration_seconds),
    content_classification: classification.decision,
    content_classification_reason: classification.reason,
    content_classification_confidence: Math.round(classification.confidence * 100),
    normalized_title_hash: normalized.titleHash,
  };
}

async function upsertCheckpoint(payload: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("motivation_import_checkpoints")
    .upsert(payload, { onConflict: "id" })
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

function mediaFilePayload(
  itemId: string,
  candidate: MotivationGrowthCandidate,
  probe: MotivationProbeResult
) {
  const sourceKey = `${candidate.source_key || `${candidate.source_type}:${candidate.source_id}`}:file:primary`;
  const isVideo = candidate.source_type === "archive_video" || candidate.source_type === "mp4_file";
  return {
    item_id: itemId,
    title: cleanText(candidate.title, 300),
    audio_url: isVideo ? null : candidate.source_url,
    video_url: isVideo ? candidate.source_url : null,
    media_type: isVideo ? "video" : "audio",
    mime_type: isVideo ? "video/mp4" : null,
    duration_seconds: candidate.duration_seconds ?? null,
    is_primary: true,
    playback_status: probe.playable ? "playable" : probe.playback_status,
    is_active: false,
    source_key: sourceKey,
  };
}

export async function runMotivationBatchImport(
  options: MotivationBatchImportOptions = {}
): Promise<MotivationBatchImportResult> {
  const batchNumber = Math.max(0, Number(options.batchNumber ?? 0));
  const examineLimit = Math.max(1, Math.min(250, Number(options.examineLimit ?? DEFAULT_EXAMINE_LIMIT)));
  const dryRun = options.dryRun === true;
  const writeChunkSize = Math.max(50, Math.min(200, Number(options.writeChunkSize ?? DEFAULT_WRITE_CHUNK)));
  const sourceConcurrency = Math.max(1, Math.min(4, Number(options.sourceRequestConcurrency ?? DEFAULT_SOURCE_CONCURRENCY)));
  const mediaConcurrency = Math.max(1, Math.min(4, Number(options.mediaValidationConcurrency ?? DEFAULT_MEDIA_CONCURRENCY)));

  const result: MotivationBatchImportResult = {
    success: false,
    dry_run: dryRun,
    batch_number: batchNumber,
    candidates_fetched: 0,
    records_examined: 0,
    records_accepted: 0,
    records_inserted: 0,
    records_updated: 0,
    records_skipped: 0,
    records_rejected: 0,
    rights_accepted: 0,
    rights_rejected: 0,
    rights_rejection_reasons: [],
    metadata_accepted: 0,
    metadata_rejected: 0,
    media_verified: 0,
    media_failed: 0,
    proposed_item_inserts: 0,
    proposed_item_updates: 0,
    proposed_file_inserts: 0,
    files_inserted: 0,
    public_promotions: 0,
    duplicate_records: 0,
    dedupe_matches: 0,
    classified_accept: 0,
    classified_hold: 0,
    classified_reject: 0,
    classified_routed: 0,
    sources_used: [],
    checkpoint_id: null,
    errors: [],
  };

  const registryRows = await loadEnabledSources();
  const registryKeys = registryRows.map((row) => String(row.source_key));
  result.sources_used = registryKeys;

  if (registryRows.length === 0) {
    result.errors.push("No reviewed and enabled Motivationals sources in registry.");
    return result;
  }

  let candidates: MotivationGrowthCandidate[] = [];
  const queryFamily = options.queryFamily || "speeches";
  const expansionSourceKey = `archive:expansion:${queryFamily}`;
  let expansionCheckpoint =
    loadMotivationExpansionCheckpoint(batchNumber, expansionSourceKey)?.checkpoint ||
    createMotivationExpansionCheckpoint({
      batch_number: batchNumber,
      source_key: expansionSourceKey,
    });
  const startPage = Math.max(1, Number(expansionCheckpoint.source_page || 0) + 1);
  const rowsPerPage = Math.max(20, Math.min(50, Math.ceil(examineLimit / 4)));
  const maxPagesPerQuery = Math.max(3, Math.ceil(examineLimit / rowsPerPage) + 1);

  try {
    const archiveResult = await buildArchiveMotivationCandidates({
      target: examineLimit,
      rowsPerPage,
      maxPagesPerQuery,
      startPage,
      concurrency: sourceConcurrency,
      queryFamily,
    });
    candidates = archiveResult.candidates;

    if (!dryRun && archiveResult.endPage >= startPage) {
      expansionCheckpoint.source_page = archiveResult.endPage;
      expansionCheckpoint.source_cursor = String(archiveResult.endPage + 1);
      expansionCheckpoint.updated_at = new Date().toISOString();
      writeMotivationExpansionCheckpoint(expansionCheckpoint);
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }

  result.candidates_fetched = candidates.length;
  result.records_examined = Math.min(candidates.length, examineLimit);

  const normalizedCandidates = candidates.map(normalizeCandidate);
  for (const candidate of normalizedCandidates) {
    const decision = candidate.content_classification || "hold";
    if (decision === "accept") result.classified_accept += 1;
    else if (decision === "hold") result.classified_hold += 1;
    else if (decision === "reject") result.classified_reject += 1;
    else result.classified_routed += 1;
  }

  const classifiableCandidates = normalizedCandidates.filter(
    (candidate) =>
      !contentClassificationBlocksImport(
        (candidate.content_classification || "hold") as MotivationContentDecision
      )
  );

  const existing = await loadMotivationDedupeKeysForCandidates(classifiableCandidates);
  const uniqueCandidates = dedupeMotivationCandidatesBounded(classifiableCandidates, existing).slice(
    0,
    examineLimit
  );
  result.dedupe_matches = Math.max(0, classifiableCandidates.length - uniqueCandidates.length);
  result.duplicate_records = result.dedupe_matches;
  result.records_skipped = result.dedupe_matches;
  result.records_rejected += normalizedCandidates.length - classifiableCandidates.length;

  const rightsChecked = await mapWithConcurrency(uniqueCandidates, sourceConcurrency, async (candidate) => {
    const registrySource = mapCandidateToRegistrySource(
      String(candidate.source_key || ""),
      registryKeys
    );
    if (!registrySource) {
      return {
        candidate,
        rightsOk: false,
        rightsReason: "Candidate not mapped to an enabled reviewed source registry entry.",
      };
    }

    if (candidate.source_type === "archive_video") {
      const rights = await verifyArchiveItemRights(candidate.source_id);
      return {
        candidate,
        rightsOk: rights.ok,
        rightsReason: rights.reason,
      };
    }

    return {
      candidate,
      rightsOk: false,
      rightsReason: "Unsupported source type for Batch 0.",
    };
  });

  const rightsAccepted: MotivationGrowthCandidate[] = [];
  for (const row of rightsChecked) {
    if (row.rightsOk) {
      result.rights_accepted += 1;
      rightsAccepted.push(row.candidate);
    } else {
      result.rights_rejected += 1;
      result.records_rejected += 1;
      if (result.rights_rejection_reasons.length < 20) {
        result.rights_rejection_reasons.push(
          `${row.candidate.source_id}: ${row.rightsReason}`
        );
      }
    }
  }

  const validated = await mapWithConcurrency(rightsAccepted, mediaConcurrency, async (candidate) => {
    if (!candidate.title?.trim()) {
      return { candidate, probe: null, urlError: "Missing title." };
    }

    const urlCheck = validatePublicTvUrl(candidate.source_url);
    if (!urlCheck.ok) {
      return { candidate, probe: null, urlError: urlCheck.reason };
    }

    const probe = await probeMotivationItem({
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      source_url: urlCheck.url,
      embed_url: candidate.embed_url || null,
    });

    return { candidate, probe, urlError: null as string | null };
  });

  const accepted: Array<{ candidate: MotivationGrowthCandidate; probe: MotivationProbeResult }> = [];

  for (const row of validated) {
    if (row.urlError) {
      result.records_rejected += 1;
      result.metadata_rejected += 1;
      continue;
    }
    result.metadata_accepted += 1;
    if (!row.probe?.playable) {
      result.records_rejected += 1;
      result.media_failed += 1;
      continue;
    }
    result.media_verified += 1;
    accepted.push({ candidate: row.candidate, probe: row.probe });
  }

  result.records_accepted = accepted.length;
  result.proposed_item_inserts = accepted.length;
  result.proposed_file_inserts = accepted.length;

  if (dryRun) {
    result.success = result.errors.length === 0;
    return result;
  }

  if (accepted.length === 0) {
    result.success = result.errors.length === 0;
    return result;
  }

  const checkpointId = crypto.randomUUID();
  result.checkpoint_id = checkpointId;
  const fileSourceKey = registryKeys[0] || "archive:batch0";
  let fileCheckpoint =
    loadMotivationExpansionCheckpoint(batchNumber, fileSourceKey)?.checkpoint ||
    createMotivationExpansionCheckpoint({
      batch_number: batchNumber,
      source_key: fileSourceKey,
    });

  await upsertCheckpoint({
    id: checkpointId,
    section: "motivation",
    source_key: registryKeys[0] || "archive:batch0",
    source_page: 0,
    batch_number: batchNumber,
    records_examined: result.records_examined,
    records_accepted: result.records_accepted,
    records_inserted: 0,
    records_updated: 0,
    records_skipped: result.records_skipped,
    records_rejected: result.records_rejected,
    files_inserted: 0,
    media_verified: result.media_verified,
    media_failed: result.media_failed,
    failure_count: 0,
    status: "running",
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  for (let offset = 0; offset < accepted.length; offset += writeChunkSize) {
    const chunk = accepted.slice(offset, offset + writeChunkSize);

    for (const entry of chunk) {
      const candidate = entry.candidate;
      const probe = entry.probe;
      const nowIso = new Date().toISOString();
      const categorySlug = resolveMotivationCategorySlug(candidate.category, candidate.subcategory);
      const sourceKey = candidate.source_key || `${candidate.source_type}:${candidate.source_id}`;

      if (isMotivationCheckpointItemCompleted(fileCheckpoint, sourceKey)) {
        result.records_skipped += 1;
        continue;
      }

      const { data: existingItem } = await supabaseAdmin
        .from("motivation_items")
        .select("id")
        .eq("source_key", sourceKey)
        .maybeSingle();

      const itemPayload = {
        source_type: candidate.source_type,
        source_id: candidate.source_id,
        source_url: candidate.source_url,
        embed_url: candidate.embed_url || null,
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
        duration_seconds: candidate.duration_seconds ?? null,
        source_key: sourceKey,
        content_classification: candidate.content_classification || "hold",
        content_classification_reason: candidate.content_classification_reason || null,
        content_classification_confidence: candidate.content_classification_confidence ?? null,
        normalized_title_hash: candidate.normalized_title_hash || null,
        status: "pending",
        playback_status: "unchecked",
        is_active: false,
        is_verified: false,
        is_featured: candidate.is_featured === true,
        reliability_score: 40,
        consecutive_failures: 0,
        quarantined_at: null,
        last_health_checked_at: nowIso,
        last_health_error: null,
        sort_order: candidate.sort_order ?? 0,
      };

      let itemId = existingItem?.id ? String(existingItem.id) : "";

      const upsert = await upsertMotivationItemRow(existingItem?.id ? String(existingItem.id) : undefined, itemPayload);
      if (!upsert.ok) {
        result.records_rejected += 1;
        result.errors.push(upsert.error);
        fileCheckpoint = markMotivationCheckpointItemFailed(fileCheckpoint, sourceKey);
        writeMotivationExpansionCheckpoint(fileCheckpoint);
        continue;
      }
      itemId = upsert.itemId;
      if (upsert.updated) result.records_updated += 1;
      else result.records_inserted += 1;

      const filePayload = mediaFilePayload(itemId, candidate, probe);
      const { data: existingFile } = await supabaseAdmin
        .from("motivation_files")
        .select("id")
        .eq("source_key", filePayload.source_key)
        .maybeSingle();

      if (existingFile?.id) {
        const { error: fileUpdateError } = await supabaseAdmin
          .from("motivation_files")
          .update(filePayload)
          .eq("id", existingFile.id);
        if (fileUpdateError) {
          result.errors.push(fileUpdateError.message);
          fileCheckpoint = markMotivationCheckpointItemFailed(fileCheckpoint, sourceKey);
          writeMotivationExpansionCheckpoint(fileCheckpoint);
          continue;
        }
      } else {
        const { error: fileError } = await supabaseAdmin
          .from("motivation_files")
          .insert(filePayload);
        if (fileError) {
          result.errors.push(fileError.message);
          fileCheckpoint = markMotivationCheckpointItemFailed(fileCheckpoint, sourceKey);
          writeMotivationExpansionCheckpoint(fileCheckpoint);
          continue;
        }
        result.files_inserted += 1;
      }

      fileCheckpoint = markMotivationCheckpointItemCompleted(fileCheckpoint, sourceKey);
      fileCheckpoint.records_inserted = result.records_inserted;
      fileCheckpoint.records_updated = result.records_updated;
      fileCheckpoint.files_inserted = result.files_inserted;
      fileCheckpoint.last_external_id = candidate.source_id;
      writeMotivationExpansionCheckpoint(fileCheckpoint);
    }

    await sleep(100);
  }

  fileCheckpoint.status = result.errors.length > 0 ? "failed" : "completed";
  fileCheckpoint.completed_at = new Date().toISOString();
  fileCheckpoint.updated_at = fileCheckpoint.completed_at;
  writeMotivationExpansionCheckpoint(fileCheckpoint);

  await upsertCheckpoint({
    id: checkpointId,
    section: "motivation",
    source_key: registryKeys[0] || "archive:batch0",
    source_page: 0,
    batch_number: batchNumber,
    records_examined: result.records_examined,
    records_accepted: result.records_accepted,
    records_inserted: result.records_inserted,
    records_updated: result.records_updated,
    records_skipped: result.records_skipped,
    records_rejected: result.records_rejected,
    files_inserted: result.files_inserted,
    media_verified: result.media_verified,
    media_failed: result.media_failed,
    failure_count: result.errors.length,
    status: result.errors.length > 0 ? "failed" : "completed",
    updated_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  result.success = result.errors.length === 0;
  return result;
}
