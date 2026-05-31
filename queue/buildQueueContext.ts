import type { QueryContext, Track } from "../types/music";

export function buildQueueContext(currentTrack: Track): QueryContext {
  const moodTags = Array.isArray(currentTrack.emotionalTags)
    ? currentTrack.emotionalTags.filter(Boolean)
    : [];

  return {
    currentTrack,
    moodTags,
    world: undefined,
    text: undefined,
  };
}
