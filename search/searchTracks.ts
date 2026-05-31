import type { Track } from "../types/music";
import { scoreTrack } from "../utils/scoreTrack";
import { buildSearchContext } from "./buildSearchContext";
import { parseSearchQuery } from "./searchQueryParser";

type ScoredTrack<T extends Track> = {
  track: T;
  score: number;
};

export function searchTracks<T extends Track>(
  tracks: T[],
  rawQuery: string
): T[] {
  const parsed = parseSearchQuery(rawQuery);
  const query = parsed.rawQuery.trim();

  if (!query || !tracks.length) {
    return [...tracks];
  }

  const ctx = buildSearchContext(parsed);

  const scored: ScoredTrack<T>[] = tracks.map((track) => ({
    track,
    score: scoreTrack(track, ctx),
  }));

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return String(left.track.title || "").localeCompare(
      String(right.track.title || "")
    );
  });

  return scored.filter((entry) => entry.score > 0).map((entry) => entry.track);
}

export { parseSearchQuery, buildSearchContext };
