import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the actual pure mapping without loading React Native or a media engine.
const source = readFileSync(new URL("../context/TvPlaybackContext.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("TvPlaybackContext.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const mapping = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "authorizedTvPlayback");
assert.ok(mapping);
const js = ts.transpileModule(`${mapping.getText(file)}\nglobalThis.mapPlayback = authorizedTvPlayback;`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const context = { URL, mapPlayback: null as any };
runInNewContext(js, context);
const original = { id: "canonical-tv-id", source_id: "staleYoutube1", source_type: "youtube_video", stream_url: "https://stale.invalid/video", embed_url: "https://stale.invalid/embed" };
const direct = context.mapPlayback(original, { enforced: true, revision: 1, delivery: "direct", playbackUrl: "https://controlled.invalid/live.m3u8" });
assert.equal(direct.stream_url, "https://controlled.invalid/live.m3u8");
assert.equal(direct.source_type, "official_stream");
assert.equal(direct.source_id, original.id, "cached YouTube ID cannot redirect authoritative direct playback");
assert.equal(direct.embed_url, null);
const embed = context.mapPlayback(original, { enforced: true, revision: 1, delivery: "embed", playbackUrl: "https://www.youtube.com/embed/Abcdef12345?autoplay=1" });
assert.equal(embed.stream_url, "", "an iframe URL must not reach the native stream surface");
assert.equal(embed.embed_url, "https://www.youtube.com/embed/Abcdef12345?autoplay=1");
assert.equal(embed.source_id, "Abcdef12345", "server embed identity replaces stale cached video ID");
assert.equal(embed.source_type, "youtube_video");
for (const playbackUrl of ["https://archive.org/embed/item", "https://www.youtube.com.evil.invalid/embed/Abcdef12345", "https://www.youtube.com/embed/not-valid"]) {
  assert.throws(() => context.mapPlayback(original, { enforced: true, revision: 1, delivery: "embed", playbackUrl }));
}
assert.throws(() => context.mapPlayback(original, { enforced: true, revision: 1, delivery: "external", playbackUrl: "https://external.invalid" }));
assert.equal(original.stream_url, "https://stale.invalid/video", "mapping does not mutate cached input");
assert.equal(original.source_id, "staleYoutube1");
console.log("PASS iOS TV delivery: canonical direct/embed identity, no iframe-as-stream, unsupported embeds fail closed, cached input intact");
