import { getSupabaseAdmin } from "../supabaseAdmin";
import { deserializeProfile } from "./profilePersistence";
import type { EmotionalProfile, LabSong } from "./types";
export interface MusicCatalogRepository { getSeed(id: string): Promise<LabSong | null>; getCandidates(seed: LabSong, limit: number): Promise<LabSong[]>; }
export interface EmotionalProfileRepository { getProfiles(songIds: string[]): Promise<ReadonlyMap<string, EmotionalProfile>>; }
type SongRow = Record<string, unknown>;
const validUrl = (value: unknown) => /^https?:\/\//i.test(String(value ?? "").trim());
export function songRowEligible(row: SongRow) { const review = String(row.review_status ?? "").toLowerCase(); const license = String(row.license_declaration ?? "").toLowerCase(); return row.is_public === true && (validUrl(row.audio_url) || validUrl(row.url)) && !String(row.rejection_reason ?? "").trim() && !["rejected", "blocked", "quarantined"].includes(review) && !["denied", "unlicensed", "rejected"].includes(license); }
export function mapSongRow(row: SongRow): LabSong { return { id: String(row.id), title: String(row.title ?? ""), artistId: String(row.artist_id ?? row.artist ?? "unknown"), albumId: String(row.album_id ?? row.album ?? `single:${row.id}`), genre: String(row.genre ?? "Unknown"), mood: String(row.mood ?? ""), playable: validUrl(row.audio_url) || validUrl(row.url), published: row.is_public === true, maturity: row.is_mature === true || row.mature === true ? "mature" : "safe" }; }
const SONG_FIELDS = "id,title,artist_id,artist,album_id,album,genre,mood,audio_url,url,is_public,review_status,rejection_reason,license_declaration";
export class SupabaseMusicCatalogRepository implements MusicCatalogRepository {
  async getSeed(id: string) { const { data, error } = await getSupabaseAdmin().from("songs").select(SONG_FIELDS).eq("id", id).maybeSingle(); if (error) throw error; return data && songRowEligible(data) ? mapSongRow(data) : null; }
  async getCandidates(_seed: LabSong, limit: number) { const { data, error } = await getSupabaseAdmin().from("songs").select(SONG_FIELDS).eq("is_public", true).limit(Math.min(limit, 160)); if (error) throw error; return (data ?? []).filter(songRowEligible).map(mapSongRow); }
}
export class SupabaseEmotionalProfileRepository implements EmotionalProfileRepository {
  private available: boolean | null = null;
  async getProfiles(ids: string[]) { if (!ids.length || this.available === false) return new Map(); const { data, error } = await getSupabaseAdmin().from("music_emotional_profiles").select("song_id,profile_json,analyzed_at").in("song_id", ids.slice(0, 161)).order("analyzed_at", { ascending: false }); if (error) { if (/does not exist|schema cache/i.test(error.message)) { this.available = false; return new Map(); } throw error; } this.available = true; const result = new Map<string, EmotionalProfile>(); for (const row of data ?? []) if (!result.has(String(row.song_id))) { const p = deserializeProfile(row.profile_json); result.set(String(row.song_id), { ...p, analyzerVersion: "music-intelligence-lab-2026.08.1" }); } return result; }
}
export class InMemoryMusicRepository implements MusicCatalogRepository, EmotionalProfileRepository {
  constructor(private songs: LabSong[], private profiles = new Map<string, EmotionalProfile>()) {}
  async getSeed(id: string) { return this.songs.find((song) => song.id === id && song.playable && song.published) ?? null; }
  async getCandidates(_seed: LabSong, limit: number) { return this.songs.filter((song) => song.playable && song.published).slice(0, limit); }
  async getProfiles(ids: string[]) { return new Map(ids.flatMap((id) => { const profile = this.profiles.get(id); return profile ? [[id, profile] as const] : []; })); }
}
