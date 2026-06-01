import type { Track } from "../types/music";
import { scoreTrack } from "../utils/scoreTrack";
import { buildQueueContext } from "./buildQueueContext";

export function getNextTrack<T extends Track>(
  currentTrack: Track,
  candidateTracks: T[]
): T | null {
  if (!candidateTracks.length) {
    return null;
  }

  const ctx = buildQueueContext(currentTrack);
  const candidates = candidateTracks.filter(
    (track) => track.id !== currentTrack.id
  );

  if (!candidates.length) {
    return null;
  }

  const ranked = candidates
    .map((track) => ({
      track,
      score: scoreTrack(track, ctx),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return String(left.track.title || "").localeCompare(
        String(right.track.title || "")
      );
    });

  return ranked[0]?.track ?? null;
}
