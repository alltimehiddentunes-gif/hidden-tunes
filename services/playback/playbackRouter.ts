import type { PlaybackQueueContext } from "../../context/PlayerContext";
import type { AppSong } from "../../context/PlayerContext";
import type { PlaybackRouteResult } from "../../types/media";
import type { RadioStation } from "../../types/radio";
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
  deps: PlaybackRouterDeps
): Promise<PlaybackRouteResult> {
  const streamUrl = String(station.streamUrl || "").trim();

  if (!streamUrl.startsWith("https://")) {
    return {
      ok: false,
      error: "This station is unavailable right now.",
    };
  }

  const song = radioStationToAppSong(station);

  try {
    await deps.playSong(
      song,
      [song],
      0,
      { source: "radio", label: station.title },
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
