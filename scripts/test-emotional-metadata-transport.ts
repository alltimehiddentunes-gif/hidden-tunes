import assert from "node:assert/strict";

import { restoreEmotionalMetadata, snapshotEmotionalMetadata } from "../utils/emotionalMetadataPersistence";
import { normalizeEmotionalMetadata } from "../utils/normalizeEmotionalMetadata";

const normalized = {
  id: "emotion-rich",
  title: "Emotion Rich",
  artist: "Artist",
  audio_url: "https://example.com/emotion-rich.mp3",
  genre: "R&B",
  mood: "Heartbreak",
  energy: 37,
  tempo_bpm: 78,
  atmosphere: "late night",
  emotion: "vulnerability",
  texture: "soft",
  time_of_day: "midnight",
  vocal_feel: "breathy",
  instrumentation: "piano",
  analysis_status: "complete",
  analysis_source: "editor",
  raw: {
    energy: 37,
    tempo_bpm: 78,
    atmosphere: "late night",
    emotion: "vulnerability",
    texture: "soft",
    time_of_day: "midnight",
    vocal_feel: "breathy",
    instrumentation: "piano",
    analysis_status: "complete",
    analysis_source: "editor",
  },
};

const live = normalizeEmotionalMetadata(normalized);
assert.equal(live.emotionalMetadataRaw?.energy, 37);
assert.equal(live.emotionalMetadataRaw?.vocalFeel, "breathy");
assert.ok(live.emotionalTags.includes("late-night"));

const persisted = snapshotEmotionalMetadata(normalized);
const restored = { ...normalized, raw: restoreEmotionalMetadata(persisted) };
const cached = normalizeEmotionalMetadata(restored);
assert.deepEqual(cached.emotionalMetadataRaw, live.emotionalMetadataRaw);
assert.deepEqual(cached.emotionalTags, live.emotionalTags);
assert.equal(restored.genre, "R&B");
assert.equal(restored.mood, "Heartbreak");

const legacy = normalizeEmotionalMetadata({
  emotional_metadata: {
    energy: "42",
    tempo_bpm: "90",
    time_of_day: "late night",
    vocal_feel: "Soulful",
  },
});
assert.equal(legacy.emotionalMetadataRaw?.energy, 42);
assert.equal(legacy.emotionalMetadataRaw?.tempoBpm, 90);
assert.ok(legacy.emotionalTags.includes("late-night"));

const missing = normalizeEmotionalMetadata({ genre: "Metal" });
assert.equal(missing.emotionalMetadataRaw, null);
assert.equal(missing.emotionalVector, null);
assert.deepEqual(missing.emotionalTags, []);

console.log("PASS emotional metadata transport");
