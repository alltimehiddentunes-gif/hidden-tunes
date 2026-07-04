import { NativeModules } from "react-native";

export type HiddenAudioStatus = {
  position: number;
  duration: number;
  isPlaying: boolean;
  playbackState?: string;
};

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
  pause(): Promise<void>;
  seekTo?(seconds: number): Promise<void>;
  getState?(): Promise<Record<string, unknown>>;
  getProgress?(): Promise<Record<string, unknown>>;
};

const HiddenAudioNative = (NativeModules.HiddenAudioModule ||
  NativeModules.HiddenAudio) as HiddenAudioNativeModule | undefined;

let lastLoadedUrl = "";

function safeString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const clean = value.trim();
  return clean || fallback;
}

function buildNativeTrack(url: string): HiddenAudioNativeTrack {
  const cleanUrl = safeString(url, "");
  const idSource = cleanUrl || "hidden-audio-track";
  const safeId = idSource
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return {
    id: safeId || "hidden-audio-track",
    url: cleanUrl,
    title: "Hidden Tunes",
    artist: "Hidden Tunes",
    album: "",
    artworkUrl: "",
    durationSeconds: 0,
  };
}

export function isHiddenAudioNativeEngineAvailable(): boolean {
  return Boolean(HiddenAudioNative?.loadTrack);
}

function requireNativeModule(): HiddenAudioNativeModule {
  if (!HiddenAudioNative?.loadTrack) {
    throw new Error(
      "HiddenAudio native module is not available. Use a dev client or preview build with HiddenAudio linked."
    );
  }

  return HiddenAudioNative;
}

async function getNativeStatus(): Promise<HiddenAudioStatus> {
  const native = HiddenAudioNative;
  if (!native) {
    return { position: 0, duration: 0, isPlaying: false, playbackState: "unavailable" };
  }

  const [state, progress] = await Promise.all([
    native.getState?.().catch(() => null),
    native.getProgress?.().catch(() => null),
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

  const positionMillis = Math.max(
    0,
    Math.floor((Number.isFinite(positionSeconds) ? positionSeconds : 0) * 1000)
  );
  const durationMillis = Math.max(
    0,
    Math.floor((Number.isFinite(durationSeconds) ? durationSeconds : 0) * 1000)
  );

  return {
    position: positionMillis,
    duration: durationMillis,
    isPlaying:
      isPlayingValue === true ||
      isPlayingValue === 1 ||
      isPlayingValue === "1" ||
      status === "playing" ||
      status === "buffering",
    playbackState: status || undefined,
  };
}

const HiddenAudio = {
  load(url: string) {
    const native = requireNativeModule();
    const track = buildNativeTrack(url);
    lastLoadedUrl = track.url;
    return native.loadTrack(track);
  },
  async play() {
    const native = requireNativeModule();
    if (!lastLoadedUrl) {
      throw new Error("HiddenAudio cannot play without a loaded track");
    }
    await native.play();
  },
  pause() {
    return requireNativeModule().pause();
  },
  seek(positionMs: number) {
    const native = requireNativeModule();
    if (typeof native.seekTo !== "function") {
      return Promise.resolve();
    }
    return native.seekTo(Math.max(0, positionMs / 1000));
  },
  getStatus() {
    return getNativeStatus();
  },
};

export default HiddenAudio;
