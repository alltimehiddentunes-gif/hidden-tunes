import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { alignLyricsToWordTimestamps } from "../lib/audioLyricAlignment";
import {
  isUploadAlignmentCandidate,
  normalizeLyricsForPersistence,
  resolveUploadLyrics,
  resolveCompanionMatches,
  validateImportedLrc,
} from "../lib/lyricsUploadSafety";

const named = (name: string) => ({ name });

const matchingLrc = resolveCompanionMatches(
  [named("My Song.mp3")],
  [named("My Song.lrc")]
);
assert.equal(matchingLrc.values().next().value?.status, "unique");

const matchingTxt = resolveCompanionMatches(
  [named("My Song.mp3")],
  [named("My Song.txt")]
);
assert.equal(matchingTxt.values().next().value?.status, "unique");

const matchingLyricsExtension = resolveCompanionMatches(
  [named("My Song.mp3")],
  [named("My Song.lyrics")]
);
assert.equal(matchingLyricsExtension.values().next().value?.status, "unique");

const duplicateLyrics = resolveCompanionMatches(
  [named("My Song.mp3")],
  [named("My Song.txt"), named("01 - My Song.txt")]
);
assert.equal(duplicateLyrics.values().next().value?.status, "ambiguous");

const artistA = named("Artist A - My Song.mp3");
const artistB = named("Artist B - My Song.mp3");
const sharedTitle = resolveCompanionMatches(
  [artistA, artistB],
  [named("My Song.txt")]
);
assert.equal(sharedTitle.get(artistA)?.status, "ambiguous");
assert.equal(sharedTitle.get(artistB)?.status, "ambiguous");

const artistSpecific = resolveCompanionMatches(
  [artistA, artistB],
  [named("Artist A - My Song.txt"), named("Artist B - My Song.txt")]
);
assert.equal(artistSpecific.get(artistA)?.status, "unique");
assert.equal(artistSpecific.get(artistB)?.status, "unique");

const validLrc = "[00:01.00] First line\n[00:03.50] Second line";
assert.deepEqual(validateImportedLrc(validLrc), {
  valid: true,
  timedLineCount: 2,
  plainText: "First line\nSecond line",
});
assert.equal(validateImportedLrc("[00:61.00] Broken").error, "malformed_timestamp");
assert.equal(
  validateImportedLrc("[00:03.00] Later\n[00:01.00] Earlier").error,
  "timestamps_out_of_order"
);
assert.equal(validateImportedLrc("Plain lyric only").error, "no_timed_lines");

const supplied = normalizeLyricsForPersistence({ syncedLrcText: validLrc });
assert.equal(supplied.lyricsType, "lrc");
assert.equal(supplied.syncedLrc, validLrc);

const embeddedPlain = normalizeLyricsForPersistence({
  plainLyricsText: "Embedded lyric line",
});
assert.equal(embeddedPlain.lyricsType, "plain");
assert.equal(embeddedPlain.syncedLrc, null);

const noLyrics = normalizeLyricsForPersistence({});
assert.equal(noLyrics.hasLyrics, false);
assert.equal(noLyrics.lyricsType, null);

const malformedFallback = normalizeLyricsForPersistence({
  syncedLrcText: "[00:61.00] Broken lyric",
});
assert.equal(malformedFallback.lyricsType, "plain");
assert.equal(malformedFallback.syncedLrc, null);

const failedAlignmentFallback = normalizeLyricsForPersistence({
  plainLyricsText: "Real words remain plain",
});
assert.equal(failedAlignmentFallback.lyricsType, "plain");
assert.equal(failedAlignmentFallback.syncedLrc, null);

const accompanyingOnly = resolveUploadLyrics({
  accompanyingPlainLyricsText: "Trusted accompanying words",
});
assert.equal(accompanyingOnly.plainLyricsText, "Trusted accompanying words");
assert.equal(accompanyingOnly.syncedLrcText, "");
assert.equal(accompanyingOnly.source, "accompanying");
assert.equal(
  isUploadAlignmentCandidate({
    plainLyricsText: accompanyingOnly.plainLyricsText,
    companionMatchStatus: "none",
    hasExplicitAccompanyingText: true,
  }),
  true
);

const explicitBeatsCompanionAndEmbedded = resolveUploadLyrics({
  accompanyingPlainLyricsText: "Explicit accompanying text",
  companionPlainLyricsText: "Companion text",
  embeddedPlainLyricsText: "Embedded text",
  manualPlainLyricsText: "Manual fallback",
});
assert.equal(
  explicitBeatsCompanionAndEmbedded.plainLyricsText,
  "Explicit accompanying text"
);

const companionOnly = resolveUploadLyrics({
  companionPlainLyricsText: "Automatically matched companion text",
});
assert.equal(
  companionOnly.plainLyricsText,
  "Automatically matched companion text"
);
assert.equal(companionOnly.source, "companion");
assert.equal(
  isUploadAlignmentCandidate({
    plainLyricsText: companionOnly.plainLyricsText,
    companionMatchStatus: "unique",
    hasExplicitAccompanyingText: false,
  }),
  true
);

