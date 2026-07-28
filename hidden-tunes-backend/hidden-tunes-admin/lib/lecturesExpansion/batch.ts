import { runLecturePlayableImport } from "@/lib/lecturePlayableImport";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  LECTURE_EXPANSION_DEFAULT_BATCH_SIZE,
  LECTURE_EXPANSION_DEFAULT_REQUEST_TIMEOUT_MS,
  LECTURE_EXPANSION_DEFAULT_VALIDATION_CONCURRENCY,
} from "@/lib/lecturesExpansion/constants";
import { getLectureExpansionCounts } from "@/lib/lecturesExpansion/status";
import type { LectureSourceDefinition } from "@/lib/lecturesExpansion/sourceRegistry";

export type LectureExpansionBatchOptions = {
  source: LectureSourceDefinition;
  query_family: string;
  batch_size?: number;
  dry_run?: boolean;
  resume?: boolean;
  probe_concurrency?: number;
  request_timeout_ms?: number;
};

export type LectureExpansionBatchReport = {
  generated_at: string;
  batch_number: number;
  source_key: string;
  query_family: string;
  region: string;
  wave: number;
  dry_run: boolean;
  discovered: number;
  normalized: number;
  duplicates: number;
  rejected: number;
  validated_playable: number;
  imported_programs: number;
  imported_items: number;
  promoted_programs: number;
  promoted_items: number;
  audio_total: number;
  video_total: number;
  current_public_programs: number;
  current_public_playable_items: number;
  gap_programs: number;
  gap_playable_items: number;
  elapsed_ms: number;
  items_per_second: number;
  source_exhausted: boolean;
  page_empty: boolean;
  status: "completed" | "failed" | "skipped";
  error?: string;
};

