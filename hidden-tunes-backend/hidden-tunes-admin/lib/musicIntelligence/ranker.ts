import { eligibleCandidates } from "./candidateGeneration";
import { buildEmotionalProfile } from "./emotionalProfile";
import { directionCompatibility, emotionalCompatibility, thematicCompatibility } from "./emotionalCompatibility";
import { explainScore } from "./explanation";
import { scoreJourney } from "./journeyPlanner";
import type { LabSong, RankInput, RankedCandidate, ScoreComponents } from "./types";

const round = (n: number) => Number(n.toFixed(4));
const has = (values: string[], id: string) => values.includes(id);

function userAffinity(song: LabSong, input: RankInput): number {
  const l = input.listener;
  return Math.min(1,
    (l.completions[song.id] ?? 0) * .12 + (l.replays[song.id] ?? 0) * .16 +
    (has(l.favorites, song.id) ? .34 : 0) + (has(l.librarySaves, song.id) ? .16 : 0) +
    (has(l.playlistAdds, song.id) ? .14 : 0) + (has(l.followedArtists, song.artistId) ? .18 : 0));
}

export function rankCandidates(input: RankInput): RankedCandidate[] {
  const seedProfile = input.profileCache?.get(input.seed.id) ?? buildEmotionalProfile(input.seed);
  const semanticConfidence = seedProfile.confidence;
  const recent = new Set(input.listener.recentlyPlayed);
  const immediate = new Set(input.listener.immediateSkips);
  const late = new Set(input.listener.lateSkips);
  const ranked = eligibleCandidates(input).map((song) => {
    const profile = input.profileCache?.get(song.id) ?? buildEmotionalProfile(song);
    const emotional = emotionalCompatibility(seedProfile, profile) * (semanticConfidence >= .6 ? .22 : .10);
    const thematic = thematicCompatibility(seedProfile, profile) * (semanticConfidence >= .6 ? .15 : .06);
    const direction = directionCompatibility(seedProfile, profile) * (semanticConfidence >= .6 ? .12 : .06);
    const journey = scoreJourney(input.journey, seedProfile, profile) * (semanticConfidence >= .6 ? .22 : .10);
    const genre = (song.genre.toLowerCase() === input.seed.genre.toLowerCase() ? 1 :
      song.subgenre && song.subgenre === input.seed.subgenre ? .7 : 0) * (semanticConfidence >= .6 ? .09 : .28);
    const artist = (song.artistId === input.seed.artistId ? 1 : has(input.listener.followedArtists, song.artistId) ? .55 : 0) * .035;
    const user = userAffinity(song, input) * .095;
    const energy = profile.energy != null && seedProfile.energy != null
      ? Math.max(0, 1 - Math.abs(profile.energy - seedProfile.energy) / 100) * .05 : .018;
    const freshness = recent.has(song.id) ? 0 : .06;
    const repetitionPenalty = recent.has(song.id) ? -.34 : 0;
    const skipPenalty = immediate.has(song.id) ? -.8 : late.has(song.id) ? -.1 : 0;
    const confidenceFactor = .72 + profile.confidence * .28;
    const final = (emotional + thematic + direction + journey + genre + artist + user + energy + freshness) * confidenceFactor + repetitionPenalty + skipPenalty;
    const components: ScoreComponents = Object.fromEntries(Object.entries({ emotional, thematic, direction, journey, genre, artist, user, energy, freshness, repetitionPenalty, skipPenalty, final }).map(([k, v]) => [k, round(v)])) as ScoreComponents;
    return { song, profile, components, reasons: explainScore(components) };
  }).sort((a, b) => b.components.final - a.components.final || a.song.id.localeCompare(b.song.id));

  const output: RankedCandidate[] = []; const artistCounts = new Map<string, number>(); const albumCounts = new Map<string, number>();
  for (const entry of ranked) {
    if ((artistCounts.get(entry.song.artistId) ?? 0) >= 2 || (albumCounts.get(entry.song.albumId) ?? 0) >= 2) continue;
    output.push(entry); artistCounts.set(entry.song.artistId, (artistCounts.get(entry.song.artistId) ?? 0) + 1);
    albumCounts.set(entry.song.albumId, (albumCounts.get(entry.song.albumId) ?? 0) + 1);
    if (output.length >= (input.limit ?? 10)) break;
  }
  return output;
}
