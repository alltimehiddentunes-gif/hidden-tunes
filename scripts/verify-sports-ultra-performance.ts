/**
 * Sports ultra-performance contract checks (no device / no native build).
 * Run: npx tsx scripts/verify-sports-ultra-performance.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sportsFixtureGridColumns } from "../lib/sports/ui/fixtureGridColumns";
import { SPORTS_SECTION_LIMITS } from "../lib/sports/ui/homeSections";
import {
  __resetSportsBrowseCacheForTests,
  __sportsBrowseCacheSizeForTests,
  getSportsBrowseCache,
  setSportsBrowseCache,
  sportsHomeCacheKey,
  sportsSearchCacheKey,
  SPORTS_HOME_CACHE_TTL_MS,
} from "../services/sports/sportsBrowseCache";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

// --- Grid columns ---
for (const available of [324, 354, 378]) {
  assert(
    sportsFixtureGridColumns(available) === 2,
    `expected 2 columns at available=${available}`
  );
}
assert(SPORTS_SECTION_LIMITS.schedule <= 24, "schedule render bound must be capped");
assert(SPORTS_SECTION_LIMITS.horizontal <= 12, "shelf render bound must be capped");

// --- No second player ---
for (const banned of [
  "components/sports/SportsVideoPlayer.tsx",
  "components/sports/SportsTvPlayer.tsx",
  "context/SportsTvPlaybackContext.tsx",
]) {
  assert(!fs.existsSync(path.join(root, banned)), `must not create ${banned}`);
}

const flagsSrc = read("constants/sportsFlags.ts");
assert(
  /sports_streams_enabled:\s*false/.test(flagsSrc),
  "fixture streams must remain disabled by default"
);

const indexSrc = read("app/sports/index.tsx");
assert(
  indexSrc.includes("sportsLiveScoresEnabled"),
  "home must gate live polling on live scores flag"
);
assert(
  !indexSrc.includes("sportsStreamsEnabled"),
  "home must not poll from streams flag"
);
assert(
  indexSrc.includes("SPORTS_HOME_STALE_MS"),
  "home must use stale-aware focus/AppState refresh"
);
assert(
  indexSrc.includes("skipPrefs"),
  "background refresh must be able to skip prefs reloads"
);
assert(
  indexSrc.includes("initialNumToRender={6}"),
  "home FlatList must use measured initialNumToRender"
);
assert(
  indexSrc.includes("windowSize={5}"),
  "home FlatList must use measured windowSize"
);
assert(
  /removeClippedSubviews=\{Platform\.OS === ["']android["']\}/.test(indexSrc),
  "iOS must not force removeClippedSubviews"
);
assert(
  indexSrc.includes("forceNetwork"),
  "home must support forceNetwork for refresh vs cache"
);

const playerShellSrc = read("components/sports/SportsPlayerShell.tsx");
const nativeSurfaceSrc = read("components/sports/SportsNativeVideoSurface.tsx");
assert(
  playerShellSrc.includes("SportsNativeVideoSurface"),
  "Sports player shell must own the isolated native surface"
);
assert(
  nativeSurfaceSrc.includes('from "expo-video"'),
  "Sports native surface must reuse installed expo-video"
);
assert(
  !indexSrc.includes("SportsNativeVideoSurface") &&
    !indexSrc.includes("VideoView"),
  "Sports browse lists must not mount or preload video"
);

const searchSrc = read("app/sports/search.tsx");
assert(!searchSrc.includes("VideoView"), "Sports search must not preload video");
assert(searchSrc.includes("MIN_QUERY_LENGTH"), "search must enforce min query length");
assert(searchSrc.includes("DEBOUNCE_MS"), "search must debounce");
assert(searchSrc.includes("abortRef"), "search must cancel obsolete requests");
assert(!searchSrc.includes("fetchTv"), "Sports search must not query TV");

const countrySrc = read("app/sports/country/[code].tsx");
assert(countrySrc.includes("FlatList"), "country hub must use FlatList owner");
assert(
  !/from ["']react-native["'][\s\S]*?\bScrollView\b/.test(countrySrc) &&
    !countrySrc.includes("ScrollView,"),
  "country hub must not import ScrollView"
);

const catalogSrc = read("services/sportsCatalogApi.ts");
assert(
  catalogSrc.includes("sportsBrowseCache"),
  "catalog API must use browse cache"
);
assert(
  catalogSrc.includes("forceNetwork"),
  "home fetch must support forceNetwork"
);
assert(
  /fetchSportsSportHub[\s\S]*fetchSportsFixtures[\s\S]*fetchSportsCompetitions/.test(
    catalogSrc
  ),
  "sport hub must still fetch fixtures + competitions"
);
assert(
  !/fetchSportsSportHub[\s\S]{0,400}fetchSportsList\(/.test(catalogSrc),
  "sport hub must not fan-out full sports list"
);
assert(
  !/fetchSportsCountryHub[\s\S]{0,500}fetchSportsCountries\(/.test(catalogSrc),
  "country hub must not fan-out full countries list"
);

// --- Browse cache behaviour ---
__resetSportsBrowseCacheForTests();
const homeKey = sportsHomeCacheKey("ZZ", "android", "public");
setSportsBrowseCache(homeKey, { enabled: true, sections: [{ id: "live_now" }] }, SPORTS_HOME_CACHE_TTL_MS);
assert(
  (getSportsBrowseCache<{ enabled?: boolean }>(homeKey)?.enabled === true),
  "home cache round-trip"
);
assert(__sportsBrowseCacheSizeForTests() === 1, "cache size after set");

const searchKey = sportsSearchCacheKey("arsenal", 1, 24, "ZZ", "android");
setSportsBrowseCache(searchKey, { enabled: true, groups: [] }, 1_000);
assert(getSportsBrowseCache(searchKey) != null, "search cache round-trip");
assert(
  homeKey !== searchKey,
  "home and search cache keys must not collide"
);
__resetSportsBrowseCacheForTests();
assert(__sportsBrowseCacheSizeForTests() === 0, "cache reset");

const easConfig = read("eas.json");
assert(
  /"EXPO_PUBLIC_SPORTS_STREAMS_ENABLED"\s*:\s*"false"/.test(easConfig),
  "production build profile keeps fixture streams off"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      listingVideoPreload: false,
      sectionLimits: SPORTS_SECTION_LIMITS,
      phoneColumns: [324, 354, 378].map((w) => ({
        available: w,
        columns: sportsFixtureGridColumns(w),
      })),
    },
    null,
    2
  )
);
