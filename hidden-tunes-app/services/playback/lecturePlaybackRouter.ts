import type { AppSong } from "../../context/PlayerContext";
import type { PlaybackRouteResult } from "../../types/media";
import {
  buildLectureSessionSongs,
  type LecturePlayableItem,
} from "./lecturePlaybackAdapter";

type LecturePlaybackDeps = {
  playQueue: (
    queue: AppSong[],
    startIndex?: number,
    priorInterruptDone?: boolean,
    queueMode?: "standard" | "live_stream" | "podcast"
  ) => Promise<void>;
};

export async function routeLecturePlayback(
  items: LecturePlayableItem[],
  startCanonicalId: string,
  deps: LecturePlaybackDeps
): Promise<PlaybackRouteResult> {
  const { songs, startIndex } = buildLectureSessionSongs(
    items,
    startCanonicalId
  );

  if (!songs.length || !songs[startIndex]?.audioUrl) {
    return {
      ok: false,
      error: "This lecture session is currently unavailable.",
    };
  }

  try {
    await deps.playQueue(songs, startIndex, false, "standard");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "This lecture session is currently unavailable.",
    };
  }
}
