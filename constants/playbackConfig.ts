import { Platform } from "react-native";

/**
 * iOS native hidden_audio engine (AVPlayer + Now Playing POC).
 * When true on iOS only, PlayerContext routes playback through hidden_audio.
 */
export const USE_NATIVE_HIDDEN_AUDIO_ON_IOS = true;

/** Android native hidden_audio engine (ExoPlayer + foreground service). */
export const USE_NATIVE_HIDDEN_AUDIO_ON_ANDROID = true;

/** B1.1 reliability instrumentation (main-thread only). */
export const ENABLE_PLAYBACK_RELIABILITY_DIAGNOSTICS = false;

/** Hidden Audio native POC route flag. */
export const HIDDEN_AUDIO_POC_STARTUP_ENABLED = false;

export const HIDDEN_AUDIO_POC_ROUTE = "/hidden-audio-test";

export function isHiddenAudioPocStartupEnabled(): boolean {
  return HIDDEN_AUDIO_POC_STARTUP_ENABLED;
}

export function isHiddenAudioPocRoute(pathname: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  if (normalizedPath === HIDDEN_AUDIO_POC_ROUTE) {
    return true;
  }

  if (HIDDEN_AUDIO_POC_STARTUP_ENABLED && normalizedPath === "/") {
    return true;
  }

  return false;
}

export function isHiddenAudioEnabledOnIOS(): boolean {
  return Platform.OS === "ios" && USE_NATIVE_HIDDEN_AUDIO_ON_IOS;
}

export function isHiddenAudioEnabledOnAndroid(): boolean {
  return Platform.OS === "android" && USE_NATIVE_HIDDEN_AUDIO_ON_ANDROID;
}

export function isHiddenAudioNativePlaybackEnabled(): boolean {
  return isHiddenAudioEnabledOnIOS() || isHiddenAudioEnabledOnAndroid();
}

export function isPlaybackReliabilityDiagnosticsEnabled(): boolean {
  return ENABLE_PLAYBACK_RELIABILITY_DIAGNOSTICS;
}