import { Platform } from "react-native";

import { logAndRememberLockscreenDiagnostic } from "../utils/lockscreenPlaybackDiagnostics";

import {
  buildRemoteMediaMetadata,
  type RemoteMediaHandlers,
  type RemoteMediaSessionSnapshot,
} from "./remoteMediaControls.types";

export {
  buildRemoteMediaMetadata,
  type RemoteMediaHandlers,
  type RemoteMediaSessionSnapshot,
};

type MediaControlModule = typeof import("expo-media-control");

let controlsEnabled = false;
let removeListener: (() => void) | null = null;
let handlers: RemoteMediaHandlers | null = null;
let mediaModulePromise: Promise<MediaControlModule | null> | null = null;

function isNativePlatform() {
  return Platform.OS === "ios" || Platform.OS === "android";
}

function isRemoteMediaControlsPlatformEnabled() {
  // iOS preview builds can lack the ExpoMediaControl native module; disable entirely on iOS.
  return Platform.OS === "android";
}

function logRemoteMedia(message: string, details?: Record<string, unknown>) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;

  console.log("[HTRemoteMedia]", message, details || {});
}

function logRemoteMediaError(message: string, error: unknown) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;

  console.log(`[HTRemoteMedia] ${message}:`, error);
}


function commandDiagnosticName(
  mediaModule: MediaControlModule,
  command: import("expo-media-control").MediaControlEvent["command"]
) {
  const { Command } = mediaModule;

  switch (command) {
    case Command.PLAY:
      return "remote_play_received";
    case Command.PAUSE:
      return "remote_pause_received";
    case Command.NEXT_TRACK:
      return "remote_next_received";
    case Command.PREVIOUS_TRACK:
      return "remote_previous_received";
    case Command.STOP:
      return "remote_stop_received";
    default:
      return "remote_unknown_received";
  }
}

async function loadMediaControlModule(): Promise<MediaControlModule | null> {
  if (!isNativePlatform()) return null;
  if (!isRemoteMediaControlsPlatformEnabled()) return null;

  if (!mediaModulePromise) {
    mediaModulePromise = import("expo-media-control")
      .then((module) => module)
      .catch((error) => {
        logRemoteMediaError("module load failed", error);
        return null;
      });
  }

  return mediaModulePromise;
}

async function handleMediaControlEvent(
  mediaModule: MediaControlModule,
  event: import("expo-media-control").MediaControlEvent
) {
  if (!handlers) return;

  const { Command } = mediaModule;

  const diagnosticName = commandDiagnosticName(mediaModule, event.command);

  logRemoteMedia("command", { command: event.command });
  logAndRememberLockscreenDiagnostic(
    "android_media_session_command_received",
    { command: event.command },
    { lastRemoteCommand: `android:${String(event.command)}` }
  );
  logAndRememberLockscreenDiagnostic(
    diagnosticName,
    { command: event.command, platform: Platform.OS },
    { lastRemoteCommand: diagnosticName }
  );
  logAndRememberLockscreenDiagnostic(
    "remote_command_forwarded_to_js",
    { command: event.command, diagnosticName },
    { lastBridgeEvent: "remote_command_forwarded_to_js" }
  );

  try {
    switch (event.command) {
      case Command.PLAY:
        await handlers.onPlay();
        break;
      case Command.PAUSE:
        await handlers.onPause();
        break;
      case Command.NEXT_TRACK:
        await handlers.onNext();
        break;
      case Command.PREVIOUS_TRACK:
        await handlers.onPrevious();
        break;
      case Command.STOP:
        await handlers.onStop?.();
        break;
      default:
        break;
    }

    logAndRememberLockscreenDiagnostic(
      "remote_command_handled_success",
      { command: event.command, diagnosticName },
      { lastBridgeEvent: "remote_command_handled_success" }
    );
  } catch (error) {
    logAndRememberLockscreenDiagnostic(
      "remote_command_handled_error",
      { command: event.command, diagnosticName, message: String(error) },
      { lastBridgeEvent: "remote_command_handled_error" }
    );
    logRemoteMediaError("command handler error", error);
  }
}

export function isRemoteMediaControlsAvailable() {
  return isNativePlatform() && isRemoteMediaControlsPlatformEnabled();
}

