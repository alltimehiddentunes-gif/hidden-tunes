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

export type HiddenAudioStatus = {
  positionMillis: number;
  durationMillis: number;
  isPlaying: boolean;
};

export interface HiddenAudioEngine {
  load(url: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  getStatus(): Promise<HiddenAudioStatus>;
  updateNowPlaying(metadata: HiddenAudioNowPlayingMetadata): Promise<void>;
}

type HiddenAudioNativeModule = {
  load(url: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekTo?(seconds: number): Promise<void>;
  getState?(): Promise<Record<string, unknown>>;
  getProgress?(): Promise<Record<string, unknown>>;
  updateNowPlaying(metadata: HiddenAudioNowPlayingMetadata): Promise<void>;
};

const STUB_MESSAGE = "[hidden_audio] not implemented on this platform";

const HiddenAudioNative = (NativeModules.HiddenAudioModule ||
  NativeModules.HiddenAudio) as HiddenAudioNativeModule | undefined;

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
  async seek(positionMs: number): Promise<void> {
    if (!HiddenAudioNative?.seekTo) {
      warnStub("seek");
      return;
    }
    await HiddenAudioNative.seekTo(Math.max(0, positionMs / 1000));
  },
  async getStatus(): Promise<HiddenAudioStatus> {
    if (!HiddenAudioNative) {
      warnStub("getStatus");
      return { positionMillis: 0, durationMillis: 0, isPlaying: false };
    }

    const [state, progress] = await Promise.all([
      HiddenAudioNative.getState?.().catch(() => null),
      HiddenAudioNative.getProgress?.().catch(() => null),
    ]);

    const progressMap = (progress || {}) as Record<string, unknown>;
    const stateMap = (state || {}) as Record<string, unknown>;
    const positionSeconds = Number(
      progressMap.positionSeconds ?? progressMap.currentTime ?? 0
    );
    const durationSeconds = Number(
      progressMap.durationSeconds ?? progressMap.duration ?? 0
    );
    const isPlayingValue = progressMap.isPlaying;
    const status = String(stateMap.status || "");

    return {
      positionMillis: Math.max(
        0,
        Math.floor((Number.isFinite(positionSeconds) ? positionSeconds : 0) * 1000)
      ),
      durationMillis: Math.max(
        0,
        Math.floor((Number.isFinite(durationSeconds) ? durationSeconds : 0) * 1000)
      ),
      isPlaying:
        isPlayingValue === true ||
        isPlayingValue === 1 ||
        isPlayingValue === "1" ||
        status === "playing",
    };
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
