import { NativeModules } from "react-native";

import type {
  HiddenAudioProgress,
  HiddenAudioState,
  HiddenAudioTrack,
} from "./hiddenAudioTypes";

export const HIDDEN_AUDIO_NATIVE_MODULE_NAME = "HiddenAudioModule";

export type HiddenAudioNativeModule = {
  setup: () => Promise<void>;
  loadTrack: (track: HiddenAudioTrack) => Promise<void>;
  loadQueue: (tracks: HiddenAudioTrack[], startIndex: number) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  getState: () => Promise<HiddenAudioState>;
  getProgress: () => Promise<HiddenAudioProgress>;
  getActiveTrack: () => Promise<HiddenAudioTrack | null>;
};

type HiddenAudioNativeModules = typeof NativeModules & {
  HiddenAudioModule?: HiddenAudioNativeModule;
};

export function getHiddenAudioModule(): HiddenAudioNativeModule | null {
  const modules = NativeModules as HiddenAudioNativeModules;
  return modules.HiddenAudioModule ?? null;
}

export function isHiddenAudioModuleAvailable(): boolean {
  return Boolean(getHiddenAudioModule());
}
