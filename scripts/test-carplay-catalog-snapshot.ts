import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CARPLAY_LIMITS,
  buildCarPlayCatalogSnapshot,
  buildCarPlayInitialCatalogSnapshot,
  carPlayCatalogSignature,
} from "../services/carPlayCatalogSnapshot.ts";

const song = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Song ${id}`, artist: "Artist One", album: "Album One", genre: "Soul",
  cover: "", streamUrl: `https://audio.example/${id}.mp3`, isOnline: true, ...extra,
});

const good = song("good");
const second = song("second", { artist: "Artist Two", album: "Album Two", genre: "Jazz" });
const radio = song("radio-live", { artist: "Station", album: "Radio" });
const rejected = [
  song("mature", { is_mature: true }), song("explicit", { content_rating: "explicit" }),
  song("quarantined", { quarantined: true }), song("private", { isPublic: false }),
  song("disabled", { disabled: true }), song("unplayable", { playable: false }),
  song("invalid", { streamUrl: "" }), song("offline", { isOnline: false }),
];

const catalog: any = {
  songs: [good, good, second, radio, ...rejected],
  artists: [
    { id: "one", name: "Artist One", songs: [good, ...rejected], albums: [] },
    { id: "two", name: "Artist Two", songs: [second], albums: [] },
  ],
  albums: [
    { id: "one", title: "Album One", artist: "Artist One", songs: [good, ...rejected] },
    { id: "two", title: "Album Two", artist: "Artist Two", songs: [second] },
  ],
  genres: [
    { id: "soul", title: "Soul", songs: [good, ...rejected] },
    { id: "jazz", title: "Jazz", songs: [second] },
  ],
  playlists: [
    { id: "mix", title: "Mix", description: "Test", songs: [good, second, ...rejected], kind: "latest" },
  ],
};

function section(snapshot: any, parentId: string) {
  return snapshot.sections.find((entry: any) => entry.parentId === parentId);
}

function assertParentClosed(snapshot: any) {
  const counts = new Map<string, number>();
  snapshot.sections.forEach((entry: any) => counts.set(entry.parentId, (counts.get(entry.parentId) || 0) + 1));
  const nodes = [...snapshot.roots, ...snapshot.sections.flatMap((entry: any) => entry.items)];
  for (const node of nodes) {
    if (node.playable || node.mediaId.startsWith("empty:")) continue;
    assert.equal(counts.get(node.mediaId), 1, `one child section for ${node.mediaId}`);
  }
  const knownParents = new Set(nodes.filter((node: any) => !node.playable).map((node: any) => node.mediaId));
  snapshot.sections.forEach((entry: any) => assert.ok(knownParents.has(entry.parentId), `no orphan ${entry.parentId}`));
}

const initial = buildCarPlayInitialCatalogSnapshot();
const populated = buildCarPlayCatalogSnapshot(catalog, {
  favoriteItems: [{ mediaId: "fav:song:good", title: "Favorite", subtitle: "Artist One", playable: true }],
  favoriteTracks: [{ mediaId: "fav:song:good", id: "good", url: good.streamUrl,
    title: good.title, artist: good.artist, album: good.album, artworkUrl: "", durationSeconds: 0 }],
  recentlyPlayedItems: [{ mediaId: "recent:song:second", title: second.title, subtitle: second.artist, playable: true }],
  recentlyPlayedTracks: [{ mediaId: "recent:song:second", id: "second", url: second.streamUrl,
    title: second.title, artist: second.artist, album: second.album, artworkUrl: "", durationSeconds: 0 }],
});

assertParentClosed(initial);
assertParentClosed(populated);

