import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  TV_MAX_IMPORT_VIDEOS,
  TV_OEMBED_FETCH_CONCURRENCY,
  TV_VIDEO_SOURCE_TYPE,
  TvSourceRow,
  buildYouTubeEmbedUrl,
  buildYouTubeThumbnailUrl,
  buildYouTubeWatchUrl,
  extractYouTubeVideoId,
  fetchYouTubeOEmbedMetadata,
  inferCategoryGenreMoodFormat,
  mapWithConcurrency,
  normalizeTvTags,
  parseManualVideoList,
  summarizeFailedVideoIds,
} from "@/lib/tvCatalog";
import {
  buildVerifiedYouTubeUrls,
  resolveTvImportModeration,
  verifyTvVideoRecord,
} from "@/lib/tvPlaybackChecks";

export type TvImportRunResult = {
  total_found: number;
  total_imported: number;
  total_skipped: number;
  failed_video_ids: string[];
  invalid_line_count: number;
  error_message: string | null;
  message: string;
  note: string;
};

type VideoImportOutcome =
  | { kind: "imported" }
  | { kind: "skipped" }
  | { kind: "failed"; videoId: string };

async function loadExistingVideoIds(videoIds: string[]) {
  if (videoIds.length === 0) return new Set<string>();

  const existing = new Set<string>();
  const chunkSize = 100;

  for (let index = 0; index < videoIds.length; index += chunkSize) {
    const chunk = videoIds.slice(index, index + chunkSize);
    const { data, error } = await supabaseAdmin
      .from("tv_videos")
      .select("source_id")
      .eq("source_type", TV_VIDEO_SOURCE_TYPE)
      .in("source_id", chunk);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data || []) {
      const sourceId = String((row as { source_id?: string }).source_id || "");
      if (sourceId) existing.add(sourceId);
    }
  }

  return existing;
}

async function importSingleVideo(
  source: TvSourceRow,
  videoId: string,
  existingIds: Set<string>
): Promise<VideoImportOutcome> {
  if (existingIds.has(videoId)) {
    return { kind: "skipped" };
  }

  const oEmbed = await fetchYouTubeOEmbedMetadata(videoId);
  if (!oEmbed) {
    return { kind: "failed", videoId };
  }

  const playbackUrls = buildVerifiedYouTubeUrls(videoId);
  const thumbnailUrl = oEmbed.thumbnail_url || buildYouTubeThumbnailUrl(videoId);

  const verification = verifyTvVideoRecord({
    source_type: TV_VIDEO_SOURCE_TYPE,
    source_id: videoId,
    title: oEmbed.title,
    thumbnail_url: thumbnailUrl,
    source_url: playbackUrls.source_url,
    embed_url: playbackUrls.embed_url,
    oEmbedSucceeded: true,
  });

  const moderation = resolveTvImportModeration(
    verification,
    Boolean(source.auto_approve)
  );

  const inferred = inferCategoryGenreMoodFormat(oEmbed.title, null, {
    category: source.default_category,
    genre: source.default_genre,
    mood: source.default_mood,
  });

  const tags = normalizeTvTags([
    ...inferred.tags,
    ...(source.default_genre ? [source.default_genre] : []),
    ...(source.default_mood ? [source.default_mood] : []),
  ]);

  const insertPayload = {
    source_type: TV_VIDEO_SOURCE_TYPE,
    source_id: videoId,
    source_url: playbackUrls.source_url,
    embed_url: playbackUrls.embed_url,
    title: oEmbed.title,
    description: null,
    thumbnail_url: thumbnailUrl,
    duration_seconds: null,
    channel_name: oEmbed.channel_name,
    category: inferred.category,
    genre: inferred.genre,
    mood: inferred.mood,
    format: inferred.format,
    tags,
    status: moderation.status,
    playback_status: moderation.playback_status,
    is_active: moderation.is_active,
    reliability_score: moderation.playback_status === "playable" ? 100 : 50,
    consecutive_failures: 0,
    source_key: `${TV_VIDEO_SOURCE_TYPE}:${videoId}`,
    is_featured: false,
    imported_from_source_id: source.id,
  };

  const { error: insertError } = await supabaseAdmin
    .from("tv_videos")
    .insert(insertPayload);

  if (insertError) {
    if (insertError.code === "23505") {
      existingIds.add(videoId);
      return { kind: "skipped" };
    }

    return { kind: "failed", videoId };
  }

  existingIds.add(videoId);
  return { kind: "imported" };
}

async function importVideoIds(
  source: TvSourceRow,
  videoIds: string[]
): Promise<Pick<
  TvImportRunResult,
  "total_found" | "total_imported" | "total_skipped" | "failed_video_ids"