const validLrcBeatsAccompanying = resolveUploadLyrics({
  suppliedLrcText: validLrc,
  accompanyingPlainLyricsText: "Explicit accompanying text",
  automaticSyncedLrcText: "[00:09.00] Generated line",
});
assert.equal(validLrcBeatsAccompanying.syncedLrcText, validLrc);
assert.equal(validLrcBeatsAccompanying.source, "supplied-lrc");

assert.equal(
  isUploadAlignmentCandidate({
    plainLyricsText: "Explicit accompanying text",
    companionMatchStatus: "ambiguous",
    hasExplicitAccompanyingText: true,
  }),
  true
);
assert.equal(
  isUploadAlignmentCandidate({
    plainLyricsText: "Ambiguous companion text",
    companionMatchStatus: "ambiguous",
    hasExplicitAccompanyingText: false,
  }),
  false
);
assert.equal(
  isUploadAlignmentCandidate({
    plainLyricsText: "Explicit accompanying text",
    syncedLrcText: validLrc,
    hasExplicitAccompanyingText: true,
  }),
  false
);

const timedWords = "we walk through low light and wait for morning"
  .split(" ")
  .map((word, index) => ({ word, start: 1 + index * 0.5, end: 1.4 + index * 0.5 }));
const realSuccess = alignLyricsToWordTimestamps(
  "We walk through low light\nAnd wait for morning",
  timedWords
);
assert.equal(realSuccess.ok, true);
const realFailure = alignLyricsToWordTimestamps(
  "Nothing here matches",
  timedWords
);
assert.equal(realFailure.ok, false);

// Retrying reuses the same selected lyrics; only a successful alignment may add LRC.
const retrySuccess = alignLyricsToWordTimestamps(
  "We walk through low light\nAnd wait for morning",
  timedWords
);
assert.equal(retrySuccess.ok, true);
assert.equal(
  normalizeLyricsForPersistence({
    plainLyricsText: "We walk through low light\nAnd wait for morning",
    syncedLrcText: retrySuccess.lrcText,
  }).lyricsType,
  "lrc"
);

const mixedBatch = [
  normalizeLyricsForPersistence({ syncedLrcText: validLrc }),
  normalizeLyricsForPersistence({ plainLyricsText: "Plain fallback" }),
  normalizeLyricsForPersistence({}),
];
assert.deepEqual(mixedBatch.map((item) => item.lyricsType), ["lrc", "plain", null]);

const routePath = fileURLToPath(
  new URL("../app/api/admin/upload-track/route.ts", import.meta.url)
);
const routeSource = readFileSync(routePath, "utf8");
assert.doesNotMatch(routeSource, /generateEstimatedLrc|auto_estimated_lrc/);
assert.match(routeSource, /normalizeLyricsForPersistence/);
assert.match(routeSource, /audio_alignment_unverified/);

const uploaderPath = fileURLToPath(
  new URL("../components/BulkUploadPanel.tsx", import.meta.url)
);
const uploaderSource = readFileSync(uploaderPath, "utf8");
assert.match(uploaderSource, /retryFailedAlignment/);
assert.match(uploaderSource, /persistRetriedAlignment/);
assert.doesNotMatch(uploaderSource, /globalLyrics|globalLrc/);
assert.match(uploaderSource, /accompanyingPlainLyricsText\?: string/);
assert.match(uploaderSource, /function setAccompanyingPlainLyrics/);
assert.match(uploaderSource, /Edit \/ supply lyrics \(fallback\)/);
assert.match(
  uploaderSource,
  /Matching TXT\/lyrics files and supported embedded text[\s\S]*detected automatically/
);
assert.match(uploaderSource, /Auto-Sync Against Audio/);
assert.match(uploaderSource, /transcriptionCandidates/);
assert.match(uploaderSource, /function transcribeAudioLyrics/);
assert.match(uploaderSource, /Transcribing &amp; syncing lyrics/);
assert.match(uploaderSource, /Retry audio transcription/);
assert.match(uploaderSource, /audio_transcription_unverified/);
assert.match(uploaderSource, /item\.file,[\s\S]*item\.accompanyingPlainLyricsText/);
assert.match(
  uploaderSource,
  /item\.accompanyingPlainLyricsText \|\| item\.reviewPlainLyricsText/
);
assert.doesNotMatch(
  uploaderSource,
  /alignTrackPlainLyrics[\s\S]{0,800}item\.lyricsFile/
);
assert.doesNotMatch(uploaderSource, /generateEstimatedLrc|auto_estimated_lrc/);

const alignmentRoutePath = fileURLToPath(
  new URL("../app/api/admin/align-lyrics/route.ts", import.meta.url)
);
const alignmentRouteSource = readFileSync(alignmentRoutePath, "utf8");
assert.match(alignmentRouteSource, /ADMIN_AUDIO_LYRIC_ALIGNMENT_ENABLED/);
assert.match(alignmentRouteSource, /Automatic lyric alignment is disabled/);
assert.match(alignmentRouteSource, /mode === "transcribe"/);
assert.match(alignmentRouteSource, /buildAudioTranscriptionLyrics/);
assert.match(alignmentRouteSource, /audio_transcription_unverified/);
assert.doesNotMatch(
  alignmentRouteSource,
  /generateEstimatedLrc|duration\s*\/|evenly|auto_estimated_lrc/
);

console.log("lyrics upload safety tests passed");
