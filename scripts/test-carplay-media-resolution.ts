import assert from "node:assert/strict";
import fs from "node:fs";
import {
  clearCarPlayCatalogSnapshotForTests,
  configureCarPlayMediaVisibility,
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

rememberCarPlayCatalogSnapshot({
  roots: [],
  sections: [
    { parentId: "recently_added", items: [
      { mediaId: first.mediaId, title: first.title, playable: true },
      { mediaId: second.mediaId, title: second.title, playable: true },
    ] },
    { parentId: "album:album", items: [
      { mediaId: second.mediaId, title: second.title, playable: true },
      { mediaId: first.mediaId, title: first.title, playable: true },
    ] },
  ],
  tracks: [first, second],
});
const albumResolved = resolveCarPlayMediaId(first.mediaId, "album:album");
assert.ok(albumResolved, "shared media ID resolves in selected parent context");
assert.equal(albumResolved.queueContext.contextId, "album:album");
assert.equal(albumResolved.index, 1, "folder order and selected index are preserved");
assert.equal(resolveCarPlayMediaId("recent:song:missing"), null, "unknown ID fails closed");
assert.equal(resolveCarPlayMediaId("recent:song:bad"), null, "missing URI fails closed");

configureCarPlayMediaVisibility((track) => !(track as any).isMature);
rememberCarPlayCatalogSnapshot({
  roots: [],
  sections: [{ parentId: "recently_played", items: [
    { mediaId: first.mediaId, title: first.title, playable: true },
  ] }],
  tracks: [{ ...first, isMature: true } as any],
});
assert.equal(resolveCarPlayMediaId(first.mediaId), null, "stale mature selection rejected before queue mutation");
configureCarPlayMediaVisibility(() => true);

const radio = { ...first, mediaId: "radio:one", id: "radio-one", contentType: "radio",
  isLive: true, stationId: "one" } as any;
const radioTwo = { ...second, mediaId: "radio:two", id: "radio-two", contentType: "radio",
  isLive: true, stationId: "two" } as any;
rememberCarPlayCatalogSnapshot({ roots: [], sections: [{ parentId: "radio_recent", items: [
  { mediaId: radio.mediaId, title: radio.title, playable: true },
  { mediaId: radioTwo.mediaId, title: radioTwo.title, playable: true },
] }], tracks: [radio, radioTwo] });
const resolvedRadio = resolveCarPlayMediaId(radio.mediaId, "radio_recent");
assert.ok(resolvedRadio);
assert.equal(resolvedRadio.queue.length, 1, "CarPlay radio never creates a station song queue");
assert.equal(resolvedRadio.queueMode, "live_stream");
assert.equal(resolvedRadio.queueContext.queueType, "live_radio");
assert.equal(resolvedRadio.radioStation?.id, "one", "canonical station ID reaches radio router");
assert.equal(resolvedRadio.radioStation?.streamUrl, first.url,
  "validated station URL reaches radio router");

const chapter = { ...first, mediaId: "audiobook:chapter", id: "audiobook-chapter-chapter",
  contentType: "audiobook", bookId: "book", chapterId: "chapter", resumePositionMillis: 12345 } as any;
rememberCarPlayCatalogSnapshot({ roots: [], sections: [{ parentId: "audiobook-book:book", items: [
  { mediaId: chapter.mediaId, title: chapter.title, playable: true },
] }], tracks: [chapter] });
const resolvedChapter = resolveCarPlayMediaId(chapter.mediaId, "audiobook-book:book");
assert.ok(resolvedChapter);
assert.equal(resolvedChapter.queueContext.queueType, "audiobook");
assert.equal(resolvedChapter.resumePositionMillis, 12345);

const podcastOne = { ...first, mediaId: "podcast:one", id: "podcast-one",
  contentType: "podcast", showId: "show", episodeId: "one" } as any;
const podcastTwo = { ...second, mediaId: "podcast:two", id: "podcast-two",
  contentType: "podcast", showId: "show", episodeId: "two" } as any;
rememberCarPlayCatalogSnapshot({ roots: [], sections: [
  { parentId: "podcast_recent", items: [
    { mediaId: podcastTwo.mediaId, title: podcastTwo.title, playable: true },
  ] },
  { parentId: "podcast-show:show", items: [
    { mediaId: podcastOne.mediaId, title: podcastOne.title, playable: true },
    { mediaId: podcastTwo.mediaId, title: podcastTwo.title, playable: true },
  ] },
], tracks: [podcastOne, podcastTwo] });
const resolvedPodcast = resolveCarPlayMediaId(podcastTwo.mediaId, "search_results");
assert.ok(resolvedPodcast);
assert.equal(resolvedPodcast.queue.length, 2, "search resolves the canonical same-show queue");
assert.equal(resolvedPodcast.index, 1);
assert.equal(resolvedPodcast.queueContext.contextType, "podcast-show");

const playerContext = fs.readFileSync(new URL("../context/PlayerContext.tsx", import.meta.url), "utf8");
const nativeManager = fs.readFileSync(new URL(
  "../plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift",
  import.meta.url
), "utf8");
const nativeModule = fs.readFileSync(new URL(
  "../plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift",
  import.meta.url
), "utf8");
const iosBranch = playerContext.slice(
  playerContext.indexOf('if (Platform.OS === "ios")', playerContext.indexOf('case "play_from_media_id"')),
  playerContext.indexOf("const { acceptAndroidAutoTransaction", playerContext.indexOf('case "play_from_media_id"'))
);
assert.match(iosBranch, /resolveCarPlayMediaId/, "iOS selection uses CarPlay resolver");
assert.doesNotMatch(iosBranch, /playAndroidAutoMediaId/, "iOS selection never invokes Android Auto resolver");
assert.match(iosBranch, /if \(!resolved\)/, "missing registry/URI fails before playSong");
assert.match(iosBranch, /if \(resolved\.radioStation\)/,
  "CarPlay radio selections are separated before generic song playback");
assert.match(iosBranch, /routeRadioPlayback/,
  "CarPlay radio uses the authoritative radio playback router");
assert.match(iosBranch, /\{ playSong, playQueue \}/,
  "CarPlay radio hands existing player dependencies to the radio router");
assert.match(iosBranch, /\.parentId/, "PlayerContext passes selected CarPlay parent context");
assert.match(nativeManager, /emitCarPlayMediaSelection\(mediaId, parentId: parentId\)/,
  "native selection preserves its existing parent ID");
assert.match(nativeModule, /"parentId": parentId/g,
  "functional CarPlay command carries parent ID through native diagnostics bridge");

console.log("CarPlay media resolution tests passed.");
