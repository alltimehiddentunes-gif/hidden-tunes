/**
 * Library favorites identity + routing contract.
 * Run: npx tsx scripts/test-library-favorites-identity.ts
 */
import assert from "node:assert/strict";

import {
  buildRadioStationFavoriteItem,
  buildSongFavoriteItem,
} from "../services/favorites/favoriteItemBuilders";
import {
  isYouTubeLibraryFavorite,
  libraryFavoriteCompoundKey,
  libraryMediaBadgeLabel,
  looksLikeMisclassifiedRadioFavorite,
  migrateUnifiedFavoriteItem,
  normalizeRadioFavoriteStationId,
  resolveLibraryFavoriteOwner,
} from "../services/favorites/libraryFavoriteIdentity";
import type { UnifiedFavoriteItem } from "../types/favorites";
import { favoriteStorageKey } from "../types/favorites";

function groupByType(items: UnifiedFavoriteItem[]) {
  const sections = {
    song: [] as UnifiedFavoriteItem[],
    radio_station: [] as UnifiedFavoriteItem[],
    artist: [] as UnifiedFavoriteItem[],
    album: [] as UnifiedFavoriteItem[],
  };
  for (const item of items) {
    if (item.type in sections) {
      (sections as any)[item.type].push(item);
    }
  }
  return sections;
}

function main() {
  const radioFromStation = buildRadioStationFavoriteItem({
    id: "station-ru-1",
    title: "Pop Music Station [RU]",
    country: "RU",
    language: "ru",
    genre: "pop",
    streamUrl: "https://example.com/stream",
  });
  assert.equal(radioFromStation.type, "radio_station");
  assert.equal(radioFromStation.source, "radio");
  assert.equal(libraryMediaBadgeLabel(radioFromStation), "RADIO");
  assert.equal(resolveLibraryFavoriteOwner(radioFromStation), "radio");

  const song = buildSongFavoriteItem({
    id: "song-1",
    title: "Hidden Track",
    artist: "Artist",
    streamUrl: "https://cdn.example/a.mp3",
  });
  assert.equal(song.type, "song");
  assert.equal(libraryMediaBadgeLabel(song), "SONG");
  assert.equal(resolveLibraryFavoriteOwner(song), "song");

  // MiniPlayer path: live radio AppSong must not become a song favorite
  const radioFromPlayer = buildSongFavoriteItem({
    id: "radio-station-ru-1",
    title: "Pop Music Station [RU]",
    artist: "RU · pop",
    source: "radio",
    type: "live_stream",
    streamUrl: "https://example.com/stream",
  });
  assert.equal(radioFromPlayer.type, "radio_station");
  assert.equal(radioFromPlayer.id, "station-ru-1");
  assert.equal(isYouTubeLibraryFavorite(radioFromPlayer), false);
  assert.equal(resolveLibraryFavoriteOwner(radioFromPlayer), "radio");

  // False YouTube mining must not fire for radio-prefixed ids
  const poisoned = buildSongFavoriteItem({
    id: "radio-abcdefghij",
    title: "Poison Radio",
    source: "radio",
    type: "live_stream",
    streamUrl: "https://example.com/live",
  });
  assert.equal(poisoned.type, "radio_station");
  assert.equal(Boolean(poisoned.metadata?.videoId), false);

  const radioKey = libraryFavoriteCompoundKey("radio_station", "123");
  const songKey = favoriteStorageKey("song", "123");
  assert.equal(radioKey, "radio_station:123");
  assert.notEqual(radioKey, songKey);
  assert.equal(
    libraryFavoriteCompoundKey("radio_station", "radio-123"),
    "radio_station:123"
  );

  const misclassified: UnifiedFavoriteItem = {
    id: "radio-station-ru-1",
    type: "song",
    title: "Pop Music Station [RU]",
    source: "radio",
    addedAt: new Date().toISOString(),
    metadata: {
      videoId: "radio-stati",
      streamUrl: "https://example.com/stream",
      legacyType: "live_stream",
    },
  };
  assert.equal(looksLikeMisclassifiedRadioFavorite(misclassified), true);
  assert.equal(resolveLibraryFavoriteOwner(misclassified), "radio");

  const migrated = migrateUnifiedFavoriteItem(misclassified);
  assert.equal(migrated.type, "radio_station");
  assert.equal(migrated.id, "station-ru-1");
  assert.equal(Boolean(migrated.metadata?.videoId), false);
  assert.equal(resolveLibraryFavoriteOwner(migrated), "radio");

  const grouped = groupByType([migrated, song]);
  assert.equal(grouped.radio_station.length, 1);
  assert.equal(grouped.song.length, 1);
  assert.equal(grouped.radio_station[0].title, "Pop Music Station [RU]");
  assert.ok(!grouped.song.some((item) => item.title.includes("Pop Music Station")));

  const again = migrateUnifiedFavoriteItem(migrated);
  assert.equal(again.type, migrated.type);
  assert.equal(again.id, migrated.id);

  assert.equal(resolveLibraryFavoriteOwner(song), "song");
  assert.equal(
    resolveLibraryFavoriteOwner({
      id: "x",
      type: "unknown" as any,
      title: "Legacy",
      addedAt: new Date().toISOString(),
    }),
    "unsupported"
  );

  assert.notEqual(
    libraryFavoriteCompoundKey("radio_station", "123"),
    libraryFavoriteCompoundKey("song", "123")
  );
  assert.equal(normalizeRadioFavoriteStationId("radio-abc"), "abc");
  assert.equal(libraryMediaBadgeLabel(migrated), "RADIO");

  console.log("ok library-favorites-identity");
}

main();
