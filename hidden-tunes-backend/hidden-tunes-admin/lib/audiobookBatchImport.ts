import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildEditionDedupKey,
  buildWorkDedupKey,
  normalizeAudiobookTitleKey,
} from "@/lib/audiobookDedup";
import { verifyAudiobookEditionSampleChapters } from "@/lib/audiobookPlayabilityCheck";
import type { NormalizedArchiveAudiobookCandidate } from "@/lib/audiobookSources/internetArchiveAudiobookSource";
import { cleanText } from "@/lib/tvCatalog";

function slugify(value: string, fallback = "audiobook") {
  const cleaned = normalizeAudiobookTitleKey(value) || fallback;
  return cleaned.slice(0, 180) || fallback;
}

async function findOrCreateWork(candidate: NormalizedArchiveAudiobookCandidate) {
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

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("audiobook_works")
    .insert({
      canonical_title: candidate.title,
      normalized_title: normalizeAudiobookTitleKey(candidate.title),
      original_title: candidate.title,
      primary_author_name: candidate.authorName,
      description: candidate.description,
      subjects: candidate.categories,
      genres: candidate.categories,
      original_language: candidate.language,
      public_domain_status: candidate.licenseType,
      work_identifier: workKey,
    })
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
  await supabaseAdmin.from("audiobook_rejected_candidates").insert({
    source_type: input.sourceType,
    source_id: input.sourceId,
    source_key: input.sourceKey || null,
    title: input.title || null,
    reason: input.reason,
    metadata: input.metadata || {},
  });
}

export async function importInternetArchiveAudiobookCandidate(
  candidate: NormalizedArchiveAudiobookCandidate,
  options: { dryRun?: boolean; verifyPlayback?: boolean } = {}
) {
  const editionKey = buildEditionDedupKey({
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    narrator: candidate.narratorName,
    language: candidate.language,
  });

  const { data: existingEdition, error: existingEditionError } = await supabaseAdmin
    .from("audiobooks")
    .select("id")
    .eq("source_key", editionKey)
    .maybeSingle();

  if (existingEditionError) throw existingEditionError;

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
      };
    }
  }

  if (options.dryRun) {
    return { accepted: true, inserted: true, updated: false, skipped: false, reason: null };
  }

  const workId = await findOrCreateWork(candidate);
  const slug = `${slugify(candidate.title)}-${candidate.sourceId.slice(0, 12)}`;
  const normalizedTitleAuthor = `${normalizeAudiobookTitleKey(candidate.title)}-${normalizeAudiobookTitleKey(candidate.authorName || "unknown")}`;

  const editionPayload = {
    work_id: workId,
    slug,
    title: candidate.title,
    description: candidate.description,
    cover_url: candidate.coverUrl,
    author_name: candidate.authorName,
    narrator_name: candidate.narratorName,
    category_slug: candidate.categorySlug,
    categories: candidate.categories,
    language: candidate.language,
    publisher: candidate.publisher,
    source_type: candidate.sourceType,
    source_id: candidate.sourceId,
    source_url: candidate.sourceUrl,
    source_key: editionKey,
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
    is_mature: false,
    published_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
  };

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
      chapter_number: chapter.chapterNumber,
      sequence_number: chapter.sequenceNumber,
      normalized_title: normalizeAudiobookTitleKey(chapter.title),
      duration_seconds: chapter.durationSeconds,
      source_file_id: chapter.sourceFileId,
      source_format: chapter.format,
      mime_type: chapter.mimeType,
      canonical_media_reference: chapter.audioUrl,
      is_public: true,
      is_playable: true,
      health_state: "verified_sample",
      published_at: new Date().toISOString(),
    };

    const { data: existingChapter, error: existingChapterError } = await supabaseAdmin
      .from("audiobook_chapters")
      .select("id")
      .eq("audiobook_id", editionId)
      .eq("source_key", chapterSourceKey)
      .maybeSingle();

    if (existingChapterError) throw existingChapterError;

    let chapterId = existingChapter?.id as string | undefined;
    if (chapterId) {
      const { error } = await supabaseAdmin
        .from("audiobook_chapters")
        .update({ ...chapterPayload, source_key: chapterSourceKey })
        .eq("id", chapterId);
      if (error) throw error;
    } else {
      const { data: insertedChapter, error } = await supabaseAdmin
        .from("audiobook_chapters")
        .insert({ ...chapterPayload, source_key: chapterSourceKey })
        .select("id")
        .single();
      if (error) throw error;
      chapterId = insertedChapter.id as string;
      chaptersInserted += 1;
    }

    const filePayload = {
      audiobook_id: editionId,
      chapter_id: chapterId,
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

    const { data: existingFile, error: existingFileError } = await supabaseAdmin
      .from("audiobook_files")
      .select("id")
      .eq("source_key", filePayload.source_key)
      .maybeSingle();

    if (existingFileError) throw existingFileError;
    if (existingFile?.id) {
      const { error } = await supabaseAdmin
        .from("audiobook_files")
        .update(filePayload)
        .eq("id", existingFile.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("audiobook_files").insert(filePayload);
      if (error) throw error;
    }
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
