import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { EMOTIONAL_INTELLIGENCE_VERSION, PUBLIC_EMOTIONAL_WORLDS, getEmotionalWorld } from "@/lib/emotionalWorldRegistry";
import { catalogFingerprint, rankWorldCatalog, type IntelligenceSong } from "@/lib/emotionalWorldIntelligence";

const SONG_FIELDS = "id,title,artist_id,album_id,genre,mood,duration,duration_seconds,cover_url,artwork_url,created_at,is_public,audio_url,url,energy,tempo_bpm,atmosphere,emotion,texture,time_of_day,vocal_feel,instrumentation,analysis_status,analysis_source";
let cache: { expiresAt: number; songs: IntelligenceSong[]; catalogVersion: string } | null = null;

async function loadSongs() {
  if (cache && cache.expiresAt > Date.now()) return cache;
  const { data, error } = await supabaseAdmin.from("songs").select(SONG_FIELDS).order("id", { ascending: true }).limit(10000);
  if (error) throw error;
  const songs = (data ?? []).filter((song) => song.is_public !== false) as IntelligenceSong[];
  cache = { expiresAt: Date.now() + 5 * 60_000, songs, catalogVersion: catalogFingerprint(songs) };
  return cache;
}
export function invalidateEmotionalWorldCache() { cache = null; }

export async function loadEmotionalWorldRegistry() {
  const catalog = await loadSongs(); const generatedAt = new Date().toISOString();
  return { intelligenceVersion: EMOTIONAL_INTELLIGENCE_VERSION, catalogVersion: catalog.catalogVersion, generatedAt, worlds: PUBLIC_EMOTIONAL_WORLDS.map((world) => { const ranked = rankWorldCatalog(catalog.songs, world); return { id: world.id, name: world.name, description: world.description, family: world.family, status: world.status, priority: world.priority, artworkKey: world.artworkKey, playableCount: ranked.length, intelligenceVersion: world.profileVersion }; }) };
}

export async function loadEmotionalWorld(id: string, options: { limit: number; cursor: number; minimumConfidence?: string; excludeIds?: string[] }) {
  const world = getEmotionalWorld(id); if (!world || !["active", "beta"].includes(world.status)) return null;
  const catalog = await loadSongs(); const excluded = new Set(options.excludeIds ?? []);
  const all = rankWorldCatalog(catalog.songs, world).filter((entry) => !excluded.has(entry.song.id)).filter((entry) => !options.minimumConfidence || options.minimumConfidence === "broadened" || entry.confidence === options.minimumConfidence || (options.minimumConfidence === "strong" && entry.confidence === "high"));
  const songs = all.slice(options.cursor, options.cursor + options.limit).map((entry) => ({
    songId: entry.song.id,
    worldScore: entry.worldScore,
    confidence: entry.confidence,
    matchReasons: entry.matchReasons,
  }));
  const counts = { highConfidence: all.filter((entry) => entry.confidence === "high").length, strong: all.filter((entry) => entry.confidence === "strong").length, broadened: all.filter((entry) => entry.confidence === "broadened").length, totalPlayable: all.length };
  return { world: { id: world.id, name: world.name, description: world.description, family: world.family, status: world.status, artworkKey: world.artworkKey, intelligenceVersion: world.profileVersion }, counts, songs, nextCursor: options.cursor + options.limit < all.length ? String(options.cursor + options.limit) : undefined, intelligenceVersion: EMOTIONAL_INTELLIGENCE_VERSION, catalogVersion: catalog.catalogVersion, generatedAt: new Date().toISOString() };
}