>> {
  const existingIds = await loadExistingVideoIds(videoIds);
  let totalImported = 0;
  let totalSkipped = 0;
  const failedVideoIds: string[] = [];

  const outcomes = await mapWithConcurrency(
    videoIds,
    TV_OEMBED_FETCH_CONCURRENCY,
    async (videoId) => importSingleVideo(source, videoId, existingIds)
  );

  for (const outcome of outcomes) {
    if (outcome.kind === "imported") {
      totalImported += 1;
      continue;
    }

    if (outcome.kind === "skipped") {
      totalSkipped += 1;
      continue;
    }

    failedVideoIds.push(outcome.videoId);
  }

  return {
    total_found: videoIds.length,
    total_imported: totalImported,
    total_skipped: totalSkipped,
    failed_video_ids: failedVideoIds,
  };
}

function resolveVideoIdsForSource(
  source: TvSourceRow,
  manualVideoList: unknown
) {
  const sourceType = String(source.source_type || "");
  const sourceUrl = String(source.source_url || "");
  const manual = parseManualVideoList(manualVideoList, TV_MAX_IMPORT_VIDEOS);

  if (sourceType === "youtube_video") {
    const singleId =
      extractYouTubeVideoId(source.source_id || "") ||
      extractYouTubeVideoId(sourceUrl);

    if (!singleId) {
      return {
        ok: false as const,
        error: "Could not extract a YouTube video ID from this source.",
        videoIds: [] as string[],
        invalid_line_count: manual.invalidLineCount,
      };
    }

    const merged = parseManualVideoList(
      [singleId, ...manual.videoIds].join("\n"),
      TV_MAX_IMPORT_VIDEOS
    );

    return {
      ok: true as const,
      videoIds: merged.videoIds,
      invalid_line_count: merged.invalidLineCount,
      truncated: merged.truncated,
    };
  }

  if (sourceType === "youtube_playlist" || sourceType === "youtube_channel") {
    if (manual.videoIds.length === 0) {
      return {
        ok: false as const,
        error:
          "Paste one YouTube URL or video ID per line in the bulk list for playlist/channel imports.",
        videoIds: [] as string[],
        invalid_line_count: manual.invalidLineCount,
      };
    }

    return {
      ok: true as const,
      videoIds: manual.videoIds,
      invalid_line_count: manual.invalidLineCount,
      truncated: manual.truncated,
    };
  }

  if (sourceType === "manual") {
    if (manual.videoIds.length === 0) {
      return {
        ok: false as const,
        error: "Manual sources require a bulk video URL/ID list.",
        videoIds: [] as string[],
        invalid_line_count: manual.invalidLineCount,
      };
    }

    return {
      ok: true as const,
      videoIds: manual.videoIds,
      invalid_line_count: manual.invalidLineCount,
      truncated: manual.truncated,
    };
  }

  return {
    ok: false as const,
    error: `Bulk metadata import is not enabled for source type "${sourceType}" yet.`,
    videoIds: [] as string[],
    invalid_line_count: manual.invalidLineCount,
  };
}

export async function runTvSourceImport(
  source: TvSourceRow,
  manualVideoList: unknown
): Promise<
  | { ok: true; result: TvImportRunResult }
  | { ok: false; error: string; invalid_line_count?: number }
> {
  const resolved = resolveVideoIdsForSource(source, manualVideoList);

  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      invalid_line_count: resolved.invalid_line_count,
    };
  }

  const counts = await importVideoIds(source, resolved.videoIds);
  const sourceType = String(source.source_type || "");

  const errorMessage = summarizeFailedVideoIds(counts.failed_video_ids);
  const truncationNote = resolved.truncated
    ? ` Input capped at ${TV_MAX_IMPORT_VIDEOS} videos.`
    : "";

  let message = "TV metadata import completed.";
  let note =
    "Metadata only. Playback uses official YouTube embed URLs. Verified videos are marked playable before approval.";

  if (sourceType === "youtube_video") {
    message = "YouTube video metadata import completed.";
  } else if (
    sourceType === "youtube_playlist" ||
    sourceType === "youtube_channel"
  ) {
    message = `Bulk ${sourceType.replace("youtube_", "")} metadata import completed.`;
    note +=
      " Automatic playlist/channel scraping is disabled; paste video URLs/IDs per run.";
  } else if (sourceType === "manual") {
    message = "Manual seed metadata import completed.";
  }

  if (resolved.invalid_line_count > 0) {
    note += ` Ignored ${resolved.invalid_line_count} invalid line(s).`;
  }

  note += truncationNote;

  return {
    ok: true,
    result: {
      ...counts,
      invalid_line_count: resolved.invalid_line_count,
      error_message: errorMessage,
      message,
      note: note.trim(),
    },
  };
}
