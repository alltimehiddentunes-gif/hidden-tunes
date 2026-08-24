import type { LabSong, RankInput } from "./types";

export const DEFAULT_CANDIDATE_LIMIT = 160;

export function eligibleCandidates(input: RankInput): LabSong[] {
  const excluded = new Set([input.seed.id, ...(input.existingQueueIds ?? [])]);
  const seen = new Set<string>();
  const skipped = new Set(input.listener.immediateSkips);
  const eligible = input.candidates.filter((song) => {
    if (!song.id || seen.has(song.id) || excluded.has(song.id)) return false;
    seen.add(song.id);
    if (!song.playable || !song.published) return false;
    if (!input.allowMature && song.maturity === "mature") return false;
    return true;
  });
  const nonSkipped = eligible.filter((song) => !skipped.has(song.id));
  const pool = nonSkipped.length >= Math.min(input.limit ?? 10, 10) ? nonSkipped : eligible;
  return pool.slice(0, input.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT);
}

export function appendAutoQueueAfterManual<T>(manualQueue: T[], autoQueue: T[]): T[] {
  return [...manualQueue, ...autoQueue];
}
