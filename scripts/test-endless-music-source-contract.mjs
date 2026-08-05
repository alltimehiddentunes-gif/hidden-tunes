import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const player = fs.readFileSync(path.join(root, "context", "PlayerContext.tsx"), "utf8");
const service = fs.readFileSync(path.join(root, "services", "endlessMusicContinuation.ts"), "utf8");

assert.match(player, /syncActiveQueue\(updatedQueue, retainedIndex, "smart", nextContext\)/);
assert.match(player, /continuationGenerationRef/);
assert.match(player, /continuationRefillInFlightRef/);
assert.match(player, /shouldIncludeMatureInApi\(\)/);
assert.match(player, /isPodcastPlaybackDomain/);
assert.match(player, /isAudiobookPlaybackDomain/);
assert.match(player, /isLiveRadioPlaybackDomain/);
assert.doesNotMatch(player, /fetchAllHiddenTunesCatalogSongs/);
assert.doesNotMatch(service, /setInterval|setTimeout|fetch\(/);
assert.match(service, /candidateCap:\s*180/);
assert.match(service, /queueCap:\s*50/);
assert.match(service, /lowWater:\s*5/);
assert.match(service, /refillBatch:\s*10/);
assert.match(service, /discoveryRatio:\s*0\.1/);

console.log("PASS endless music source contract: one queue owner, bounded refill, no polling or full-catalog request");
