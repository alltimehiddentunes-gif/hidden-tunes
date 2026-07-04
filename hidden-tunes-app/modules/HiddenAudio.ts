import { NativeModules } from "react-native";

import { isHttpsArtworkUrl } from "../utils/artwork";

export type HiddenAudioStatus = {
  position: number;
  duration: number;
  isPlaying: boolean;
  playbackState?: string;
};

export type HiddenAudioTrackMetadata = {
  id?: string;
  title?: string;
  artist?: string;
  artistName?: string;
  artist_name?: string;
  album?: string;
  artwork_url?: string;
  cover_url?: string;
  artwork?: unknown;
  image?: unknown;
  duration?: number | string;
  duration_seconds?: number | string;
  duration_ms?: number | string;
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

function safeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function pickNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const clean = safeString(value);
    if (clean) return clean;
  }
  return "";
}

function pickArtworkUrl(metadata?: HiddenAudioTrackMetadata | null): string {
  if (!metadata) return "";

  const directCandidates = [
    metadata.artwork_url,
    metadata.cover_url,
    typeof metadata.artwork === "string" ? metadata.artwork : null,
    typeof metadata.image === "string" ? metadata.image : null,
  ];

  for (const value of directCandidates) {
    if (typeof value === "string" && isHttpsArtworkUrl(value)) {
      return value.trim();
    }
  }

  for (const value of [metadata.artwork, metadata.image]) {
    if (!value || typeof value !== "object") continue;

    const uri = (value as { uri?: unknown }).uri;
    if (typeof uri === "string" && isHttpsArtworkUrl(uri)) {
      return uri.trim();
    }
  }

  return "";
}

function resolveDurationSeconds(metadata?: HiddenAudioTrackMetadata | null): number {
  if (!metadata) return 0;

  const durationSeconds = Number(metadata.duration_seconds);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return durationSeconds;
  }

  const durationMs = Number(metadata.duration_ms);
  if (Number.isFinite(durationMs) && durationMs > 0) {
    return durationMs / 1000;
  }

  const duration = Number(metadata.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  if (metadata.duration_ms !== undefined && metadata.duration_seconds === undefined) {
    return duration / 1000;
  }

  return duration > 10_000 ? duration / 1000 : duration;
}

function buildTrackId(
  metadata: HiddenAudioTrackMetadata | null | undefined,
  url: string
): string {
  const songId = safeString(metadata?.id);
  if (songId) return songId;

  const idSource = url || safeString(metadata?.title);
  if (!idSource) return "hidden-audio-track";

  return (
    idSource
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "hidden-audio-track"
  );
}

export function mapSongToHiddenAudioTrack(
  url: string,
  metadata?: HiddenAudioTrackMetadata | null
): HiddenAudioNativeTrack {
  const cleanUrl = safeString(url);

  return {
    id: buildTrackId(metadata, cleanUrl),
    url: cleanUrl,
    title: safeString(metadata?.title),
    artist: pickNonEmptyString(
      metadata?.artistName,
      metadata?.artist,
      metadata?.artist_name
    ),
    album: safeString(metadata?.album),
    artworkUrl: pickArtworkUrl(metadata),
    durationSeconds: resolveDurationSeconds(metadata),
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
  load(url: string, metadata?: HiddenAudioTrackMetadata | null) {
    const native = requireNativeModule();
    const track = mapSongToHiddenAudioTrack(url, metadata);
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
