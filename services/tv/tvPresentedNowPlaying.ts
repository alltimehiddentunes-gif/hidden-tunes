/**

 * Cross-platform presented Now Playing for TV via HiddenAudio native APIs.

 * Does not load or play audio — metadata + remote-command ownership only.

 *

 * Diagnostics only observe availability/results. They do not alter ownership,

 * playback, retries, or clear behavior.

 */



import { NativeModules, Platform } from "react-native";



import type { TvNowPlayingMetadata } from "./tvNowPlayingMetadata";

import {

  getTvMediaSessionCorrelationId,

  logTvMediaSessionDiag,

  noteTvMediaOwnerIfChanged,

  summarizeTvMetadataForDiag,

} from "./tvMediaSessionDiagnostics";

import { getActivePlaybackOwner } from "../playback/PlaybackHandoffCoordinator";



type PresentedPayload = {

  title: string;

  artist: string;

  album: string;

  artworkUrl: string;

  isLive: boolean;

  isPlaying: boolean;

  hasNext: boolean;

  hasPrevious: boolean;

};



type HiddenAudioPresentedModule = {

  setPresentedNowPlaying?: (info: PresentedPayload) => Promise<void>;

  updatePresentedPlaybackState?: (info: {

    isPlaying: boolean;

    hasNext: boolean;

    hasPrevious: boolean;

  }) => Promise<void>;

  clearPresentedNowPlaying?: () => Promise<void>;

};



function getNative(): HiddenAudioPresentedModule | null {

  const mod =

    (NativeModules.HiddenAudioModule || NativeModules.HiddenAudio) as

      | HiddenAudioPresentedModule

      | undefined;

  return mod || null;

}



function checkPresentedMethodAvailability() {

  const native = getNative();

  const moduleName = NativeModules.HiddenAudioModule

    ? "HiddenAudioModule"

    : NativeModules.HiddenAudio

      ? "HiddenAudio"

      : null;

  const availability = {

    modulePresent: Boolean(native),

    moduleName,

    setPresentedNowPlaying: typeof native?.setPresentedNowPlaying === "function",

    updatePresentedPlaybackState:

      typeof native?.updatePresentedPlaybackState === "function",

    clearPresentedNowPlaying:

      typeof native?.clearPresentedNowPlaying === "function",

    platform: Platform.OS,

  };

  logTvMediaSessionDiag("native_bridge_method_checked", availability);

  return { native, availability };

}



export async function publishTvPresentedNowPlaying(input: {

  metadata: TvNowPlayingMetadata;

  isPlaying: boolean;

  hasNext: boolean;

  hasPrevious: boolean;

}): Promise<void> {

  logTvMediaSessionDiag("publish_now_playing_invoked", {

    correlationId: getTvMediaSessionCorrelationId(),

    ...summarizeTvMetadataForDiag(input.metadata),

    isPlaying: input.isPlaying,

    hasNext: input.hasNext,

    hasPrevious: input.hasPrevious,

  });



  const { native, availability } = checkPresentedMethodAvailability();



  if (!availability.setPresentedNowPlaying || !native?.setPresentedNowPlaying) {

    logTvMediaSessionDiag("native_bridge_result", {

      method: "setPresentedNowPlaying",

      success: false,

      failureClass: "method_unavailable",

      message:

        "Installed Dev Client binary lacks HiddenAudio.setPresentedNowPlaying",

      requiresNativeRebuild: true,

    });

    logTvMediaSessionDiag("active_media_owner_after_publish", {

      owner: getActivePlaybackOwner(),

      published: false,

    });

    noteTvMediaOwnerIfChanged("after_publish_unavailable");

    return;

  }



  try {

    logTvMediaSessionDiag("native_bridge_invoked", {

      method: "setPresentedNowPlaying",

      title: String(input.metadata.title || "").slice(0, 80),

    });

    await native.setPresentedNowPlaying({

      title: input.metadata.title,

      artist: input.metadata.artist,

      album: input.metadata.album,

      artworkUrl: input.metadata.artworkUri || "",

      isLive: true,

      isPlaying: input.isPlaying,

      hasNext: input.hasNext,

      hasPrevious: input.hasPrevious,

    });

    logTvMediaSessionDiag("native_bridge_result", {

      method: "setPresentedNowPlaying",

      success: true,

    });

    logTvMediaSessionDiag("tv_metadata_published", {

      platform: Platform.OS,

      title: input.metadata.title,

      artist: input.metadata.artist,

      isPlaying: input.isPlaying,

      hasNext: input.hasNext,

      hasPrevious: input.hasPrevious,

      path: "hidden_audio_presented",

    });

    logTvMediaSessionDiag("active_media_owner_after_publish", {

      owner: getActivePlaybackOwner(),

      published: true,

    });

    noteTvMediaOwnerIfChanged("after_publish_success");

  } catch (error) {

    const err = error as { name?: string; message?: string; code?: string };

    logTvMediaSessionDiag("native_bridge_result", {

      method: "setPresentedNowPlaying",

      success: false,

      failureClass: "native_reject",

      errorName: String(err?.name || "Error").slice(0, 64),

      errorMessage: String(err?.message || error || "").slice(0, 160),

      errorCode: err?.code ? String(err.code).slice(0, 64) : undefined,

      requiresNativeRebuild: /not.?a.?function|undefined is not|unrecognized selector|does not exist/i.test(

        String(err?.message || "")

      ),

    });

    logTvMediaSessionDiag("active_media_owner_after_publish", {

      owner: getActivePlaybackOwner(),

      published: false,

    });

    noteTvMediaOwnerIfChanged("after_publish_error");

  }

}



export async function updateTvPresentedPlaybackState(input: {

  isPlaying: boolean;

  hasNext: boolean;

  hasPrevious: boolean;

}): Promise<void> {

  const native = getNative();

  if (!native?.updatePresentedPlaybackState) {

    // Do not spam method checks on every play/pause — publish path already checks.

    return;

  }

  try {

    await native.updatePresentedPlaybackState(input);

    logTvMediaSessionDiag("tv_playback_state_update", {

      platform: Platform.OS,

      ...input,

      path: "hidden_audio_presented",

    });

  } catch (error) {

    const err = error as { name?: string; message?: string };

    logTvMediaSessionDiag("native_bridge_result", {

      method: "updatePresentedPlaybackState",

      success: false,

      failureClass: "native_reject",

      errorName: String(err?.name || "Error").slice(0, 64),

      errorMessage: String(err?.message || error || "").slice(0, 160),

    });

  }

}



export async function clearTvPresentedNowPlaying(

  reason = "tv_owner_released"

): Promise<void> {

  logTvMediaSessionDiag("metadata_clear_invoked", {

    reason,

    platform: Platform.OS,

  });

  const native = getNative();

  if (!native?.clearPresentedNowPlaying) {

    logTvMediaSessionDiag("native_bridge_result", {

      method: "clearPresentedNowPlaying",

      success: false,

      failureClass: "method_unavailable",

      reason,

    });

    return;

  }

  try {

    await native.clearPresentedNowPlaying();

    logTvMediaSessionDiag("tv_owner_released", {

      platform: Platform.OS,

      reason,

      path: "hidden_audio_presented",

    });

  } catch (error) {

    const err = error as { name?: string; message?: string };

    logTvMediaSessionDiag("native_bridge_result", {

      method: "clearPresentedNowPlaying",

      success: false,

      failureClass: "native_reject",

      reason,

      errorName: String(err?.name || "Error").slice(0, 64),

      errorMessage: String(err?.message || error || "").slice(0, 160),

    });

  }

}


