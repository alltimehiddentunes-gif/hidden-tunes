/**
 * Phase 6 JS bridge for hidden_audio native iOS engine.
 * Used from the hidden-audio POC screen and PlayerContext when
 * USE_NATIVE_HIDDEN_AUDIO_ON_IOS is enabled.
 */

import { NativeModules, Platform } from "react-native";

export interface HiddenAudioNowPlayingMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  position: number;
}

export interface HiddenAudioEngine {
  load(url: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  updateNowPlaying(metadata: HiddenAudioNowPlayingMetadata): Promise<void>;
}

type HiddenAudioNativeModule = {
  load(url: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  updateNowPlaying(metadata: HiddenAudioNowPlayingMetadata): Promise<void>;
};

const STUB_MESSAGE = "[hidden_audio] not implemented on this platform";

const HiddenAudioNative = NativeModules.HiddenAudio as
  | HiddenAudioNativeModule
  | undefined;

function warnStub(method: string): void {
  console.warn(`${STUB_MESSAGE} (${method})`);
}

export function isHiddenAudioNativeEngineAvailable(): boolean {
  return Platform.OS === "ios" && Boolean(HiddenAudioNative);
}

export const hiddenAudioBridge: HiddenAudioEngine = {
  async load(url: string): Promise<void> {
    if (!HiddenAudioNative) {
      warnStub("load");
      return;
    }
    await HiddenAudioNative.load(url);
  },
  async play(): Promise<void> {
    if (!HiddenAudioNative) {
      warnStub("play");
      return;
    }
    await HiddenAudioNative.play();
  },
  async pause(): Promise<void> {
    if (!HiddenAudioNative) {
      warnStub("pause");
      return;
    }
    await HiddenAudioNative.pause();
  },
  async stop(): Promise<void> {
    if (!HiddenAudioNative) {
      warnStub("stop");
      return;
    }
    await HiddenAudioNative.stop();
  },
  async seek(_positionMs: number): Promise<void> {
    warnStub("seek");
  },
  async updateNowPlaying(
    metadata: HiddenAudioNowPlayingMetadata
  ): Promise<void> {
    if (!HiddenAudioNative) {
      warnStub("updateNowPlaying");
      return;
    }
    await HiddenAudioNative.updateNowPlaying(metadata);
  },
};
