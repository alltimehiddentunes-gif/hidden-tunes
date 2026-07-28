import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildEditionDedupKey,
  buildWorkDedupKey,
  normalizeAudiobookTitleKey,
} from "@/lib/audiobookDedup";
import { classifyMatureAudiobookCandidate } from "@/lib/audiobookMature/classifier";
import { verifyAudiobookEditionSampleChapters } from "@/lib/audiobookPlayabilityCheck";
import {
  pickExistingColumns,
  tableExists,
} from "@/lib/audiobookSources/schemaCompat";
import type { NormalizedAudiobookCandidate } from "@/lib/audiobookSources/types";
import { cleanText } from "@/lib/tvCatalog";

function slugify(value: string, fallback = "audiobook") {
  const cleaned = normalizeAudiobookTitleKey(value) || fallback;
  return cleaned.slice(0, 180) || fallback;
}

async function findOrCreateWork(candidate: NormalizedAudiobookCandidate) {
  if (!(await tableExists("audiobook_works"))) return null;

  const workKey = buildWorkDedupKey({
    title: candidate.title,
    author: candidate.authorName,
    language: candidate.language,
  });

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("audiobook_works")
    .select("id")
    .eq("normalized_title", normalizeAudiobookTitleKey(candidate.title))
    .eq("primary_author_name", candidate.authorName || "")
    .eq("original_language", candidate.language || "")
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id as string;

  const payload = await pickExistingColumns("audiobook_works", {
    canonical_title: candidate.title,
    normalized_title: normalizeAudiobookTitleKey(candidate.title),
    original_title: candidate.title,
    primary_author_name: candidate.authorName,
    description: candidate.description,
    subjects: candidate.categories,
    genres: candidate.genres || candidate.categories,
    original_language: candidate.language,
    publication_year: candidate.publicationYear || null,
    public_domain_status: candidate.licenseType,
    work_identifier: workKey,
  });

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("audiobook_works")
    .insert(payload)
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted.id as string;
}

