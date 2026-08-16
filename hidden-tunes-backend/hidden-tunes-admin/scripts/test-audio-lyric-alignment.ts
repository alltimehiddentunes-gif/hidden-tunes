import assert from "node:assert/strict";
import { alignLyricsToWordTimestamps } from "../lib/audioLyricAlignment";

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
console.log("audio lyric alignment tests passed");