export async function runLectureExpansionBatch(
  options: LectureExpansionBatchOptions,
  batchNumber: number
): Promise<LectureExpansionBatchReport> {
  const started = Date.now();
  const batchSize = options.batch_size || LECTURE_EXPANSION_DEFAULT_BATCH_SIZE;

  const countsBefore = await getLectureExpansionCounts({ light: true });
  if (countsBefore.gap_programs <= 0 && countsBefore.gap_playable_items <= 0) {
    return {
      generated_at: new Date().toISOString(),
      batch_number: batchNumber,
      source_key: options.source.source_key,
      query_family: options.query_family,
      region: options.source.region,
      wave: options.source.wave,
      dry_run: Boolean(options.dry_run),
      discovered: 0,
      normalized: 0,
      duplicates: 0,
      rejected: 0,
      validated_playable: 0,
      imported_programs: 0,
      imported_items: 0,
      promoted_programs: 0,
      promoted_items: 0,
      audio_total: countsBefore.audio_items,
      video_total: countsBefore.video_items,
      current_public_programs: countsBefore.public_programs,
      current_public_playable_items: countsBefore.public_playable_items,
      gap_programs: countsBefore.gap_programs,
      gap_playable_items: countsBefore.gap_playable_items,
      elapsed_ms: Date.now() - started,
      items_per_second: 0,
      source_exhausted: false,
      page_empty: false,
      status: "skipped",
    };
  }

  try {
    const result = await runLecturePlayableImport({
      applyWrites: options.dry_run ? false : true,
      resume: options.resume !== false,
      targetItems: countsBefore.public_programs + countsBefore.gap_programs,
      sourceLimit: Math.min(200, Math.max(50, batchSize)),
      insertBatchSize: Math.min(250, batchSize),
      probeConcurrency: options.probe_concurrency || LECTURE_EXPANSION_DEFAULT_VALIDATION_CONCURRENCY,
      metadataConcurrency: Math.min(12, Math.max(4, Math.floor((options.probe_concurrency || 20) / 3))),
      // Multiple Archive pages per batch — required for 25k-scale throughput without giant transactions.
      maxPages: 3,
      rounds: 1,
      requestTimeoutMs: options.request_timeout_ms || LECTURE_EXPANSION_DEFAULT_REQUEST_TIMEOUT_MS,
      sourceFamilies: [options.source.source_key.startsWith("internet_archive") ? "internet_archive_public_domain" : options.source.source_key],
      subjectFamilies: [options.query_family],
      regionHint: options.source.region,
    });

    const summary = result.summary;
    const pages = (summary.pages || []) as Array<Record<string, unknown>>;
    const pageEmpty =
      pages.length > 0 && pages.every((entry) => Number(entry.pageCandidates || 0) === 0);
    let countsAfter = countsBefore;
    try {
      countsAfter = await getLectureExpansionCounts({ light: true });
    } catch {
      countsAfter = {
        ...countsBefore,
        public_programs:
          countsBefore.public_programs +
          Number(summary.programsInserted || 0) +
          Number(summary.programsUpdated || 0),
        public_playable_items:
          countsBefore.public_playable_items +
          Number(summary.lessonsFilesInserted || 0),
        gap_programs: Math.max(
          0,
          countsBefore.gap_programs - Number(summary.programsInserted || 0)
        ),
        gap_playable_items: Math.max(
          0,
          countsBefore.gap_playable_items - Number(summary.lessonsFilesInserted || 0)
        ),
      };
    }
    const elapsed = Date.now() - started;
    const importedItems = Number(summary.lessonsFilesInserted || 0) + Number(summary.lessonsFilesUpdated || 0);

    if (!options.dry_run) {
      await supabaseAdmin
        .from("lecture_sources")
        .update({
          last_success_at: new Date().toISOString(),
          consecutive_failures: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("source_key", options.source.source_key);
    }

    return {
      generated_at: new Date().toISOString(),
      batch_number: batchNumber,
      source_key: options.source.source_key,
      query_family: options.query_family,
      region: options.source.region,
      wave: options.source.wave,
      dry_run: Boolean(options.dry_run),
      discovered: Number(summary.discovered || 0),
      normalized: Number(summary.directMediaResolved || 0),
      duplicates: Number(summary.duplicatesSkipped || 0),
      rejected: Number(summary.failedRights || 0) + Number(summary.failedMedia || 0) + Number(summary.unsupportedFiles || 0),
      validated_playable: Number(summary.probePassed || 0),
      imported_programs: Number(summary.programsInserted || 0) + Number(summary.programsUpdated || 0),
      imported_items: importedItems,
      promoted_programs: Number(summary.programsPublished || 0),
      promoted_items: importedItems,
      audio_total: countsAfter.audio_items,
      video_total: countsAfter.video_items,
      current_public_programs: countsAfter.public_programs,
      current_public_playable_items: countsAfter.public_playable_items,
      gap_programs: countsAfter.gap_programs,
      gap_playable_items: countsAfter.gap_playable_items,
      elapsed_ms: elapsed,
      items_per_second: elapsed > 0 ? Number(((importedItems / elapsed) * 1000).toFixed(2)) : 0,
      source_exhausted: pageEmpty,
      page_empty: pageEmpty,
      status: "completed",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!options.dry_run) {
      await supabaseAdmin
        .from("lecture_sources")
        .update({
          last_failure_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("source_key", options.source.source_key);
    }
    let countsAfter = countsBefore;
    try {
      countsAfter = await getLectureExpansionCounts({ light: true });
    } catch {
      countsAfter = countsBefore;
    }
    return {
      generated_at: new Date().toISOString(),
      batch_number: batchNumber,
      source_key: options.source.source_key,
      query_family: options.query_family,
      region: options.source.region,
      wave: options.source.wave,
      dry_run: Boolean(options.dry_run),
      discovered: 0,
      normalized: 0,
      duplicates: 0,
      rejected: 0,
      validated_playable: 0,
      imported_programs: 0,
      imported_items: 0,
      promoted_programs: 0,
      promoted_items: 0,
      audio_total: countsAfter.audio_items,
      video_total: countsAfter.video_items,
      current_public_programs: countsAfter.public_programs,
      current_public_playable_items: countsAfter.public_playable_items,
      gap_programs: countsAfter.gap_programs,
      gap_playable_items: countsAfter.gap_playable_items,
      elapsed_ms: Date.now() - started,
      items_per_second: 0,
      source_exhausted: false,
      page_empty: false,
      status: "failed",
      error: message,
    };
  }
}
