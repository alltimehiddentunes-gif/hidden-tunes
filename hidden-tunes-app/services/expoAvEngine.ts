import {
  PlaybackEngineCapabilities,
  PlaybackEngineId,
} from "./playbackEngineTypes";

export const EXPO_AV_ENGINE_ID: PlaybackEngineId = "expo-av";

export const expoAvEngineCapabilities: PlaybackEngineCapabilities = {
  ownsNativeQueue: false,
  supportsLockScreenAutoNext: false,
  supportsRemoteControls: false,
  supportsExpoGo: true,
};

export function getExpoAvEngineMigrationPlan() {
  return {
    id: EXPO_AV_ENGINE_ID,
    activeToday: true,
    behaviorMoved: false,
    capabilities: expoAvEngineCapabilities,
    note:
      "Phase 0 documents the current expo-av role only. PlayerContext still owns the active expo-av implementation.",
  };
}
