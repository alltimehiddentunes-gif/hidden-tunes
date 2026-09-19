import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const host = read("components/tv/TvPlayerHost.tsx");
const tvHome = read("app/youtube-feed.tsx");
const navigation = read("utils/tvNavigation.ts");
const card = read("components/tv/TvVideoCard.tsx");
const history = read("services/tv/tvRecentlyWatched.ts");
const page = read("app/youtube-feed.tsx");
const handleBack = host.match(
  /const handleBack = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]+\]\);/
)?.[0] || "";
const handleHeaderClose = host.match(
  /const handleHeaderClose = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]+\]\);/
)?.[0] || "";

assert.match(host, /exitInFlightRef\.current/, "TV exit is idempotent");
assert.match(host, /resolveTvPlayerExitTarget\(\)/, "destination is captured first");
assert.match(host, /setClosingTarget\(target\);[\s\S]*?navigateTvPlayerToTarget\(target\)/, "navigation begins while the persistent host remains mounted");
assert.match(host, /isTvCloseDestinationCommitted\(pathname, closingTarget\)[\s\S]*?isFreshTvCloseDestinationRender[\s\S]*?onStop\(\)/, "teardown waits for committed destination and its explicit render signal");
assert.match(tvHome, /useFocusEffect\(useCallback\([\s\S]*?markTvCloseDestinationRendered\("\/youtube-feed"\)/, "TV home confirms every focus, not only its first mount");
assert.doesNotMatch(host, /navigateTvPlayerToTarget\(target\);\s*setIsUiFullscreen\(false\);\s*void restoreTvPortraitOrientation\(\)\.catch\(\(\) => undefined\);\s*onStop\(\)/, "navigation and teardown are not synchronous");
assert.match(host, /closeFinalizedRef\.current/, "teardown finalizes once");
assert.match(host, /setTimeout\([\s\S]*?setShowClosingFallback\(true\)[\s\S]*?TV_HOME_ROUTE[\s\S]*?2_500/, "timeout uses a bounded branded fallback");
assert.match(host, /showClosingFallback[\s\S]*?HIDDEN TUNES[\s\S]*?Returning to TV/, "pending fallback never exposes the route shell");
assert.match(host, /const closeFullPlayer = useCallback/, "TV close has one shared pathway");
assert.match(host, /hardwareBackPress[\s\S]*?handleBack\(\)/, "system Back uses preserve-session navigation");
assert.match(handleBack, /navigateTvPlayerBack\(\)/, "Back uses the TV browse-return helper");
assert.doesNotMatch(handleBack, /closeFullPlayer|onStop/, "Back never tears down TV playback");
assert.match(handleHeaderClose, /closeFullPlayer\(\)/, "X uses the explicit close pathway");
assert.doesNotMatch(handleHeaderClose, /handleExitFullscreen/, "fullscreen X remains an explicit close");
assert.match(host, /accessibilityLabel="Close"[\s\S]*?<Ionicons name="close"/, "fullscreen close control remains visible and distinct");
assert.match(host, /onPress=\{full \? closeFullPlayer : onStop\}/, "full-player stop cannot expose the route shell");
assert.match(host, /backgroundColor: "rgba\(0,0,0,0\.72\)"/, "full controls retain strong video contrast");
assert.match(navigation, /router\.replace\(normalizeReturnPath\(target\)/, "exit is deterministic");
assert.match(navigation, /navigateTvPlayerBack[\s\S]*?canNavigateBack\(\)[\s\S]*?router\.back\(\)/, "Back restores retained TV browse/category state");
assert.match(read("app/tv-player.tsx"), /backgroundColor: "#000000"/, "route shell cannot expose a white native window");

assert.match(card, /contentFit="contain"/, "station logos preserve aspect ratio");
assert.match(card, /failedArtworkSource !== artworkSourceKey/, "recycled cards isolate stale failures by source");
assert.match(card, /recyclingKey=\{video\.id\}/, "logo is associated with station ID");

assert.match(history, /MAX_RECENT_ENTRIES = 20/, "history is bounded");
assert.match(history, /pendingChannels\.set/, "resolved sessions only stage history");
assert.match(host, /5_000/, "confirmed playback has a five-second threshold");
assert.match(host, /confirmTvRecentlyWatched/, "playing host confirms history");
assert.match(
  host,
  /recentlyWatchedStageRef\.current !== stageKey/,
  "a playback generation stages history once"
);
assert.doesNotMatch(
  host,
  /finalizeAfterDestinationRender[\s\S]*?await confirmTvRecentlyWatched/,
  "X close cannot bypass the five-second qualification"
);
assert.match(
  host,
  /displayChannel\?\.id \|\| item\.id/,
  "catalog sessions use the canonical current item ID"
);
assert.match(history, /item\.channelId !== normalizedChannelId/, "rewatch deduplicates");
assert.match(page, /title: "Recently Watched"/, "TV page presents genuine history");
assert.match(page, /const currentTvById = useMemo/, "catalog indexing is memoized separately");
assert.match(page, /currentTvById\.get/, "history joins through the memoized catalog index");
assert.doesNotMatch(page, /recentlyAddedLane/, "Recently Added presentation is removed");

console.log("PASS: safe TV exit, station logo, and recently watched contracts");
