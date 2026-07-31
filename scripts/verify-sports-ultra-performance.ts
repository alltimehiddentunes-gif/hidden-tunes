/**
 * Sports ultra-performance contract checks (no device / no native build).
 * Run: npx tsx scripts/verify-sports-ultra-performance.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sportsFixtureGridColumns } from "../lib/sports/ui/fixtureGridColumns";
import {
  SPORTS_TV_CATEGORY,
  SPORTS_TV_MAX_PAGES_IN_MEMORY,
  SPORTS_TV_PAGE_LIMIT,
} from "../lib/sports/sportsTvConstants";
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
assert(SPORTS_TV_CATEGORY === "Sports", "TV category must be Sports");
assert(
  SPORTS_TV_PAGE_LIMIT >= 12 && SPORTS_TV_PAGE_LIMIT <= 24,
  "Sports TV page limit must stay in 12–24 band"
);
assert(SPORTS_TV_MAX_PAGES_IN_MEMORY <= 4, "Sports TV memory pages must be bounded");
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

const tvHookSrc = read("hooks/useSportsTvCatalog.ts");
assert(
  tvHookSrc.includes("SPORTS_TV_MAX_PAGES_IN_MEMORY"),
  "TV hook must cap retained pages"
);
assert(
  tvHookSrc.includes('mode === "replace"') &&
    tvHookSrc.includes("Keep previously loaded"),
  "TV hook must retain pages on error"
);
assert(
  !tvHookSrc.includes("setVideos([])") ||
    /if \(!enabled\)[\s\S]*setVideos\(\[\]\)/.test(tvHookSrc),
  "TV hook must not blank videos on replace error"
);
assert(
  tvHookSrc.includes("Soft refresh") || tvHookSrc.includes("hadContent"),
  "TV hook must soft-refresh without blanking shelf"
);

const shelfSrc = read("components/sports/SportsTvShelf.tsx");
assert(
  shelfSrc.includes("openTvDiscoveryStation"),
  "TV shelf must hand off to existing TV owner"
);
assert(
  !/from ["']expo-video["']/.test(shelfSrc),
  "TV shelf must not mount expo-video"
);
assert(
  shelfSrc.includes("openingRef"),
  "TV shelf must guard duplicate tap handoffs"
);

const cardSrc = read("components/sports/SportsTvChannelCard.tsx");
assert(
  /width:\s*96/.test(cardSrc) && /height:\s*96/.test(cardSrc),
  "TV cards must request thumbnail-sized decode hints"
);
assert(
  cardSrc.includes('cachePolicy="memory-disk"'),
  "TV cards must use persistent image cache"
);
assert(
  !cardSrc.includes("/play") && !cardSrc.includes("fetchTvPlayback"),
  "TV cards must not probe playability"
);

const searchSrc = read("app/sports/search.tsx");
assert(searchSrc.includes("MIN_QUERY_LENGTH"), "search must enforce min query length");
assert(searchSrc.includes("DEBOUNCE_MS"), "search must debounce");
assert(searchSrc.includes("abortRef"), "search must cancel obsolete requests");
assert(
  searchSrc.includes('category: "Sports"'),
  "TV search must stay Sports-scoped"
);

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

const envLocal = read(".env.local");
assert(
  /EXPO_PUBLIC_SPORTS_STREAMS_ENABLED\s*=\s*false/.test(envLocal),
  "pilot env keeps fixture streams off"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      sportsTvPageLimit: SPORTS_TV_PAGE_LIMIT,
      sportsTvMaxPages: SPORTS_TV_MAX_PAGES_IN_MEMORY,
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
