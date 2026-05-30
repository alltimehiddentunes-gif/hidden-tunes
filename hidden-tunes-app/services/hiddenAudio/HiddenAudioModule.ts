import { NativeEventEmitter, NativeModules } from "react-native";

import type {
  HiddenAudioEvent,
  HiddenAudioProgress,
  HiddenAudioState,
  HiddenAudioTrack,
  HiddenAudioUnsubscribe,
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
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
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

export function subscribeHiddenAudioNativeEvents(
  listener: (event: HiddenAudioEvent) => void
): HiddenAudioUnsubscribe {
  const nativeModule = getHiddenAudioModule();
  if (!nativeModule) return () => {};

  const emitter = new NativeEventEmitter(nativeModule);
  const subscriptions = [
    emitter.addListener("HiddenAudioState", (event?: HiddenAudioEvent) => {
      if (event) listener(event);
    }),
    emitter.addListener("HiddenAudioProgress", (event?: HiddenAudioEvent) => {
      if (event) listener(event);
    }),
    emitter.addListener("HiddenAudioDiagnostic", (event?: HiddenAudioEvent) => {
      if (event) listener(event);
    }),
  ];

  return () => {
    subscriptions.forEach((subscription) => subscription.remove());
  };
}
