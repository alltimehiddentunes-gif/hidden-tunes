import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AppSong } from "../context/PlayerContext";

export type MusicQualityMode = "data_saver" | "automatic" | "high_quality" | "lossless";

const QUALITY_KEY = "hidden_tunes_music_quality_v1";
const MUSIC_PLAYBACK_RESOLVER_BASE = "https://admin.hiddentunes.com";
const VALID_MODES = new Set<MusicQualityMode>([
  "data_saver",
  "automatic",
  "high_quality",
  "lossless",
]);

export async function getMusicQualityMode(): Promise<MusicQualityMode> {
  try {
    const stored = await AsyncStorage.getItem(QUALITY_KEY);
    return VALID_MODES.has(stored as MusicQualityMode)
      ? (stored as MusicQualityMode)
      : "automatic";
  } catch {
    return "automatic";
  }
}

export async function setMusicQualityMode(mode: MusicQualityMode) {
  if (!VALID_MODES.has(mode)) throw new Error("Unsupported music quality mode.");
  await AsyncStorage.setItem(QUALITY_KEY, mode);
}

function playbackPath(song: AppSong) {
  const fromSong = String(
    song.playbackPath ||
      (song as { playback_path?: string }).playback_path ||
      (song as { raw?: { playback_path?: string } }).raw?.playback_path ||
      ""
  ).trim();
  if (fromSong) return fromSong;
  if (song.sourceName === "Hidden Tunes" && song.id) {
    return `/api/songs/${encodeURIComponent(song.id)}/playback`;
  }
  return "";
}

export async function resolveHiddenTunesMusicPlayback(song: AppSong): Promise<AppSong> {
  const path = playbackPath(song);
  if (!path || song.sourceName !== "Hidden Tunes") return song;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);

  try {
    const qualityMode = await getMusicQualityMode();
    const base = MUSIC_PLAYBACK_RESOLVER_BASE.replace(/\/+$/, "");
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qualityMode }),
      signal: controller.signal,
    });
    if (!response.ok) return song;
    const result = (await response.json()) as { playbackUrl?: string };
    const url = String(result.playbackUrl || "").trim();
    if (!url) return song;
    return { ...song, url, streamUrl: url, audioUrl: url, audio_url: url };
  } catch {
    return song;
  } finally {
    clearTimeout(timeout);
  }
}
