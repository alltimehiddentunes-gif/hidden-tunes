import { router } from "expo-router";
import { Alert } from "react-native";

import {
  fetchLectureLessons,
  fetchLecturePlayback,
  selectPrimaryLectureLesson,
  type HiddenTunesLectureLesson,
  type HiddenTunesLectureSeries,
} from "../services/lectureCatalogApi";
import {
  beginLecturePlayback,
  isLecturePlaybackInflight,
} from "../services/lectures/lecturePlaybackGuard";
import {
  buildLectureCanonicalId,
  type LecturePlayableItem,
} from "../services/playback/lecturePlaybackAdapter";
import type { PlaybackRouteResult } from "../types/media";

export type LectureOpenResult =
  | { ok: true; resolverCalls: number; playerLoads: number }
  | { ok: false; error: string; resolverCalls: number; playerLoads: number };

export type LecturePlayDeps = {
  playLectureSession: (
    items: LecturePlayableItem[],
    startCanonicalId: string
  ) => Promise<PlaybackRouteResult>;
};

function toPlayableItem(
  series: HiddenTunesLectureSeries,
  lesson: HiddenTunesLectureLesson,
  playback: Awaited<ReturnType<typeof fetchLecturePlayback>>
): LecturePlayableItem {
  return {
    lectureId: playback.lectureId || series.id,
    itemId: playback.itemId || lesson.id,
    title: playback.title || lesson.title,
    speakerName:
      playback.speakerName || series.speaker_name || series.instructor_name,
    seriesTitle: series.title,
    artworkUrl: playback.artworkUrl || series.artwork_url,
    durationSeconds: playback.durationSeconds ?? lesson.duration_seconds,
    mediaType: playback.mediaType,
    playbackUrl: playback.playbackUrl,
  };
}

function reportLecturePlayFailure(message: string) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn("[lectures] tap-to-play failed", message);
  }
  Alert.alert("Lecture unavailable", message);
}

/**
 * Resolves one lecture lesson and starts shared-player playback.
 * Progressive MP3 and MP4 both use HiddenAudio / MiniPlayer (not TV).
 * Same item already loading is ignored (no second resolve/load).
 */
export async function openHiddenTunesLectureSeries(
  series: HiddenTunesLectureSeries,
  deps: LecturePlayDeps,
  options?: {
    lessonId?: string | null;
    signal?: AbortSignal;
    silent?: boolean;
  }
): Promise<LectureOpenResult> {
  let resolverCalls = 0;
  let playerLoads = 0;

  const lectureId = String(series.id || "").trim();
  if (!lectureId) {
    const error = "This lecture is missing an id.";
    if (!options?.silent) reportLecturePlayFailure(error);
    return { ok: false, error, resolverCalls, playerLoads };
  }

  try {
    const detail = await fetchLectureLessons(lectureId, {
      page: 1,
      limit: 40,
      signal: options?.signal,
    });
    const lessons = detail.lessons;
    const resolvedSeries = detail.series || series;

    if (!lessons.length) {
      const error = "This lecture has no playable sessions.";
      if (!options?.silent) reportLecturePlayFailure(error);
      return { ok: false, error, resolverCalls, playerLoads };
    }

    const selected =
      (options?.lessonId
        ? lessons.find((lesson) => lesson.id === options.lessonId)
        : null) || selectPrimaryLectureLesson(lessons);

    if (!selected) {
      const error = "This lecture session could not be selected.";
      if (!options?.silent) reportLecturePlayFailure(error);
      return { ok: false, error, resolverCalls, playerLoads };
    }

    const canonicalId = buildLectureCanonicalId(lectureId, selected.id);
    if (isLecturePlaybackInflight(canonicalId)) {
      return { ok: true, resolverCalls: 0, playerLoads: 0 };
    }

    const release = beginLecturePlayback(canonicalId);
    if (!release) {
      return { ok: true, resolverCalls: 0, playerLoads: 0 };
    }

    try {
      resolverCalls += 1;
      const playback = await fetchLecturePlayback(
        lectureId,
        selected.id,
        options?.signal
      );

      const playable = toPlayableItem(resolvedSeries, selected, playback);
      if (!playable.playbackUrl.startsWith("http")) {
        const error = "This lecture session is currently unavailable.";
        if (!options?.silent) reportLecturePlayFailure(error);
        return { ok: false, error, resolverCalls, playerLoads };
      }

      const result = await deps.playLectureSession([playable], canonicalId);
      if (!result.ok) {
        const error =
          result.error || "This lecture session is currently unavailable.";
        if (!options?.silent) reportLecturePlayFailure(error);
        return { ok: false, error, resolverCalls, playerLoads };
      }

      playerLoads += 1;
      router.push("/player" as never);
      return { ok: true, resolverCalls, playerLoads };
    } finally {
      release();
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "This lecture could not be played right now.";
    if (!options?.silent) reportLecturePlayFailure(message);
    return {
      ok: false,
      error: message,
      resolverCalls,
      playerLoads,
    };
  }
}
