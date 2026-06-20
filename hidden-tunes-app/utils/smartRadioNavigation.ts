import { router } from "expo-router";

import type { SmartRadioEntry } from "../services/smartRecommendations";

export function openSmartRadioEntry(entry: SmartRadioEntry) {
  router.push({
    pathname: "/radio",
    params: entry.params,
  } as any);
}

export function openArtistRadio(artist: string, query?: string) {
  const safeArtist = String(artist || "").trim();
  if (!safeArtist) return;

  router.push({
    pathname: "/radio",
    params: {
      title: `${safeArtist} Radio`,
      artist: safeArtist,
      query: query || `${safeArtist} songs`,
    },
  } as any);
}

export function openAlbumRadio(album: string, artist?: string, query?: string) {
  const safeAlbum = String(album || "").trim();
  if (!safeAlbum) return;

  router.push({
    pathname: "/radio",
    params: {
      title: `${safeAlbum} Radio`,
      artist: artist || "",
      query: query || `${safeAlbum} ${artist || ""}`.trim(),
    },
  } as any);
}

export function openGenreRadio(genre: string, query?: string) {
  const safeGenre = String(genre || "").trim();
  if (!safeGenre) return;

  router.push({
    pathname: "/radio",
    params: {
      title: `${safeGenre} Radio`,
      genre: safeGenre,
      query: query || `${safeGenre} music`,
    },
  } as any);
}

export function openMoodRadio(mood: string, query?: string) {
  const safeMood = String(mood || "").trim();
  if (!safeMood) return;

  router.push({
    pathname: "/radio",
    params: {
      title: `${safeMood} Radio`,
      mood: safeMood,
      query: query || `${safeMood} music`,
    },
  } as any);
}
