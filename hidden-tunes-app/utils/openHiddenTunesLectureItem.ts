import { router } from "expo-router";

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
  buildLectureSessionSongs,
  isLectureVideoItem,
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

/**
 * Resolves one lecture lesson and starts shared-player playback.
 * Same item already loading is ignored (no second resolve/load).
 */
export async function openHiddenTunesLectureSeries(
  series: HiddenTunesLectureSeries,
  deps: LecturePlayDeps,
  options?: {
    lessonId?: string | null;
    signal?: AbortSignal;
  }
): Promise<LectureOpenResult> {
  let resolverCalls = 0;
  let playerLoads = 0;

  const lectureId = String(series.id || "").trim();
  if (!lectureId) {
    return {
      ok: false,
      error: "This lecture is missing an id.",
      resolverCalls,
      playerLoads,
    };
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
      return {
        ok: false,
        error: "This lecture has no playable sessions.",
        resolverCalls,
        playerLoads,
      };
    }

    const selected =
      (options?.lessonId
        ? lessons.find((lesson) => lesson.id === options.lessonId)
        : null) || selectPrimaryLectureLesson(lessons);

    if (!selected) {
      return {
        ok: false,
        error: "This lecture session could not be selected.",
        resolverCalls,
        playerLoads,
      };
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

      if (isLectureVideoItem(playable)) {
        // Progressive lecture video uses the same TV progressive path as Motivationals.
        router.push({
          pathname: "/tv-player",
          params: {
            id: canonicalId,
            name: playable.title,
            streamUrl: playable.playbackUrl,
            logoUrl: playable.artworkUrl || "",
            sourceLabel: playable.speakerName || playable.seriesTitle || "Lecture",
            streamType: "mp4",
          },
        });
        playerLoads += 1;
        return { ok: true, resolverCalls, playerLoads };
      }

      const session = buildLectureSessionSongs([playable], canonicalId);
      if (!session.songs.length) {
        return {
          ok: false,
          error: "This lecture session is currently unavailable.",
          resolverCalls,
          playerLoads,
        };
      }

      const result = await deps.playLectureSession([playable], canonicalId);
      if (!result.ok) {
        return {
          ok: false,
          error: result.error || "This lecture session is currently unavailable.",
          resolverCalls,
          playerLoads,
        };
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
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("[lectures] tap-to-play failed", {
        lectureId,
        lessonId: options?.lessonId ?? null,
        message,
      });
    }
    return {
      ok: false,
      error: message,
      resolverCalls,
      playerLoads,
    };
  }
}
