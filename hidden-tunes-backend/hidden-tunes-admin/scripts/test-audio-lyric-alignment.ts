import assert from "node:assert/strict";
import {
  alignLyricsToWordTimestamps,
  buildAudioTranscriptionLyrics,
} from "../lib/audioLyricAlignment";

function timedWords(text: string, start = 1) {
  return text
    .split(/\s+/)
    .map((word, index) => ({
      word,
      start: start + index * 0.5,
      end: start + index * 0.5 + 0.4,
    }));
}

const aligned = alignLyricsToWordTimestamps(
  "We walk through low light\nAnd wait for morning",
  timedWords("we walk through low light and wait for morning"),
);
assert.equal(aligned.ok, true);
assert.match(
  aligned.lrcText || "",
  /^\[00:01\.00\] We walk through low light/m,
);
assert.match(aligned.lrcText || "", /^\[00:03\.50\] And wait for morning/m);

const preservesSuppliedLyrics = alignLyricsToWordTimestamps(
  "You’re still here\nThe colour stays",
  timedWords("youre still here the color stays"),
);
assert.equal(preservesSuppliedLyrics.ok, true);
assert.match(preservesSuppliedLyrics.lrcText || "", /You’re still here/);
assert.match(preservesSuppliedLyrics.lrcText || "", /The colour stays/);

const lowConfidence = alignLyricsToWordTimestamps(
  "Completely unrelated lyric line\nNothing matches this either",
  timedWords("instrumental music continues softly"),
);
assert.equal(lowConfidence.ok, false);
assert.equal(lowConfidence.reason, "low_confidence");
assert.equal(lowConfidence.lrcText, undefined);

const missingTimestamps = alignLyricsToWordTimestamps("Keep plain lyrics", []);
assert.equal(missingTimestamps.ok, false);
assert.equal(missingTimestamps.reason, "missing_timestamps");

const audioOnly = buildAudioTranscriptionLyrics(
  timedWords("We listen to the audio. Every timestamp is real", 2),
);
assert.equal(audioOnly.ok, true);
assert.equal(audioOnly.timestampSource, "whisper_words");
assert.equal(audioOnly.timedWordCount, 9);
assert.equal(audioOnly.lineCount, 2);
assert.match(audioOnly.lrcText || "", /^\[00:02\.00\] We listen to the audio\./m);
assert.match(audioOnly.lrcText || "", /^\[00:04\.50\] Every timestamp is real/m);

const segmentFallback = buildAudioTranscriptionLyrics([], [
  { text: "First real segment", start: 3.25, end: 4.5 },
  { text: "Second real segment", start: 8, end: 10 },
]);
assert.equal(segmentFallback.ok, true);
assert.equal(segmentFallback.timestampSource, "whisper_segments");
assert.match(segmentFallback.lrcText || "", /^\[00:03\.25\] First real segment/m);
assert.match(segmentFallback.lrcText || "", /^\[00:08\.00\] Second real segment/m);

const audioOnlyMissingTimestamps = buildAudioTranscriptionLyrics([], []);
assert.equal(audioOnlyMissingTimestamps.ok, false);
assert.equal(audioOnlyMissingTimestamps.reason, "missing_timestamps");
console.log("audio lyric alignment tests passed");
