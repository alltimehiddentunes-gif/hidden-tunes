import type { HiddenTunesTrack, Track } from "../types/music";
import { normalizeEmotionalMetadata } from "../utils/normalizeEmotionalMetadata";

export function hydrateTrack<T extends HiddenTunesTrack>(track: T): Track & T {
  const emotional = normalizeEmotionalMetadata(track);

  return {
    ...track,
    emotionalMetadataRaw: emotional.emotionalMetadataRaw,
    emotionalVector: emotional.emotionalVector,
    emotionalTags: emotional.emotionalTags,
  };
}

export function hydrateTracks<T extends HiddenTunesTrack>(
  tracks: T[]
): Array<Track & T> {
  return tracks.map((track) => hydrateTrack(track));
}

export function hydrateTrackIfNeeded<T extends Track>(track: T): T {
  if (
    track.emotionalVector !== undefined ||
    track.emotionalTags !== undefined ||
    track.emotionalMetadataRaw !== undefined
  ) {
    return track;
  }

  return hydrateTrack(track) as T;
}

export function hydrateTracksIfNeeded<T extends Track>(tracks: T[]): T[] {
  return tracks.map((track) => hydrateTrackIfNeeded(track));
}
