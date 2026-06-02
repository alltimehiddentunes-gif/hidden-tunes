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

type HiddenAudioNativeTrack = {
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationSeconds: number;
};

type HiddenAudioNativeModule = {
  loadTrack(track: HiddenAudioNativeTrack): Promise<void>;
  play(): Promise<void>;
  resume?: () => Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekTo?(seconds: number): Promise<void>;
  getState?(): Promise<Record<string, unknown>>;
  getProgress?(): Promise<Record<string, unknown>>;
};

const STUB_MESSAGE = "[hidden_audio] not implemented on this platform";

const HiddenAudioNative = (NativeModules.HiddenAudioModule ||
  NativeModules.HiddenAudio) as HiddenAudioNativeModule | undefined;

let pendingNowPlayingMetadata: HiddenAudioNowPlayingMetadata | null = null;
let lastLoadedUrl = "";

function warnStub(method: string): void {
  console.warn(`${STUB_MESSAGE} (${method})`);
}

function safeString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const clean = value.trim();
  return clean || fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildNativeTrack(url: string): HiddenAudioNativeTrack {
  const metadata = pendingNowPlayingMetadata;
  const cleanUrl = safeString(url, "");
  const idSource = cleanUrl || metadata?.title || "hidden-audio-track";
  const safeId = idSource
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return {
    id: safeId || "hidden-audio-track",
    url: cleanUrl,
    title: safeString(metadata?.title, "Hidden Tunes"),
    artist: safeString(metadata?.artist, "Hidden Tunes"),
    album: safeString(metadata?.album, ""),
    artworkUrl: "",
    durationSeconds: safeNumber(metadata?.duration, 0),
  };
}

export function isHiddenAudioNativeEngineAvailable(): boolean {
  return Platform.OS === "ios" && Boolean(HiddenAudioNative?.loadTrack);
}

export const hiddenAudioBridge: HiddenAudioEngine = {
  async load(url: string): Promise<void> {
    if (!HiddenAudioNative?.loadTrack) {
      warnStub("loadTrack");
      return;
    }

    const track = buildNativeTrack(url);
    lastLoadedUrl = track.url;
    console.log("hidden_audio_load_track_start", {
      id: track.id,
      hasUrl: Boolean(track.url),
    });
    await HiddenAudioNative.loadTrack(track);
    console.log("hidden_audio_load_track_success", { id: track.id });
  },
  async play(): Promise<void> {
    if (!HiddenAudioNative) {
      warnStub("play");
      return;
    }

    console.log("hidden_audio_play_start", { hasLoadedUrl: Boolean(lastLoadedUrl) });
    await HiddenAudioNative.play();
    console.log("hidden_audio_play_success");
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
    lastLoadedUrl = "";
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
    const status = String(stateMap.status || progressMap.status || "");

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
        status === "playing" ||
        status === "buffering",
    };
  },
  async updateNowPlaying(
    metadata: HiddenAudioNowPlayingMetadata
  ): Promise<void> {
    pendingNowPlayingMetadata = metadata;
  },
};
