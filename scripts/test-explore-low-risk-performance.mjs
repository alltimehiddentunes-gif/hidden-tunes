import assert from "node:assert/strict";
import fs from "node:fs";

const explore = fs.readFileSync("app/worlds/index.tsx", "utf8");
const lockscreen = fs.readFileSync("utils/lockscreenPlaybackDiagnostics.ts", "utf8");
const tv = fs.readFileSync("services/tv/tvMediaSessionDiagnostics.ts", "utf8");

assert.match(
  lockscreen,
  /if \(__DEV__ && shouldRecordLockscreenEvent\(event\)\) \{\s*console\.log\(`/,
  "lock-screen console output must use the existing opt-in/failure gate"
);
assert.match(
  lockscreen,
  /if \(isLockscreenDiagnosticsLoggingEnabled\(\)\) return true;\s*return isPlaybackFailureEvent\(event\);/,
  "explicit diagnostics and failure events must remain recordable"
);
assert.match(
  tv,
  /if \(!isVerbosePlaybackDiagnosticsEnabled\(\)\) return;\s*console\.log\("\[HTTVNowPlayingDiag\]"/,
  "TV console output must use the existing verbose diagnostics gate"
);
assert.match(
  tv,
  /export function endTvMediaSessionTrace[\s\S]*?activeCorrelationId = null;/,
  "TV trace cleanup must remain intact"
);

const initialCache = explore.indexOf("const [initialCatalog] = useState");
const initialCatalogState = explore.indexOf("() => initialCatalog || EMPTY_CATALOG");
const hydration = explore.indexOf("const preferencesTask = hydrateDiscoveryPreferredGenres()");
assert.ok(initialCache >= 0 && initialCache < hydration, "usable cache must be read before preference hydration");
assert.ok(
  initialCatalogState > initialCache && initialCatalogState < hydration,
  "usable cache must seed visible catalog state before preference hydration"
);
assert.match(explore, /return cached\?\.songs\.length \? cached : null;/, "any usable memory cache must seed the first render");

const loadStart = explore.indexOf("const loadExplore = useCallback");
const loadEnd = explore.indexOf("useEffect(() =>", loadStart);
const loadSource = explore.slice(loadStart, loadEnd);
assert.doesNotMatch(loadSource, /setCatalog\(EMPTY_CATALOG\)|setMoodRooms\(\[\]\)/, "load failures must not blank cached content");
assert.match(
  loadSource,
  /current\.length === hydratedGenres\.length[\s\S]*?current\.every[\s\S]*?\? current\s*: \[\.\.\.hydratedGenres\]/,
  "preference hydration must update state only when values differ"
);
assert.match(
  explore,
  /sortItemsByPreferredGenres\(genres, preferredGenres\)/,
  "hydrated preferences must still personalize genres"
);

assert.match(explore, /await hydrateCachedHiddenTunesCatalog\(\)/, "cold Explore must hydrate persisted catalog data");
assert.match(loadSource, /if \(cached\?\.songs\.length\) applyCatalog\(cached\)/, "memory cache must render immediately");
assert.doesNotMatch(loadSource, /setCatalog\(EMPTY_CATALOG\)|setMoodRooms\(\[\]\)/, "refresh must preserve rendered content");
assert.match(loadSource, /Promise\.allSettled\(\[preferencesTask, catalogTask\]\)/, "preferences and catalog must settle independently");
assert.match(loadSource, /setLoading\(false\)/, "all completion paths must exit global loading");
assert.match(loadSource, /loadInFlightRef\.current/, "identical concurrent Explore loads must share one request");
assert.match(loadSource, /generation !== loadGenerationRef\.current/, "stale Explore responses must be ignored");
assert.match(explore, /mountedRef\.current = false;[\s\S]*loadGenerationRef\.current \+= 1;/, "unmounted Explore must invalidate pending responses");
assert.match(explore, /onPress=\{\(\) => void loadExplore\(true\)\}/, "explicit refresh must force a catalog refresh");
assert.equal((explore.match(/setTimeout\(/g) || []).length, 1, "Explore must not introduce polling timers");
assert.doesNotMatch(explore, /usePlayerProgress/, "Explore must not subscribe to playback progress");

assert.match(explore, /const decodeScale = Math\.min\(PixelRatio\.get\(\), 3\)/, "decode sizing must preserve up to 3x Retina density");
const expectedBounds = [
  ["heroWidth", "356"],
  ["136", "116"],
  ["featureCardWidth", "214"],
  ["featureCardWidth - 20", "154"],
  ["albumCardWidth - 20", "136"],
  ["albumCardWidth - 20", "146"],
  ["albumCardWidth - 20", "146"],
  ["creatorCardWidth - 20", "134"],
];
for (const [width, height] of expectedBounds) {
  const bound = new RegExp(`maxDecodeWidth=\\{decodePixels\\(${width.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\)\\}\\s*maxDecodeHeight=\\{decodePixels\\(${height}\\)\\}`);
  assert.match(explore, bound, `missing card-sized decode bounds ${width} x ${height}`);
}

for (const contract of [
  "onPress={() => openCarouselItem(item)}",
  "onPress={() => openRoom(room)}",
  "onPress={() => openGenre(genre)}",
  "onPress={() => openAlbum(item.album)}",
  "onPress={() => openArtist(artist)}",
]) {
  assert.ok(explore.includes(contract), `navigation/tap contract changed: ${contract}`);
}

console.log("Explore low-risk performance contracts passed.");
