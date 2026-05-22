import {
  PlaybackEngineCapabilities,
  PlaybackEngineId,
} from "./playbackEngineTypes";

export const EXPO_AV_ENGINE_ID: PlaybackEngineId = "expo-av";

export const expoAvEngineCapabilities: PlaybackEngineCapabilities = {
  ownsNativeQueue: false,
  supportsLockScreenAutoNext: true,
  supportsRemoteControls: true,
  supportsExpoGo: false,
};

export function getExpoAvEngineMigrationPlan() {
  return {
    id: EXPO_AV_ENGINE_ID,
    activeToday: true,
    behaviorMoved: false,
    capabilities: expoAvEngineCapabilities,
    note:
      "expo-av remains the playback engine. System media session controls are bridged via expo-media-control and RemoteMediaControlsBridge.",
  };
}
