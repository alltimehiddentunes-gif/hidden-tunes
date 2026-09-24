import assert from "node:assert/strict";
import { publicProviderLabel, toPublicSong } from "./map.js";

function baseRecord(overrides = {}) {
  return {
    publicPlaybackId: "f191ad70-cf28-4b49-9398-2621b7f01bc1",
    provider: "youtube",
    sourceId: "UiDjPR9yRDU",
    canonicalSourceKey: "youtube:UiDjPR9yRDU",
    title: "Blank Space",
    artist: "Taylor Swift",
    durationMs: 231_000,
    createdAt: Date.now(),
    ...overrides,
  };
}

{
  const song = toPublicSong(baseRecord(), "https://api.hiddentunes.com");
  assert.equal(song.provider, "youtube");
  assert.equal(song.sourceProvider, "youtube");
  assert.equal(song.id, "f191ad70-cf28-4b49-9398-2621b7f01bc1");
  assert.ok(song.streamUrl.includes("/api/media/f191ad70-cf28-4b49-9398-2621b7f01bc1"));
  assert.equal(song.sourceName, "Hidden Tunes");
  // Must not invent provider from opaque UUID text.
  assert.notEqual(song.provider, song.id);
}

{
  const song = toPublicSong(baseRecord({ provider: "archive.org" }), "https://api.hiddentunes.com");
  assert.equal(song.provider, "archive.org");
}

{
  // Opaque-looking provider values must not be echoed.
  assert.equal(publicProviderLabel({ provider: "f191ad70-cf28-4b49-9398-2621b7f01bc1" }), null);
  assert.equal(publicProviderLabel({ provider: "" }), null);
  assert.equal(publicProviderLabel({ provider: "archive" }), "archive.org");
}

{
  // Canonical identity fields stay intact on the store record path (not mutated by mapper).
  const record = baseRecord();
  toPublicSong(record, "https://api.hiddentunes.com");
  assert.equal(record.provider, "youtube");
  assert.equal(record.sourceId, "UiDjPR9yRDU");
  assert.equal(record.canonicalSourceKey, "youtube:UiDjPR9yRDU");
}

console.log("map.providerProvenance.test.js PASS");
