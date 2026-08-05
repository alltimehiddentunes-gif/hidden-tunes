import AsyncStorage from "@react-native-async-storage/async-storage";

export const CARPLAY_PREFERENCE_STORAGE_KEY = "hidden_tunes_carplay_preferences_v1";
export const CARPLAY_PREFERENCE_CAPS = {
  genres: 12, moods: 12, artists: 20, recentIds: 30, favoriteIds: 30,
  podcastTokens: 16, radioIds: 16, unfinishedIds: 12,
} as const;
let lastPersistedSignature = "";
let lastRankingKey = "";
let lastRankedMusic: Rankable[] = [];

export type CarPlayPreferenceSnapshot = {
  version: 1; genres: string[]; moods: string[]; artists: string[];
  recentIds: string[]; favoriteIds: string[]; repeatWeights: Record<string, number>;
  podcastTokens: string[]; radioIds: string[]; unfinishedIds: string[];
  discoveryStyle: "familiar" | "balanced" | "adventurous";
  updatedAt: number; signature: string;
};
type PreferenceInput = {
  genres?: unknown[]; moods?: unknown[]; artists?: unknown[];
  recents?: Array<{ id?: unknown; playCount?: unknown }>;
  favorites?: unknown[]; podcastTokens?: unknown[]; radioIds?: unknown[];
  unfinishedIds?: unknown[]; discoveryStyle?: unknown; updatedAt?: number;
};

const clean = (value: unknown) => String(value || "").trim().toLowerCase().slice(0, 80);
function bounded(values: unknown[] | undefined, cap: number) {
  return [...new Set((values || []).map(clean).filter(Boolean))].slice(0, cap);
}
function signatureFor(value: Omit<CarPlayPreferenceSnapshot, "signature" | "updatedAt">) {
  const input = JSON.stringify(value); let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return `cp1:${(hash >>> 0).toString(16)}`;
}

export function buildCarPlayPreferenceSnapshot(input: PreferenceInput): CarPlayPreferenceSnapshot {
  const recents = (input.recents || []).slice(0, CARPLAY_PREFERENCE_CAPS.recentIds);
  const core = {
    version: 1 as const,
    genres: bounded(input.genres, CARPLAY_PREFERENCE_CAPS.genres),
    moods: bounded(input.moods, CARPLAY_PREFERENCE_CAPS.moods),
    artists: bounded(input.artists, CARPLAY_PREFERENCE_CAPS.artists),
    recentIds: bounded(recents.map((item) => item.id), CARPLAY_PREFERENCE_CAPS.recentIds),
    favoriteIds: bounded(input.favorites, CARPLAY_PREFERENCE_CAPS.favoriteIds),
    repeatWeights: Object.fromEntries(recents.map((item) => [clean(item.id),
      Math.max(1, Math.min(10, Math.floor(Number(item.playCount) || 1)))]).filter(([id]) => id)),
    podcastTokens: bounded(input.podcastTokens, CARPLAY_PREFERENCE_CAPS.podcastTokens),
    radioIds: bounded(input.radioIds, CARPLAY_PREFERENCE_CAPS.radioIds),
    unfinishedIds: bounded(input.unfinishedIds, CARPLAY_PREFERENCE_CAPS.unfinishedIds),
    discoveryStyle: (["familiar", "adventurous"] as string[]).includes(String(input.discoveryStyle))
      ? input.discoveryStyle as "familiar" | "adventurous" : "balanced" as const,
  };
  return { ...core, updatedAt: Math.max(0, Math.floor(input.updatedAt || Date.now())),
    signature: signatureFor(core) };
}

export async function persistCarPlayPreferenceSnapshot(snapshot: CarPlayPreferenceSnapshot) {
  if (snapshot.signature === lastPersistedSignature) return;
  await AsyncStorage.setItem(CARPLAY_PREFERENCE_STORAGE_KEY, JSON.stringify(snapshot));
  lastPersistedSignature = snapshot.signature;
}
export function parseCarPlayPreferenceSnapshot(raw: string | null | undefined) {
  try {
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CarPlayPreferenceSnapshot;
    const rebuilt = buildCarPlayPreferenceSnapshot({
      ...parsed, recents: parsed.recentIds.map((id) => ({ id, playCount: parsed.repeatWeights[id] })),
      favorites: parsed.favoriteIds,
    });
    return rebuilt.signature === parsed.signature ? { ...rebuilt, updatedAt: parsed.updatedAt } : null;
  } catch { return null; }
}
export async function hydrateCarPlayPreferenceSnapshot() {
  try {
    const raw = await AsyncStorage.getItem(CARPLAY_PREFERENCE_STORAGE_KEY);
    const parsed = parseCarPlayPreferenceSnapshot(raw);
    if (parsed) lastPersistedSignature = parsed.signature;
    return parsed;
  } catch { return null; }
}

