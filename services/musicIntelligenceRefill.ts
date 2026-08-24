export type MusicJourneyIntent = "CONTINUE" | "DEEPEN" | "RECOVER" | "UPLIFT";
export type MusicRecommendationRequest = {
  seedSongId: string;
  journeyIntent: MusicJourneyIntent;
  limit: number;
  generationToken: string;
  recentSongIds: string[];
  recentlySkippedSongIds: string[];
  manuallyQueuedSongIds: string[];
  listener?: {
    favorites?: string[];
    librarySaves?: string[];
    playlistAdds?: string[];
    followedArtists?: string[];
  };
};
export type MusicRecommendation = {
  songId: string;
  position: number;
  finalScore: number;
  profileConfidence: number;
  journeyCompatibility: number;
  rankingVersion: string;
};
export type MusicRecommendationResult = {
  seedSongId: string;
  effectiveIntent: MusicJourneyIntent;
  generationToken: string;
  rankingVersion: string;
  recommendations: MusicRecommendation[];
};

type MusicRecommendationHttpResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

function boundedIds(values: string[]) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .slice(0, 50);
}

export function normalizeMusicRecommendationRequest(
  input: MusicRecommendationRequest
): MusicRecommendationRequest {
  return {
    ...input,
    limit: Math.max(1, Math.min(20, Math.trunc(input.limit || 10))),
    recentSongIds: boundedIds(input.recentSongIds),
    recentlySkippedSongIds: boundedIds(input.recentlySkippedSongIds),
    manuallyQueuedSongIds: boundedIds(input.manuallyQueuedSongIds),
    listener: input.listener
      ? {
          favorites: boundedIds(input.listener.favorites || []),
          librarySaves: boundedIds(input.listener.librarySaves || []),
          playlistAdds: boundedIds(input.listener.playlistAdds || []),
          followedArtists: boundedIds(input.listener.followedArtists || []),
        }
      : undefined,
  };
}

export function parseMusicRecommendationResponse(
  value: unknown,
  input: MusicRecommendationRequest
) {
  if (!value || typeof value !== "object") return null;
  const body = value as Partial<MusicRecommendationResult> & { success?: boolean };
  if (
    body.success !== true ||
    body.seedSongId !== input.seedSongId ||
    body.generationToken !== input.generationToken ||
    !Array.isArray(body.recommendations) ||
    typeof body.rankingVersion !== "string"
  ) return null;
  const seen = new Set<string>();
  const recommendations = body.recommendations.slice(0, 20).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as MusicRecommendation;
    const songId = String(item.songId || "").trim();
    if (!songId || seen.has(songId)) return [];
    seen.add(songId);
    return [{
      songId,
      position: Number(item.position) || seen.size,
      finalScore: Number(item.finalScore) || 0,
      profileConfidence: Number(item.profileConfidence) || 0,
      journeyCompatibility: Number(item.journeyCompatibility) || 0,
      rankingVersion: String(item.rankingVersion || body.rankingVersion),
    }];
  });
  if (!recommendations.length) return null;
  return {
    seedSongId: body.seedSongId,
    effectiveIntent: body.effectiveIntent || input.journeyIntent,
    generationToken: body.generationToken,
    rankingVersion: body.rankingVersion,
    recommendations,
  } as MusicRecommendationResult;
}

export async function requestMusicRecommendationsOverTransport(
  input: MusicRecommendationRequest,
  transport: (
    normalized: MusicRecommendationRequest
  ) => Promise<MusicRecommendationHttpResponse>
) {
  const normalized = normalizeMusicRecommendationRequest(input);
  try {
    const response = await transport(normalized);
    if (!response.ok) return null;
    return parseMusicRecommendationResponse(await response.json(), normalized);
  } catch {
    return null;
  }
}

export function isMusicRecommendationAuthSnapshotCurrent(
  expected: { namespace: string; epoch: number },
  live: { namespace: string; epoch: number }
) {
  return expected.namespace === live.namespace && expected.epoch === live.epoch;
}

export function isCurrentMusicRecommendationResult(
  result: MusicRecommendationResult,
  expected: {
    seedSongId: string;
    generationToken: string;
    liveSeedSongId: string | null;
    liveGenerationToken: string;
  }
) {
  return (
    result.seedSongId === expected.seedSongId &&
    result.generationToken === expected.generationToken &&
    expected.liveSeedSongId === expected.seedSongId &&
    expected.liveGenerationToken === expected.generationToken
  );
}

export function selectServerRecommendedSongs<T extends { id: string }>(
  result: MusicRecommendationResult,
  candidates: readonly T[],
  excludedSongIds: ReadonlySet<string>,
  limit: number
) {
  const candidateById = new Map<string, T>();
  candidates.forEach((candidate) => {
    const id = String(candidate.id || "").trim();
    if (id && !candidateById.has(id)) candidateById.set(id, candidate);
  });

  const selected: T[] = [];
  const selectedIds = new Set<string>();
  for (const recommendation of result.recommendations) {
    const id = String(recommendation.songId || "").trim();
    const candidate = candidateById.get(id);
    if (!candidate || excludedSongIds.has(id) || selectedIds.has(id)) continue;
    selectedIds.add(id);
    selected.push(candidate);
    if (selected.length >= Math.max(0, limit)) break;
  }
  return selected;
}
