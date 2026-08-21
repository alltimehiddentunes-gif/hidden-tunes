import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const host = read("components/tv/TvPlayerHost.tsx");
const navigation = read("utils/tvNavigation.ts");
const card = read("components/tv/TvVideoCard.tsx");
const history = read("services/tv/tvRecentlyWatched.ts");
const page = read("app/youtube-feed.tsx");

assert.match(host, /exitInFlightRef\.current/, "TV exit is idempotent");
assert.match(host, /resolveTvPlayerExitTarget\(\)/, "destination is captured first");
assert.match(host, /navigateTvPlayerToTarget\(target\);[\s\S]*?onStop\(\)/, "destination precedes teardown");
assert.match(host, /const closeFullPlayer = useCallback/, "TV close has one shared pathway");
assert.match(host, /hardwareBackPress[\s\S]*?closeFullPlayer\(\)/, "system Back uses shared close");
assert.match(host, /onPress=\{full \? closeFullPlayer : onStop\}/, "full-player stop cannot expose the route shell");
assert.match(host, /backgroundColor: "rgba\(0,0,0,0\.72\)"/, "full controls retain strong video contrast");
assert.match(navigation, /router\.replace\(normalizeReturnPath\(target\)/, "exit is deterministic");
assert.doesNotMatch(host, /navigateTvPlayerBack/, "host has one exit path");

assert.match(card, /contentFit="contain"/, "station logos preserve aspect ratio");
assert.match(card, /failedArtworkSource !== artworkSourceKey/, "recycled cards isolate stale failures by source");
assert.match(card, /recyclingKey=\{video\.id\}/, "logo is associated with station ID");

assert.match(history, /MAX_RECENT_ENTRIES = 20/, "history is bounded");
assert.match(history, /pendingChannels\.set/, "resolved sessions only stage history");
assert.match(host, /5_000/, "confirmed playback has a five-second threshold");
assert.match(host, /confirmTvRecentlyWatched/, "playing host confirms history");
assert.match(history, /item\.channelId !== channel\.id/, "rewatch deduplicates");
assert.match(page, /title: "Recently Watched"/, "TV page presents genuine history");
assert.doesNotMatch(page, /recentlyAddedLane/, "Recently Added presentation is removed");

console.log("PASS: safe TV exit, station logo, and recently watched contracts");
