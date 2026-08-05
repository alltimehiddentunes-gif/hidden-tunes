export const ENDLESS_MUSIC_LIMITS = {
  queueCap: 50,
  lowWater: 5,
  refillBatch: 10,
  candidateCap: 180,
  recentWindow: 40,
  artistCap: 2,
  albumCap: 2,
  genreCap: 6,
  discoveryRatio: 0.1,
} as const;

export type ContinuationIntent =
  | "continue"
  | "deepen"
  | "recover"
  | "uplift"
  | "contrast_gently"
  | "close_softly";

export type ContinuationUserIntent =
  | "playing"
  | "paused"
  | "stopped"
  | "interrupted"
  | "transitioning";

export type ContinuationDomain =
  | "music"
  | "radio"
  | "podcast"
  | "audiobook"
  | "educational"
  | "motivation"
  | "video"
  | "sports"
  | "unknown";

export type ContinuationSong = {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  albumId?: string;
  genre?: string;
  mood?: string;
  streamUrl?: string;
  audioUrl?: string;
  url?: string;
  isOnline?: boolean;
  isPublic?: boolean;
  mature?: boolean;
  isMature?: boolean;
  is_mature?: boolean;
  explicit?: boolean;
  content_rating?: string;
  emotionalMetadataRaw?: Record<string, unknown> | null;
  emotionalVector?: Record<string, number> | null;
  emotionalTags?: string[];
  raw?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ContinuationContext = {
  source?: string;
  artistName?: string;
  genre?: string;
  mood?: string;
  albumId?: string;
  albumTitle?: string;
  railId?: string;
  searchQuery?: string;
  [key: string]: unknown;
};

export type ContinuationSession = {
  id: string;
  generation: number;
  enabled: boolean;
  userIntent: ContinuationUserIntent;
  seedId: string;
  context: ContinuationContext;
};

export type RankedContinuation<T extends ContinuationSong> = {
  song: T;
  score: number;
  discovery: boolean;
};

export type RankingInput<T extends ContinuationSong> = {
  current: T;
  context: ContinuationContext;
  existingQueue: T[];
  recentIds: string[];
  favorites: Set<string>;
  playCounts: Map<string, number>;
  skippedIds: Set<string>;
  matureVisible: boolean;
  intent: ContinuationIntent;
};

export const TRANSITION_SCORE_WEIGHTS = {
  listener: 28,
  emotion: 30,
  context: 20,
  texture: 8,
  repetition: 10,
  freshness: 4,
} as const;

let sessionGeneration = 0;

export function createContinuationSession(
  seedId: string,
  context: ContinuationContext
): ContinuationSession {
  sessionGeneration += 1;
  return {
    id: `${sessionGeneration}:${String(seedId)}`,
    generation: sessionGeneration,
    enabled: true,
    userIntent: "playing",
    seedId: String(seedId),
    context: { ...context },
  };
}

export function shouldRefillContinuationQueue(input: {
  domain: ContinuationDomain;
  enabled: boolean;
  userIntent: ContinuationUserIntent;
  remaining: number;
  refillInFlight: boolean;
}) {
  return (
    input.domain === "music" &&
    input.enabled &&
    (input.userIntent === "playing" || input.userIntent === "transitioning") &&
    input.remaining <= ENDLESS_MUSIC_LIMITS.lowWater &&
    !input.refillInFlight
  );
}

function text(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function tag(value: unknown) {
  return text(value).replace(/[_\s]+/g, "-");
}

function number01(value: unknown, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

function metadata(song: ContinuationSong) {
  const raw = song.emotionalMetadataRaw ||
    (song.raw?.emotionalMetadata as Record<string, unknown> | undefined) ||
    (song.raw?.emotional_metadata as Record<string, unknown> | undefined) ||
    song.raw || {};
  const vector = song.emotionalVector || {};
  const rawSignalCount = [
    raw.energy,
    raw.warmth,
    raw.darkness,
    raw.vulnerability,
    raw.nostalgia,
    raw.tension,
    raw.release,
    raw.atmosphere,
    raw.emotion,
    raw.texture,
    raw.vocalFeel,
    raw.vocal_feel,
    raw.instrumentation,
  ].filter((value) => value !== null && value !== undefined && value !== "").length;
  const vectorSignalCount = Object.values(vector).filter(Number.isFinite).length;
  const tags = new Set(
    [
      ...(song.emotionalTags || []),
      raw.atmosphere,
      raw.emotion,
      raw.texture,
      raw.timeOfDay,
      raw.time_of_day,
      raw.vocalFeel,
      raw.vocal_feel,
      raw.instrumentation,
      song.mood,
    ]
      .map(tag)
      .filter(Boolean)
  );
  return {
    energy: number01(raw.energy ?? vector.energy),
    warmth: number01(raw.warmth ?? vector.warmth),
    darkness: number01(raw.darkness ?? vector.darkness),
    vulnerability: number01(raw.vulnerability ?? vector.intimacy),
    nostalgia: number01(raw.nostalgia ?? vector.nostalgia),
    tension: number01(raw.tension ?? vector.aggression),
    release: number01(raw.release ?? raw.releaseLevel ?? raw.release_level),
    tags,
    confidence: Math.min(1, (rawSignalCount + vectorSignalCount) / 8),
  };
}

function closeness(left: number, right: number) {
  return 1 - Math.abs(left - right);
}

function overlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0.5;
  let count = 0;
  left.forEach((value) => {
    if (right.has(value)) count += 1;
  });
  return count / Math.max(left.size, right.size);
}

function emotionalScore(
  current: ReturnType<typeof metadata>,
  candidate: ReturnType<typeof metadata>,
  intent: ContinuationIntent
) {
  let targetEnergy = current.energy;
  let targetWarmth = current.warmth;
  let targetTension = current.tension;
  let targetRelease = current.release;
  if (intent === "recover") {
    targetWarmth = Math.min(1, current.warmth + 0.25);
    targetRelease = Math.min(1, current.release + 0.25);
    targetTension = Math.max(0, current.tension - 0.2);
  } else if (intent === "uplift") {
    targetEnergy = Math.min(1, current.energy + 0.18);
    targetWarmth = Math.min(1, current.warmth + 0.18);
  } else if (intent === "deepen") {
    targetTension = Math.min(1, current.tension + 0.15);
    targetEnergy = Math.min(1, current.energy + 0.1);
  } else if (intent === "close_softly") {
    targetEnergy = Math.max(0, current.energy - 0.2);
    targetTension = Math.max(0, current.tension - 0.2);
  }
  const dimensions = [
    closeness(targetEnergy, candidate.energy),
    closeness(targetWarmth, candidate.warmth),
    closeness(current.darkness, candidate.darkness),
    closeness(current.vulnerability, candidate.vulnerability),
    closeness(current.nostalgia, candidate.nostalgia),
    closeness(targetTension, candidate.tension),
    closeness(targetRelease, candidate.release),
  ];
  const base = dimensions.reduce((sum, value) => sum + value, 0) / dimensions.length;
  const extremeJump = Math.abs(current.energy - candidate.energy) > 0.55 ? 0.25 : 0;
  const confidence = Math.min(current.confidence, candidate.confidence);
  return Math.max(0, (base - extremeJump) * (0.55 + confidence * 0.45));
}

function isPlayable(song: ContinuationSong) {
  return song.isOnline !== false && Boolean(song.streamUrl || song.audioUrl || song.url);
}

function isMature(song: ContinuationSong) {
  const rating = text(song.content_rating || song.raw?.content_rating);
  return Boolean(
    song.mature ||
      song.isMature ||
      song.is_mature ||
      song.explicit ||
      song.raw?.mature ||
      song.raw?.is_mature ||
      rating === "explicit" ||
      rating === "adult"
  );
}

export function rankContinuationCandidates<T extends ContinuationSong>(
  candidates: T[],
  input: RankingInput<T>
): RankedContinuation<T>[] {
  const existingIds = new Set(input.existingQueue.map((song) => String(song.id)));
  const recentIds = new Set(input.recentIds.slice(-ENDLESS_MUSIC_LIMITS.recentWindow));
  const currentProfile = metadata(input.current);
  const currentArtist = text(input.current.artist);
  const currentGenre = text(input.current.genre);
  const contextArtist = text(input.context.artistName);
  const contextGenre = text(input.context.genre);
  const contextMood = text(input.context.mood);

  const bounded = candidates.slice(0, ENDLESS_MUSIC_LIMITS.candidateCap);
  const unique = new Map<string, T>();
  bounded.forEach((song) => {
    const id = String(song.id || "");
    if (id && !unique.has(id)) unique.set(id, song);
  });

  const ranked = Array.from(unique.values())
    .filter(isPlayable)
    .filter((song) => !existingIds.has(String(song.id)))
    .filter((song) => !recentIds.has(String(song.id)))
    .filter((song) => input.matureVisible || !isMature(song))
    .map((candidate) => {
      const candidateArtist = text(candidate.artist);
      const candidateGenre = text(candidate.genre);
      const candidateMood = text(candidate.mood);
      const candidateProfile = metadata(candidate);
      const favorite = input.favorites.has(String(candidate.id));
      const plays = Math.min(5, input.playCounts.get(String(candidate.id)) || 0);
      const skipped = input.skippedIds.has(String(candidate.id));
      const listener = Math.min(1, (favorite ? 0.65 : 0) + plays * 0.07 + (candidateGenre === currentGenre ? 0.2 : 0));
      const emotion = emotionalScore(currentProfile, candidateProfile, input.intent);
      const tagContinuity = overlap(currentProfile.tags, candidateProfile.tags);
      const context = Math.min(
        1,
        (contextArtist && candidateArtist === contextArtist ? 0.45 : 0) +
          (contextGenre && candidateGenre === contextGenre ? 0.35 : 0) +
          (contextMood && candidateMood.includes(contextMood) ? 0.2 : 0) +
          (!contextArtist && candidateArtist === currentArtist ? 0.2 : 0)
      );
      const repetition = candidateArtist === currentArtist ? 0.35 : 1;
      const discovery = listener < 0.2 && context < 0.2;
      const score =
        listener * TRANSITION_SCORE_WEIGHTS.listener +
        emotion * TRANSITION_SCORE_WEIGHTS.emotion +
        context * TRANSITION_SCORE_WEIGHTS.context +
        tagContinuity * TRANSITION_SCORE_WEIGHTS.texture +
        repetition * TRANSITION_SCORE_WEIGHTS.repetition +
        (discovery ? 0.5 : 1) * TRANSITION_SCORE_WEIGHTS.freshness -
        (skipped ? 25 : 0);
      return { song: candidate, score, discovery };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score !== left.score
        ? right.score - left.score
        : String(left.song.id).localeCompare(String(right.song.id))
    );

  const artistCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const selected: RankedContinuation<T>[] = [];
  let discoveryCount = 0;
  const maxDiscovery = Math.max(1, Math.round(ENDLESS_MUSIC_LIMITS.refillBatch * ENDLESS_MUSIC_LIMITS.discoveryRatio));
  for (const entry of ranked) {
    const artist = text(entry.song.artist) || "unknown";
    const album = text(entry.song.albumId || entry.song.album) || "unknown";
    const genre = text(entry.song.genre) || "unknown";
    if ((artistCounts.get(artist) || 0) >= ENDLESS_MUSIC_LIMITS.artistCap) continue;
    if ((albumCounts.get(album) || 0) >= ENDLESS_MUSIC_LIMITS.albumCap) continue;
    if ((genreCounts.get(genre) || 0) >= ENDLESS_MUSIC_LIMITS.genreCap) continue;
    if (entry.discovery && discoveryCount >= maxDiscovery) continue;
    selected.push(entry);
    artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    albumCounts.set(album, (albumCounts.get(album) || 0) + 1);
    genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
    if (entry.discovery) discoveryCount += 1;
    if (selected.length >= ENDLESS_MUSIC_LIMITS.refillBatch) break;
  }
  return selected;
}