export async function enableRemoteMediaControls(
  nextHandlers: RemoteMediaHandlers
): Promise<boolean> {
  if (!isNativePlatform()) return false;
  if (!isRemoteMediaControlsPlatformEnabled()) return false;

  const mediaModule = await loadMediaControlModule();
  if (!mediaModule) return false;

  const { Command, MediaControl } = mediaModule;

  handlers = nextHandlers;

  try {
    await MediaControl.enableMediaControls({
      capabilities: [
        Command.PLAY,
        Command.PAUSE,
        Command.NEXT_TRACK,
        Command.PREVIOUS_TRACK,
      ],
      compactCapabilities: [
        Command.PREVIOUS_TRACK,
        Command.PLAY,
        Command.NEXT_TRACK,
      ],
      notification: {
        color: "#7C3AED",
        showWhenClosed: true,
      },
      ios: {
        skipInterval: 15,
      },
      android: {
        skipInterval: 15,
      },
    });

    if (removeListener) {
      removeListener();
      removeListener = null;
    }

    removeListener = MediaControl.addListener((event) => {
      void handleMediaControlEvent(mediaModule, event);
    });

    controlsEnabled = true;
    logRemoteMedia("enabled");
    return true;
  } catch (error) {
    controlsEnabled = false;
    handlers = null;
    logRemoteMediaError("enable failed", error);
    return false;
  }
}

export async function disableRemoteMediaControls(): Promise<void> {
  if (!isNativePlatform()) return;

  if (removeListener) {
    removeListener();
    removeListener = null;
  }

  handlers = null;
  controlsEnabled = false;

  const mediaModule = await loadMediaControlModule();
  if (!mediaModule) return;

  try {
    await mediaModule.MediaControl.disableMediaControls();
  } catch (error) {
    logRemoteMediaError("disable error", error);
  }
}

function resolvePlaybackState(
  mediaModule: MediaControlModule,
  snapshot: RemoteMediaSessionSnapshot
) {
  const { PlaybackState } = mediaModule;

  if (!snapshot.song) {
    return PlaybackState.STOPPED;
  }

  if (snapshot.isLoading) {
    return PlaybackState.BUFFERING;
  }

  if (snapshot.isPlaying) {
    return PlaybackState.PLAYING;
  }

  return PlaybackState.PAUSED;
}

/**
 * Wipe Android lock-screen / notification metadata when shared-audio loses ownership.
 * PlaybackState.STOPPED alone leaves the previous song title visible.
 */
export async function clearRemoteMediaPresentedState(
  reason = "owner_transfer"
): Promise<void> {
  if (!isNativePlatform()) return;
  if (!isRemoteMediaControlsPlatformEnabled()) return;

  const mediaModule = await loadMediaControlModule();
  if (!mediaModule) return;

  const { MediaControl } = mediaModule;

  try {
    await MediaControl.updateMetadata({
      title: "",
      artist: "",
      album: "",
      duration: 0,
    });
    await MediaControl.updatePlaybackState(
      mediaModule.PlaybackState.STOPPED,
      0
    );
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      logRemoteMedia("presented_state_cleared", { reason });
    }
  } catch (error) {
    logRemoteMediaError("clear presented state error", error);
  }
}

export async function syncRemoteMediaSession(
  snapshot: RemoteMediaSessionSnapshot
): Promise<void> {
  if (!isNativePlatform() || !controlsEnabled) return;

  const mediaModule = await loadMediaControlModule();
  if (!mediaModule) return;

  const { MediaControl } = mediaModule;

  try {
    if (!snapshot.song) {
      await clearRemoteMediaPresentedState("sync_null_song");
      return;
    }

    const metadata = buildRemoteMediaMetadata(
      snapshot.song,
      snapshot.positionMillis,
      snapshot.durationMillis
    );

    if (metadata) {
      await MediaControl.updateMetadata(metadata);
    }

    const positionSeconds = Math.max(
      0,
      Math.round(snapshot.positionMillis / 1000)
    );

    await MediaControl.updatePlaybackState(
      resolvePlaybackState(mediaModule, snapshot),
      positionSeconds
    );
  } catch (error) {
    logRemoteMediaError("sync error", error);
  }
}