type Rankable = { id?: unknown; mediaId?: unknown; artist?: unknown; artistId?: unknown;
  genre?: unknown; mood?: unknown; createdAt?: unknown; updatedAt?: unknown; url?: unknown; streamUrl?: unknown };
export function selectDiverseCarPlayMusic<T extends Rankable>(candidates: T[], limit = 12) {
  const artists = new Map<string, number>(); const genres = new Map<string, number>(); const out: T[] = [];
  for (const song of candidates.slice(0, 80)) {
    const artist = clean(song.artistId || song.artist); const genre = clean(song.genre);
    if ((artist && (artists.get(artist) || 0) >= 2) || (genre && (genres.get(genre) || 0) >= 5)) continue;
    out.push(song); if (artist) artists.set(artist, (artists.get(artist) || 0) + 1);
    if (genre) genres.set(genre, (genres.get(genre) || 0) + 1);
    if (out.length >= limit) break;
  }
  return out;
}
export function rankCarPlayMusic<T extends Rankable>(candidates: T[], prefs: CarPlayPreferenceSnapshot, limit = 12) {
  const boundedCandidates = candidates.slice(0, 80);
  const rankingKey = `${prefs.signature}:${limit}:${boundedCandidates.map((song) => [
    clean(song.id || song.mediaId), clean(song.artistId || song.artist), clean(song.genre), clean(song.mood),
    clean(song.updatedAt || song.createdAt),
  ].join(":")).join("|")}`;
  if (rankingKey === lastRankingKey) return lastRankedMusic as T[];
  const favorites = new Set(prefs.favoriteIds); const recents = new Set(prefs.recentIds);
  const artists = new Set(prefs.artists); const genres = new Set(prefs.genres); const moods = new Set(prefs.moods);
  const referenceTime = boundedCandidates.reduce((latest, song) => {
    const stamp = new Date(String(song.updatedAt || song.createdAt || "")).getTime();
    return Number.isFinite(stamp) ? Math.max(latest, stamp) : latest;
  }, 0);
  const scored = boundedCandidates.map((song, index) => {
    const id = clean(song.id || song.mediaId); const artist = clean(song.artistId || song.artist);
    const genre = clean(song.genre); const mood = clean(song.mood);
    const repeat = prefs.repeatWeights[id] || 0;
    const stamp = new Date(String(song.updatedAt || song.createdAt || "")).getTime();
    const ageDays = referenceTime && Number.isFinite(stamp) ? Math.max(0, (referenceTime - stamp) / 86_400_000) : Infinity;
    const freshness = ageDays <= 7 ? 8 : ageDays <= 30 ? 4 : 0;
    const score = (favorites.has(id) ? 120 : 0) + repeat * 10 + (artists.has(artist) ? 28 : 0)
      + (genres.has(genre) ? 24 : 0) + (moods.has(mood) ? 18 : 0) + (recents.has(id) ? 6 : 0)
      + freshness;
    return { song, id, artist, genre, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const discoveryRatio = prefs.discoveryStyle === "adventurous" ? .15 : prefs.discoveryStyle === "familiar" ? .05 : .1;
  const discoveryCount = Math.max(1, Math.floor(Math.min(limit, scored.length) * discoveryRatio));
  const relevant = scored.filter((row) => row.score > 0);
  const discovery = scored.filter((row) => row.score === 0).slice(0, discoveryCount);
  const ordered = [...relevant, ...discovery, ...scored.filter((row) => !relevant.includes(row) && !discovery.includes(row))];
  const artistCounts = new Map<string, number>(); const genreCounts = new Map<string, number>(); const out: T[] = [];
  for (const row of ordered) {
    if (row.artist && (artistCounts.get(row.artist) || 0) >= 2) continue;
    if (row.genre && (genreCounts.get(row.genre) || 0) >= 5) continue;
    out.push(row.song); if (row.artist) artistCounts.set(row.artist, (artistCounts.get(row.artist) || 0) + 1);
    if (row.genre) genreCounts.set(row.genre, (genreCounts.get(row.genre) || 0) + 1);
    if (out.length >= limit) break;
  }
  lastRankingKey = rankingKey; lastRankedMusic = out;
  return out;
}

export function allocateCarPlayRegistry<T extends { mediaId: string }>(
  buckets: Array<{ priority: number; items: T[]; quota: number }>, cap = 80
) {
  const ordered = [...buckets].sort((a, b) => a.priority - b.priority); const seen = new Set<string>(); const out: T[] = [];
  const take = (items: T[], count: number) => { for (const item of items) {
    if (out.length >= cap || count <= 0) break; if (!item.mediaId || seen.has(item.mediaId)) continue;
    seen.add(item.mediaId); out.push(item); count -= 1;
  } };
  for (const bucket of ordered) take(bucket.items, bucket.quota);
  for (const bucket of ordered) take(bucket.items, cap - out.length);
  return out;
}
