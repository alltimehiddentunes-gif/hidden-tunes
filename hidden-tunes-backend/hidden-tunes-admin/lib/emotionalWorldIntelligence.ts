import { createHash } from "node:crypto";
import { EMOTIONAL_INTELLIGENCE_VERSION, PUBLIC_EMOTIONAL_WORLDS, type EmotionalWorldProfile } from "@/lib/emotionalWorldRegistry";

export type IntelligenceSong = Record<string, unknown> & { id: string; title: string };
export type EmotionalWorldMatch = { worldId: string; score: number; confidence: "high" | "strong" | "broadened"; reasons: string[]; exclusionsTriggered: string[]; intelligenceVersion: string };
export type RankedWorldSong = { song: IntelligenceSong; worldScore: number; confidence: EmotionalWorldMatch["confidence"]; matchReasons: string[] };

const norm = (value: unknown) => String(value ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const includes = (value: string, token: string) => value.includes(norm(token));
const approved = (song: IntelligenceSong) => ["approved", "ready", "manual"].includes(norm(song.analysis_status));
export const isBackendPlayableSong = (song: IntelligenceSong) => [song.audio_url, song.url, song.preview_url, song.high_quality_url].some((value) => /^https?:\/\//i.test(String(value ?? "").trim()));

export function scoreSongForWorld(song: IntelligenceSong, world: EmotionalWorldProfile): EmotionalWorldMatch | null {
  const explicit = norm(`${song.emotion} ${song.atmosphere}`);
  const layer3 = norm(`${song.texture} ${song.time_of_day} ${song.vocal_feel} ${song.instrumentation}`);
  const editorial = norm(`${song.mood} ${song.tags}`);
  const genre = norm(`${song.genre} ${song.subgenre} ${song.mood_genre}`);
  const description = norm(song.description);
  const album = norm(song.album);
  const title = norm(song.title);
  const all = `${explicit} ${layer3} ${editorial} ${genre} ${description} ${album} ${title}`;
  const exclusionsTriggered = world.exclusions.filter((token) => includes(all, token));
  if (exclusionsTriggered.length) return null;
  let score = 0; const reasons = new Set<string>();
  const apply = (source: string, value: string, tokens: string[], weight: number) => tokens.forEach((token) => { if (includes(value, token)) { score += weight; reasons.add(`${source}:${token}`); } });
  apply("approved-emotion", explicit, world.primarySignals, approved(song) ? 12 : 8);
  apply("layer3", layer3, world.primarySignals, 9);
  apply("editorial", editorial, world.primarySignals, 8);
  apply("approved-emotion", explicit, world.secondarySignals, approved(song) ? 7 : 5);
  apply("layer3", layer3, world.secondarySignals, 5);
  apply("genre", genre, [...world.primarySignals, ...world.secondarySignals], 3);
  apply("description", description, world.primarySignals, 2);
  apply("album", album, world.primarySignals, 1);
  apply("title", title, world.primarySignals, 1);
  const energy = Number(song.energy);
  if (Number.isFinite(energy)) {
    if (["energetic", "motivational"].includes(world.id) && energy >= 70) { score += 5; reasons.add("audio-feature:high-energy"); }
    if (world.id === "calm" && energy <= 35) { score += 5; reasons.add("audio-feature:low-energy"); }
  }
  if (score < world.broadenedScore) return null;
  return { worldId: world.id, score, confidence: score >= world.highConfidenceScore ? "high" : score >= world.minimumScore ? "strong" : "broadened", reasons: [...reasons].slice(0, 6), exclusionsTriggered, intelligenceVersion: EMOTIONAL_INTELLIGENCE_VERSION };
}

export function classifySong(song: IntelligenceSong): EmotionalWorldMatch[] {
  const matches = PUBLIC_EMOTIONAL_WORLDS.map((world) => scoreSongForWorld(song, world)).filter((match): match is EmotionalWorldMatch => Boolean(match)).sort((a, b) => b.score - a.score || a.worldId.localeCompare(b.worldId));
  const maximum = matches[2] && matches[2].confidence === "high" && matches[2].score >= matches[0].score * 0.9 ? 3 : 2;
  return matches.slice(0, maximum);
}

export function rankWorldCatalog(songs: IntelligenceSong[], world: EmotionalWorldProfile): RankedWorldSong[] {
  const seen = new Set<string>();
  const ranked = songs.filter(isBackendPlayableSong).map((song) => ({ song, match: scoreSongForWorld(song, world) })).filter((entry): entry is { song: IntelligenceSong; match: EmotionalWorldMatch } => Boolean(entry.match)).filter((entry) => classifySong(entry.song).some((match) => match.worldId === world.id)).sort((a, b) => b.match.score - a.match.score || String(a.song.id).localeCompare(String(b.song.id)));
  const diversified: typeof ranked = []; const deferred: typeof ranked = [];
  const artistCounts = new Map<string, number>(); const albumCounts = new Map<string, number>();
  for (const entry of ranked) {
    const id = norm(entry.song.id); if (!id || seen.has(id)) continue; seen.add(id);
    const artist = norm(entry.song.artist_id); const album = norm(entry.song.album_id);
    const artistCount = artistCounts.get(artist) ?? 0; const albumCount = albumCounts.get(album) ?? 0;
    if ((artist && artistCount >= 2) || (album && albumCount >= 3)) deferred.push(entry);
    else { diversified.push(entry); if (artist) artistCounts.set(artist, artistCount + 1); if (album) albumCounts.set(album, albumCount + 1); }
  }
  return [...diversified, ...deferred].map(({ song, match }) => ({ song, worldScore: match.score, confidence: match.confidence, matchReasons: match.reasons }));
}

export function catalogFingerprint(songs: IntelligenceSong[]) {
  const fields = ["id", "created_at", "audio_url", "url", "preview_url", "high_quality_url", "genre", "subgenre", "mood", "mood_genre", "tags", "description", "album", "artist_id", "album_id", "emotion", "atmosphere", "texture", "time_of_day", "vocal_feel", "instrumentation", "energy", "analysis_status", "analysis_source"];
  return createHash("sha256").update(songs.map((song) => fields.map((field) => String(song[field] ?? "")).join(":" )).join("|")).digest("hex").slice(0, 16);
}
