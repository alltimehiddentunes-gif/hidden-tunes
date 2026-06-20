import {
  PlaybackEngineCapabilities,
  PlaybackEngineId,
} from "./playbackEngineTypes";

export const HIDDEN_AUDIO_ENGINE_ID: PlaybackEngineId = "hidden-audio";

export const hiddenAudioEngineCapabilities: PlaybackEngineCapabilities = {
  ownsNativeQueue: false,
  supportsLockScreenAutoNext: true,
  supportsRemoteControls: true,
  supportsExpoGo: false,
};

export function getHiddenAudioEngineMigrationPlan() {
  return {
    id: HIDDEN_AUDIO_ENGINE_ID,
    activeToday: true,
    behaviorMoved: true,
    capabilities: hiddenAudioEngineCapabilities,
    note:
      "HiddenAudio native module handles playback. System media session controls are bridged via expo-media-control and RemoteMediaControlsBridge where enabled.",
  };
}
