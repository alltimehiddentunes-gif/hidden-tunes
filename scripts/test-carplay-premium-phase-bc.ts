import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildCarPlayInitialCatalogSnapshot,
  configureCarPlayMatureVisibility,
} from "../services/carPlayCatalogSnapshot.ts";

const track = (mediaId: string, contentType: string, extra: Record<string, unknown> = {}) => ({
  mediaId, id: mediaId, url: `https://audio.example/${mediaId}.mp3`, title: mediaId,
  artist: "Artist", album: "Album", artworkUrl: `https://img.example/${mediaId}.jpg`,
  durationSeconds: 120, contentType, isLive: contentType === "radio", ...extra,
});
const playable = (entry: ReturnType<typeof track>) => ({ mediaId: entry.mediaId,
  title: entry.title, subtitle: entry.artist, playable: true, contentType: entry.contentType });
const podcast = track("podcast:episode", "podcast", { showId: "show", episodeId: "episode" });
const audiobook = track("audiobook:chapter", "audiobook", { bookId: "book", chapterId: "chapter" });
const radio = track("radio:station", "radio", { stationId: "station", isLiveStream: true });
const matureRadio = track("radio:mature", "radio", { stationId: "mature", isLiveStream: true, isMature: true });

const extras = {
  premiumTracks: [podcast, audiobook, radio, matureRadio],
  premiumSections: [
    { parentId: "podcasts", items: [{ mediaId: "podcast-show:show", title: "Show", subtitle: "", playable: false }] },
    { parentId: "podcast-show:show", items: [playable(podcast)] },
    { parentId: "audiobooks", items: [{ mediaId: "audiobook-book:book", title: "Book", subtitle: "", playable: false }] },
    { parentId: "audiobook-book:book", items: [playable(audiobook)] },
    { parentId: "radio_favorites", items: [playable(radio), playable(matureRadio)] },
    { parentId: "radio_recent", items: [playable(radio), playable(matureRadio)] },
    { parentId: "radio_recommended", items: [playable(radio), playable(matureRadio)] },
    { parentId: "radio_browse", items: [playable(radio), playable(matureRadio)] },
  ],
};

configureCarPlayMatureVisibility(() => false);
const hidden = buildCarPlayInitialCatalogSnapshot(extras as any);
assert.deepEqual(hidden.roots.map((item) => item.mediaId), ["listen", "radio", "library"]);
const section = (id: string) => hidden.sections.find((entry) => entry.parentId === id)!;
assert.deepEqual(section("listen").items.map((item) => item.mediaId), [
  "continue_listening", "recently_played", "favorites", "made_for_you", "recommended_podcasts",
]);
assert.deepEqual(section("radio").items.map((item) => item.mediaId), [
  "radio_favorites", "radio_recent", "radio_recommended", "radio_browse",
]);
assert.deepEqual(section("library").items.map((item) => item.mediaId), [
  "artists", "albums", "genres", "playlists", "podcasts", "audiobooks", "music",
]);
assert.ok(!JSON.stringify(hidden).includes("radio:mature"), "mature radio excluded everywhere");
assert.ok(hidden.tracks.length <= 80, "global playable cap");

const sectionCounts = new Map<string, number>();
hidden.sections.forEach((entry) => sectionCounts.set(entry.parentId,
  (sectionCounts.get(entry.parentId) || 0) + 1));
for (const node of [...hidden.roots, ...hidden.sections.flatMap((entry) => entry.items)]) {
  if (node.playable || node.mediaId.startsWith("empty:")) continue;
  assert.equal(sectionCounts.get(node.mediaId), 1, `one child section for ${node.mediaId}`);
}
const byParent = new Map(hidden.sections.map((entry) => [entry.parentId, entry.items]));
function assertDepth(mediaId: string, depth: number, seen = new Set<string>()) {
  assert.ok(depth <= 3, `maximum hierarchy depth for ${mediaId}`);
  if (seen.has(mediaId)) assert.fail(`cycle at ${mediaId}`);
  const nextSeen = new Set(seen).add(mediaId);
  for (const child of byParent.get(mediaId) || []) {
    if (!child.playable && !child.mediaId.startsWith("empty:")) {
      assertDepth(child.mediaId, depth + 1, nextSeen);
    }
  }
}
hidden.roots.forEach((root) => assertDepth(root.mediaId, 0));

configureCarPlayMatureVisibility(() => true);
const visible = buildCarPlayInitialCatalogSnapshot(extras as any);
assert.ok(visible.tracks.some((entry) => entry.mediaId === "radio:mature"));
assert.ok(sectionCounts.size > 0);

const manager = fs.readFileSync(
  "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift", "utf8"
);
assert.match(manager, /let templates: \[CPTemplate\] = \[listen, radio, library\]/);
assert.match(manager, /hasPendingCatalogRefresh = self\.isConnected/);
assert.match(manager, /interfaceController\.templates\.count == 1/);
assert.match(manager, /templateDidAppear/);
assert.ok(!manager.includes('header: "Stations"'), "generic radio section removed");
assert.ok(!manager.includes('title: "Nothing here yet"'), "generic empty copy removed");
assert.ok(!manager.includes('title: "Hidden Tunes is ready"'), "technical fallback title removed");
assert.ok(!manager.includes('subtitle: "Native CarPlay interface"'), "technical fallback subtitle removed");

console.log("carplay-premium-phase-bc: PASS");