async function recordRejectedCandidate(input: {
  sourceType: string;
  sourceId: string;
  sourceKey?: string;
  title?: string;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  if (!(await tableExists("audiobook_rejected_candidates"))) return;
  await supabaseAdmin.from("audiobook_rejected_candidates").insert({
    source_type: input.sourceType,
    source_id: input.sourceId,
    source_key: input.sourceKey || null,
    title: input.title || null,
    reason: input.reason,
    metadata: input.metadata || {},
  });
}

async function updateThenInsertByColumn(
  table: string,
  matchColumn: string,
  matchValue: string,
  payload: Record<string, unknown>
) {
  const safePayload = await pickExistingColumns(table, payload);
  const { data: existing, error: selectError } = await supabaseAdmin
    .from(table)
    .select("id")
    .eq(matchColumn, matchValue)
    .limit(1);

  if (selectError) throw selectError;

  if (existing && existing.length > 0) {
    const { error: updateError } = await supabaseAdmin
      .from(table)
      .update(safePayload)
      .eq(matchColumn, matchValue);
    if (updateError) throw updateError;
    return existing[0] as { id: string };
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from(table)
    .insert(safePayload)
    .select("id")
    .single();
  if (insertError) throw insertError;
  return inserted as { id: string };
}

export async function importNormalizedAudiobookCandidate(
  candidate: NormalizedAudiobookCandidate,
  options: {
    dryRun?: boolean;
    verifyPlayback?: boolean;
    forceMature?: boolean;
  } = {}
) {
  const isMature = options.forceMature === true || candidate.isMature === true;

  if (isMature) {
    const classification = classifyMatureAudiobookCandidate({
      title: candidate.title,
      description: candidate.description,
      categories: candidate.categories,
      subjects: candidate.genres,
      rightsEvidence: candidate.rightsEvidence,
      sourceIsMatureLane: true,
    });
    if (!classification.accept) {
      if (!options.dryRun) {
        await recordRejectedCandidate({
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          sourceKey: candidate.sourceKey,
          title: candidate.title,
          reason: classification.classification,
          metadata: {
            reason: classification.reason,
            evidence: classification.evidence,
          },
        });
      }
      return {
        accepted: false,
        inserted: false,
        updated: false,
        skipped: false,
        reason: classification.classification,
        chaptersInserted: 0,
      };
    }
  }

  if (!candidate.chapters.length) {
    return {
      accepted: false,
      inserted: false,
      updated: false,
      skipped: false,
      reason: "invalid_chapter_structure",
      chaptersInserted: 0,
    };
  }

  const editionKey = buildEditionDedupKey({
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    narrator: candidate.narratorName,
    language: candidate.language,
  });

  const { data: existingEdition, error: existingEditionError } = await supabaseAdmin
    .from("audiobooks")
    .select("id, is_mature")
    .eq("source_key", editionKey)
    .maybeSingle();

  if (existingEditionError) throw existingEditionError;

  // Keep catalogs separated: never flip lanes on an existing edition.
  if (existingEdition?.id && Boolean(existingEdition.is_mature) !== isMature) {
    return {
      accepted: false,
      inserted: false,
      updated: false,
      skipped: true,
      reason: "cross_catalog_collision",
      chaptersInserted: 0,
    };
  }

  if (options.verifyPlayback !== false) {
    const verification = await verifyAudiobookEditionSampleChapters(
      candidate.chapters.map((chapter) => chapter.audioUrl)
    );
    if (!verification.ok) {
      if (!options.dryRun) {
        await recordRejectedCandidate({
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          sourceKey: candidate.sourceKey,
          title: candidate.title,
          reason: verification.reason || "playback_verification_failed",
        });
      }
      return {
        accepted: false,
        inserted: false,
        updated: false,
        skipped: false,
        reason: verification.reason || "playback_verification_failed",
        chaptersInserted: 0,
      };
    }
  }

  if (options.dryRun) {
    return {
      accepted: true,
      inserted: !existingEdition?.id,
      updated: Boolean(existingEdition?.id),
      skipped: false,
      reason: null,
      chaptersInserted: candidate.chapters.length,
    };
  }

  const workId = await findOrCreateWork(candidate);
  const slug = `${slugify(candidate.title)}-${candidate.sourceId.slice(0, 12)}`;
  const normalizedTitleAuthor = `${normalizeAudiobookTitleKey(candidate.title)}-${normalizeAudiobookTitleKey(candidate.authorName || "unknown")}`;

  const editionPayload = await pickExistingColumns("audiobooks", {
    work_id: workId,
    slug,
    title: candidate.title,
    subtitle: candidate.subtitle || null,
    description: candidate.description,
    cover_url: candidate.coverUrl,
    author_name: candidate.authorName,
    narrator_name: candidate.narratorName,
    category_slug: isMature ? "mature" : candidate.categorySlug,
    categories: isMature
      ? Array.from(new Set(["mature", ...candidate.categories]))
      : candidate.categories,
    language: candidate.language,
    country: candidate.country || null,
    publisher: candidate.publisher,
    source_type: candidate.sourceType,
    source_id: candidate.sourceId,
    source_url: candidate.sourceUrl,
    source_key: editionKey,
    source: candidate.sourceType,
    normalized_title_author: normalizedTitleAuthor,
    rights: candidate.rightsEvidence,
    rights_evidence: candidate.rightsEvidence,
    license_type: candidate.licenseType,
    license_url: candidate.licenseUrl,
    duration_seconds: candidate.durationSeconds,
    chapter_count: candidate.chapters.length,
    completeness: candidate.completeness,
    is_complete: candidate.isComplete,
    is_public: true,
    is_playable: true,
    edition_type: "audiobook",
    recording_type: "spoken_word",
    abridgement_status: "unabridged",
    quality_state: "legacy",
    health_state: "verified_sample",
    status: "approved",
    playback_status: "playable",
    is_active: true,
    is_verified: false,
    is_mature: isMature,
    published_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
  });

  let editionId = existingEdition?.id as string | undefined;
  if (editionId) {
    const { error } = await supabaseAdmin
      .from("audiobooks")
      .update(editionPayload)
      .eq("id", editionId);
    if (error) throw error;
  } else {
    const { data: inserted, error } = await supabaseAdmin
      .from("audiobooks")
      .insert(editionPayload)
      .select("id")
      .single();
    if (error) throw error;
    editionId = inserted.id as string;
  }

  let chaptersInserted = 0;
  for (const chapter of candidate.chapters) {
    const chapterSourceKey = `${editionKey}:chapter:${chapter.sourceFileId}`;
    const chapterPayload = {
      audiobook_id: editionId,
      title: cleanText(chapter.title, 300) || `Chapter ${chapter.chapterNumber}`,
      description: "",
      chapter_number: chapter.chapterNumber,
      sequence_number: chapter.sequenceNumber,
      normalized_title: normalizeAudiobookTitleKey(chapter.title),
      duration_seconds: chapter.durationSeconds,
      source_file_id: chapter.sourceFileId,
      source_format: chapter.format,
      mime_type: chapter.mimeType,
      canonical_media_reference: chapter.audioUrl,
      audio_url: chapter.audioUrl,
      is_public: true,
      is_playable: true,
      is_active: true,
      health_state: "verified_sample",
      published_at: new Date().toISOString(),
      source_key: chapterSourceKey,
    };

    const chapterRow = await updateThenInsertByColumn(
      "audiobook_chapters",
      "source_key",
      chapterSourceKey,
      chapterPayload
    );
    if (!existingEdition?.id) chaptersInserted += 1;

    const filePayload = {
      audiobook_id: editionId,
      chapter_id: chapterRow.id,
      title: chapter.title,
      audio_url: chapter.audioUrl,
      duration_seconds: chapter.durationSeconds,
      format: chapter.format,
      mime_type: chapter.mimeType,
      is_primary: chapter.chapterNumber === 1,
      playback_status: "playable",
      is_active: true,
      source_key: `${chapterSourceKey}:file`,
    };

    await updateThenInsertByColumn(
      "audiobook_files",
      "source_key",
      filePayload.source_key,
      filePayload
    );
  }

  return {
    accepted: true,
    inserted: !existingEdition?.id,
    updated: Boolean(existingEdition?.id),
    skipped: false,
    reason: null,
    editionId,
    chaptersInserted,
  };
}

/** Backward-compatible alias used by existing expansion runner. */
export async function importInternetArchiveAudiobookCandidate(
  candidate: NormalizedAudiobookCandidate,
  options: { dryRun?: boolean; verifyPlayback?: boolean } = {}
) {
  return importNormalizedAudiobookCandidate(candidate, options);
}
