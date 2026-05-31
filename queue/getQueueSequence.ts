import type { Track } from "../types/music";
import { getNextTrack } from "./getNextTrack";

export function getQueueSequence<T extends Track>(
  startTrack: T,
  allTracks: T[],
  limit = 20
): T[] {
  const maxLength = Math.max(1, Math.floor(limit));
  const sequence: T[] = [startTrack];
  const usedIds = new Set<string>([startTrack.id]);
  let currentTrack: Track = startTrack;

  while (sequence.length < maxLength) {
    const candidates = allTracks.filter((track) => !usedIds.has(track.id));

    if (!candidates.length) {
      break;
    }

    const nextTrack = getNextTrack(currentTrack, candidates);
    if (!nextTrack) {
      break;
    }

    sequence.push(nextTrack);
    usedIds.add(nextTrack.id);
    currentTrack = nextTrack;
  }

  return sequence;
}

export { buildQueueContext } from "./buildQueueContext";
export { getNextTrack } from "./getNextTrack";
