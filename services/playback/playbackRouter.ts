import type { AppSong, PlaybackQueueContext } from "../../context/PlayerContext";
import type { PlaybackRouteResult } from "../../types/media";
import type { RadioStation } from "../../types/radio";
import { isCatalogAbortError } from "../catalogJsonFetch";
import { resolveRadioStationStreamUrl } from "../radio/radioCatalogApi";
import {
  buildLiveRadioQueueContext,
  buildLiveRadioSessionSongs,
  isPlayableLiveRadioStreamUrl,
  type LiveRadioSessionOptions,
} from "../radio/radioPlaybackSession";
import {
  beginRadioStationSwitch,
  claimRadioPlayerOwner,
  isRadioSessionCurrent,
  isRadioSwitchAbortError,
  logRadioSwitchDiagnostic,
  type RadioSwitchOrigin,
} from "../radio/radioStationSwitchController";
import {
  isRadioStreamSong,
  radioStationSongId,
  radioStationToAppSong,
} from "./radioPlaybackAdapter";
import { claimExclusivePlayback } from "./PlaybackHandoffCoordinator";

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

export type RouteRadioPlaybackOptions = LiveRadioSessionOptions & {
  origin?: RadioSwitchOrigin;
};

/**
 * Canonical live-radio entry: stop previous → abort old work → resolve latest
 * → play only if this switch generation is still current.
 */
export async function routeRadioPlayback(
  station: RadioStation,
  deps: PlaybackRouterDeps,
  sessionOptions?: RouteRadioPlaybackOptions
): Promise<PlaybackRouteResult> {
  const stationId = String(station.id || "").trim();
  if (!stationId) {
    return { ok: false, error: "This station is unavailable right now." };
  }

  const mediaKey = radioStationSongId(stationId);
  const origin = sessionOptions?.origin || "app";

  const switchSession = await beginRadioStationSwitch({
    stationId,
    mediaKey,
    origin,
  });

  if (!isRadioSessionCurrent(switchSession.generation)) {
    return { ok: false, aborted: true };
  }

  // Stop peers (TV/video/sports) immediately — do not wait for /play.
  const handoff = await claimExclusivePlayback({
    owner: "shared-audio",
    contentKind: "radio",
    mediaKey,
  });

  if (
    !handoff.isCurrent() ||
    !isRadioSessionCurrent(switchSession.generation)
  ) {
    logRadioSwitchDiagnostic("stale_resolution_ignored", {
      stationId,
      generation: switchSession.generation,
      phase: "after_early_handoff",
    });
    return { ok: false, aborted: true };
  }

  logRadioSwitchDiagnostic("play_resolution_started", {
    stationId,
    generation: switchSession.generation,
    origin,
    hadStreamUrl: isPlayableLiveRadioStreamUrl(station.streamUrl),
  });

  let streamUrl = String(station.streamUrl || "").trim();
  if (!isPlayableLiveRadioStreamUrl(streamUrl)) {
    try {
      streamUrl =
        (await resolveRadioStationStreamUrl(station, switchSession.signal)) ||
        "";
    } catch (error) {
      if (
        isRadioSwitchAbortError(error) ||
        isCatalogAbortError(error) ||
        (error as Error)?.name === "AbortError"
      ) {
        logRadioSwitchDiagnostic("radio_request_aborted", {
          stationId,
          generation: switchSession.generation,
          phase: "play_resolve",
        });
        return { ok: false, aborted: true };
      }
      streamUrl = "";
    }
  }

  if (!isRadioSessionCurrent(switchSession.generation)) {
    logRadioSwitchDiagnostic("stale_resolution_ignored", {
      stationId,
      generation: switchSession.generation,
      phase: "after_play_resolve",
    });
    return { ok: false, aborted: true };
  }

  if (!isPlayableLiveRadioStreamUrl(streamUrl)) {
    return {
      ok: false,
      error: "This station is unavailable right now.",
    };
  }

  const playableStation: RadioStation = { ...station, streamUrl };
  const { songs, activeIndex } = buildLiveRadioSessionSongs(
    playableStation,
    sessionOptions?.session
  );
  const activeSong = songs[activeIndex] || radioStationToAppSong(playableStation);
  // Ensure the active entry carries the resolved HTTPS stream.
  songs[activeIndex] = {
    ...activeSong,
    streamUrl,
    url: streamUrl,
  };
  const context = buildLiveRadioQueueContext(sessionOptions);

  if (
    !handoff.isCurrent() ||
    !isRadioSessionCurrent(switchSession.generation)
  ) {
    logRadioSwitchDiagnostic("stale_resolution_ignored", {
      stationId,
      generation: switchSession.generation,
      phase: "before_play_song",
    });
    return { ok: false, aborted: true };
  }

  if (!claimRadioPlayerOwner(switchSession.generation)) {
    return { ok: false, aborted: true };
  }

  try {
    await deps.playSong(
      songs[activeIndex],
      songs,
      activeIndex,
      context,
      "live_stream"
    );

    if (!isRadioSessionCurrent(switchSession.generation)) {
      logRadioSwitchDiagnostic("stale_resolution_ignored", {
        stationId,
        generation: switchSession.generation,
        phase: "after_play_song",
      });
      return { ok: false, aborted: true };
    }

    logRadioSwitchDiagnostic("radio_play_started", {
      stationId,
      generation: switchSession.generation,
      mediaKey,
    });
    logRadioSwitchDiagnostic("radio_owner_claimed", {
      generation: switchSession.generation,
      mediaKey,
    });
    return { ok: true, streamUrl };
  } catch (error) {
    if (
      isRadioSwitchAbortError(error) ||
      !isRadioSessionCurrent(switchSession.generation)
    ) {
      return { ok: false, aborted: true };
    }
    return {
      ok: false,
      error: "This station is unavailable right now.",
    };
  }
}

export { isRadioStreamSong };
