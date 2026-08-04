import assert from "node:assert/strict";
import fs from "node:fs";
import {
  clearCarPlayCatalogSnapshotForTests,
  rememberCarPlayCatalogSnapshot,
  resolveCarPlayMediaId,
} from "../services/carPlayMediaResolver.ts";

const first = {
  mediaId: "recent:song:first", id: "first", url: "https://audio.example/first.mp3",
  title: "First", artist: "Artist", album: "Album", artworkUrl: "https://img/first.jpg",
  durationSeconds: 120, contentType: "music", isLive: false,
};
const second = {
  mediaId: "recent:song:second", id: "second", url: "https://audio.example/second.mp3",
  title: "Second", artist: "Artist", album: "Album", artworkUrl: "",
  durationSeconds: 180, contentType: "music", isLive: false,
};

clearCarPlayCatalogSnapshotForTests();
assert.equal(resolveCarPlayMediaId(first.mediaId), null, "no unpublished IDs resolve");
rememberCarPlayCatalogSnapshot({
  roots: [],
  sections: [{ parentId: "recently_played", items: [
    { mediaId: first.mediaId, title: first.title, playable: true },
    { mediaId: second.mediaId, title: second.title, playable: true },
  ] }],
  tracks: [first, second, { ...second, mediaId: "recent:song:bad", id: "bad", url: "" }],
});

const resolved = resolveCarPlayMediaId(second.mediaId);
assert.ok(resolved, "published CarPlay ID resolves");
assert.equal(resolved.song.id, "second", "canonical ID preserved");
assert.equal(resolved.song.streamUrl, second.url, "playable URI preserved");
assert.equal(resolved.queue.length, 2, "selected section becomes bounded queue");
assert.equal(resolved.index, 1, "selected item receives correct queue index");
assert.equal(resolved.queueContext.contextId, "recently_played");
assert.equal(resolveCarPlayMediaId("recent:song:missing"), null, "unknown ID fails closed");
assert.equal(resolveCarPlayMediaId("recent:song:bad"), null, "missing URI fails closed");

const playerContext = fs.readFileSync(new URL("../context/PlayerContext.tsx", import.meta.url), "utf8");
const iosBranch = playerContext.slice(
  playerContext.indexOf('if (Platform.OS === "ios")', playerContext.indexOf('case "play_from_media_id"')),
  playerContext.indexOf("const { acceptAndroidAutoTransaction", playerContext.indexOf('case "play_from_media_id"'))
);
assert.match(iosBranch, /resolveCarPlayMediaId/, "iOS selection uses CarPlay resolver");
assert.doesNotMatch(iosBranch, /playAndroidAutoMediaId/, "iOS selection never invokes Android Auto resolver");
assert.match(iosBranch, /if \(!resolved\)/, "missing registry/URI fails before playSong");

console.log("CarPlay media resolution tests passed.");
