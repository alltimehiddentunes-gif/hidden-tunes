import type { AppSong } from "../context/PlayerContext";

export type AudioPreloadTier =
  | "featured_card"
  | "catalog_row"
  | "hero_fallback"
  | "album_first"
  | "genre_first";

export type AudioPreloadTarget = {
  song: AppSong;
  tier: AudioPreloadTier;
};

type PlayableSongLike = {
  id?: string;
  streamUrl?: string;
  url?: string;
  audioUrl?: string;
  audio_url?: string;
  audio?: unknown;
};

export function isPlayableForAudioPreload(song?: PlayableSongLike | null) {
  if (!song) return false;

  const candidates = [
    song.streamUrl,
    song.url,
    song.audioUrl,
    song.audio_url,
    song.audio,
  ];

  return candidates.some((value) => {
    if (typeof value === "string") return value.trim().length > 0;
    return Boolean(value);
  });
}

export function pickFirstPlayableTrack<T extends PlayableSongLike>(
  tracks: T[]
): T | null {
  return tracks.find((track) => isPlayableForAudioPreload(track)) || null;
}

export function pickHomeAudioPreloadTarget(options: {
  featuredCardSongs: PlayableSongLike[];
  visibleCatalogSongs: PlayableSongLike[];
  heroFallback?: PlayableSongLike | null;
}): AudioPreloadTarget | null {
  const featured = pickFirstPlayableTrack(options.featuredCardSongs);

  if (featured) {
    return {
      song: featured as AppSong,
      tier: "featured_card",
    };
  }

  const catalog = pickFirstPlayableTrack(options.visibleCatalogSongs);

  if (catalog) {
    return {
      song: catalog as AppSong,
      tier: "catalog_row",
    };
  }

  if (isPlayableForAudioPreload(options.heroFallback)) {
    return {
      song: options.heroFallback as AppSong,
      tier: "hero_fallback",
    };
  }

  return null;
}

export function logAudioPreloadTargetSelected(
  screen: string,
  target: AudioPreloadTarget,
  songId?: string
) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;

  console.log("[audio-preload] preload-target-selected", {
    screen,
    tier: target.tier,
    songId: songId || target.song.id,
  });
}

export function logAudioPreloadSkip(
  reason: string,
  details: Record<string, string | number | boolean | undefined> = {}
) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;

  console.log("[audio-preload] preload-skip", {
    reason,
    ...details,
  });
}
