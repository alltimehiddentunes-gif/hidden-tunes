import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const componentPath = fileURLToPath(
  new URL("../components/catalog/HomePlaybackRows.tsx", import.meta.url)
);
const source = readFileSync(componentPath, "utf8");

assert.match(source, /styles\.featuredArtFrameGrid/);
assert.match(source, /numberOfLines=\{2\}[\s\S]*styles\.featuredTitle/);
assert.match(source, /numberOfLines=\{1\}[\s\S]*styles\.featuredArtist/);
const artworkStart = source.indexOf("styles.featuredArtFrame,");
const rankStart = source.indexOf("style={styles.featuredRank}", artworkStart);
const playStart = source.indexOf("style={styles.featuredPlay}", rankStart);
const contentStart = source.indexOf("style={styles.featuredContent}", playStart);
assert.ok(artworkStart >= 0 && rankStart > artworkStart, "rank must be inside artwork section");
assert.ok(playStart > rankStart && contentStart > playStart, "play overlay must precede metadata panel");
assert.match(source, /featuredArtFrame:\s*\{[\s\S]*position:\s*"relative"/);
assert.match(source, /featuredContent:\s*\{[\s\S]*flex:\s*1/);
assert.match(source, /featuredPlay:\s*\{[\s\S]*position:\s*"absolute"[\s\S]*right:\s*12[\s\S]*bottom:\s*12/);
assert.doesNotMatch(source, /"HIDDEN TUNES"/);
assert.doesNotMatch(source, /styles\.featuredOverlay/);

const touchableCount = (source.match(/<TouchableOpacity/g) || []).length;
assert.equal(touchableCount, 1, "HomeFeaturedCard must keep one full-card press target");

console.log("Home card layout contract: PASS");
