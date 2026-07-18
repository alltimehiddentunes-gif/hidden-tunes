import type { AppSong, PlaybackQueueContext } from "../../context/PlayerContext";
import type { PlaybackRouteResult } from "../../types/media";
import type { RadioStation } from "../../types/radio";
import {
  buildLiveRadioQueueContext,
  buildLiveRadioSessionSongs,
  isPlayableLiveRadioStreamUrl,
  type LiveRadioSessionOptions,
} from "../radio/radioPlaybackSession";
import {
  isRadioStreamSong,
  radioStationToAppSong,
} from "./radioPlaybackAdapter";

export type NativeQueueMode = "standard" | "live_stream";

export type PlaybackRouterDeps = {
  playSong: (
    song: AppSong,
    queue?: AppSong[],
    index?: number,
    queueContext?: PlaybackQueueContext,
    queueMode?: NativeQueueMode
  ) => Promise<void>;
  playQueue: (
    queue: AppSong[],
    startIndex?: number,
    priorInterruptDone?: boolean,
    queueContext?: PlaybackQueueContext,
    queueMode?: NativeQueueMode
  ) => Promise<void>;
  stopPlayback?: () => Promise<void>;
};

export async function routeRadioPlayback(
  station: RadioStation,
  deps: PlaybackRouterDeps,
  sessionOptions?: LiveRadioSessionOptions
): Promise<PlaybackRouteResult> {
  const streamUrl = String(station.streamUrl || "").trim();

  if (!isPlayableLiveRadioStreamUrl(streamUrl)) {
    return {
      ok: false,
      error: "This station is unavailable right now.",
    };
  }

  const { songs, activeIndex } = buildLiveRadioSessionSongs(
    station,
    sessionOptions?.session
  );
  const activeSong = songs[activeIndex] || radioStationToAppSong(station);
  const context = buildLiveRadioQueueContext(sessionOptions);

  try {
    await deps.playSong(
      activeSong,
      songs,
      activeIndex,
      context,
      "live_stream"
    );
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "This station is unavailable right now.",
    };
  }
}

export { isRadioStreamSong };