const stableIds = ["recently_added", "artists", "albums", "genres", "playlists"];
assert.deepEqual(section(initial, "music").items.map((item: any) => item.mediaId), stableIds);
assert.deepEqual(section(populated, "music").items.map((item: any) => item.mediaId), stableIds);
assert.ok(section(populated, "recently_added").items.every((item: any) => item.playable));
assert.ok(section(populated, "artists").items.every((item: any) => !item.playable && item.mediaId.startsWith("artist:")));
assert.ok(section(populated, "albums").items.every((item: any) => !item.playable && item.mediaId.startsWith("album:")));
assert.ok(section(populated, "genres").items.every((item: any) => !item.playable && item.mediaId.startsWith("genre:")));
assert.ok(section(populated, "playlists").items.every((item: any) => !item.playable && item.mediaId.startsWith("playlist:")));
for (const root of ["artists", "albums", "genres", "playlists"]) {
  for (const folder of section(populated, root).items) {
    const children = section(populated, folder.mediaId).items;
    assert.ok(children.every((item: any) => item.playable || item.mediaId === `empty:${folder.mediaId}`));
  }
}
assert.ok(section(populated, "radio").items.some((item: any) => item.mediaId === "song:radio-live"));
assert.ok(section(populated, "favorites").items.some((item: any) => item.mediaId === "fav:song:good"));
assert.equal(section(populated, "recently_played").items[0].mediaId, "recent:song:second", "phone history preferred");
assert.ok(section(populated, "made_for_you").items.length > 0);

const serialized = JSON.stringify(populated);
for (const id of rejected.map((entry) => entry.id)) assert.ok(!serialized.includes(`song:${id}`), `${id} excluded`);
assert.equal(populated.tracks.filter((track) => track.mediaId === "song:good").length, 1, "tracks deduplicated");
assert.ok(populated.tracks.length <= CARPLAY_LIMITS.tracks, "track cap");
assert.ok(section(populated, "artists").items.length <= CARPLAY_LIMITS.artists, "artist cap");
assert.ok(section(populated, "albums").items.length <= CARPLAY_LIMITS.albums, "album cap");
assert.ok(section(populated, "genres").items.length <= CARPLAY_LIMITS.genres, "genre cap");
assert.ok(section(populated, "playlists").items.length <= CARPLAY_LIMITS.playlists, "playlist cap");
assert.ok(section(initial, "artists").items[0].mediaId === "empty:artists", "intentional empty state");

assert.equal(carPlayCatalogSignature(populated), carPlayCatalogSignature(buildCarPlayCatalogSnapshot(catalog, {
  favoriteItems: [{ mediaId: "fav:song:good", title: "Favorite", subtitle: "Artist One", playable: true }],
  favoriteTracks: [{ mediaId: "fav:song:good", id: "good", url: good.streamUrl,
    title: good.title, artist: good.artist, album: good.album, artworkUrl: "", durationSeconds: 0 }],
  recentlyPlayedItems: [{ mediaId: "recent:song:second", title: second.title, subtitle: second.artist, playable: true }],
  recentlyPlayedTracks: [{ mediaId: "recent:song:second", id: "second", url: second.streamUrl,
    title: second.title, artist: second.artist, album: second.album, artworkUrl: "", durationSeconds: 0 }],
})), "identical signatures");
assert.notEqual(carPlayCatalogSignature(initial), carPlayCatalogSignature(populated), "replacement signature changes");
const structuralVariant = structuredClone(populated);
structuralVariant.sections[0].items[0].playable = false;
assert.notEqual(carPlayCatalogSignature(populated), carPlayCatalogSignature(structuralVariant), "playable bit changes signature");

const bridgeSource = fs.readFileSync("services/carPlayCatalogBridge.ts", "utf8");
assert.ok(bridgeSource.includes("[HTCarPlayBrowse] snapshot_publish"), "focused publish diagnostics");
assert.ok(!bridgeSource.includes("buildAndroidAutoMinimalCatalogSnapshot"), "CarPlay never publishes AA minimal snapshot");
assert.ok(!fs.readFileSync("services/carPlayCatalogSnapshot.ts", "utf8").includes("fetch("), "no catalog fetch");

console.log("carplay-catalog-snapshot: PASS");
