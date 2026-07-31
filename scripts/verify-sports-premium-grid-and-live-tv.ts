/**
 * Verify Sports premium grid + Live Sports TV wiring without a device.
 * Run: npx tsx scripts/verify-sports-premium-grid-and-live-tv.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sportsFixtureGridColumns } from "../lib/sports/ui/fixtureGridColumns";
import {
  SPORTS_TV_CATEGORY,
  SPORTS_TV_PAGE_LIMIT,
} from "../lib/sports/sportsTvConstants";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const phoneWidths = [360, 390, 414].map((w) => w - 36);
for (const available of phoneWidths) {
  const cols = sportsFixtureGridColumns(available);
  assert(cols === 2, `expected 2 columns at available=${available}, got ${cols}`);
}

assert(sportsFixtureGridColumns(280) === 1, "very narrow should be 1");
assert(sportsFixtureGridColumns(700) >= 2, "tablet-ish should be >=2");
assert(sportsFixtureGridColumns(1000) >= 3, "wide should be >=3");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const typesSrc = fs.readFileSync(path.join(root, "types/sports.ts"), "utf8");
assert(
  /live_sports_tv:\s*15/.test(typesSrc),
  "live_sports_tv must rank immediately after live_now"
);

const flagsSrc = fs.readFileSync(path.join(root, "constants/sportsFlags.ts"), "utf8");
assert(
  flagsSrc.includes("sports_tv_enabled"),
  "sports_tv_enabled flag must exist"
);
assert(
  /sports_streams_enabled:\s*false/.test(flagsSrc),
  "fixture streams must remain disabled by default"
);

assert(SPORTS_TV_CATEGORY === "Sports", "Sports TV category must be Sports");
assert(SPORTS_TV_PAGE_LIMIT <= 50, "Sports TV page must stay bounded");

const bannedFiles = [
  "components/sports/SportsVideoPlayer.tsx",
  "components/sports/SportsTvPlayer.tsx",
  "context/SportsTvPlaybackContext.tsx",
];
for (const rel of bannedFiles) {
  assert(!fs.existsSync(path.join(root, rel)), `must not create ${rel}`);
}

const shelfSrc = fs.readFileSync(
  path.join(root, "components/sports/SportsTvShelf.tsx"),
  "utf8"
);
assert(
  shelfSrc.includes("openTvDiscoveryStation"),
  "Sports TV shelf must hand off to openTvDiscoveryStation"
);
assert(
  !/from ["']expo-video["']/.test(shelfSrc) &&
    !/\bVideoView\b/.test(shelfSrc) &&
    !/\buseVideoPlayer\b/.test(shelfSrc),
  "Sports TV shelf must not mount expo-video"
);
assert(
  shelfSrc.includes("buildTvDiscoveryLaunchContext"),
  "Sports TV must build canonical TV discovery context"
);

const indexSrc = fs.readFileSync(path.join(root, "app/sports/index.tsx"), "utf8");
assert(indexSrc.includes("SportsTvShelf"), "Sports home must render SportsTvShelf");
assert(indexSrc.includes('columns="auto"'), "Sports home fixtures must use auto columns");
assert(indexSrc.includes("Live sports channels are available below"), "compact no-live hint");

const searchSrc = fs.readFileSync(path.join(root, "app/sports/search.tsx"), "utf8");
assert(searchSrc.includes('category: "Sports"'), "Sports search TV query scoped to Sports");
assert(searchSrc.includes("openTvDiscoveryStation"), "Sports search TV taps use TV owner");
assert(searchSrc.includes("Live Sports TV"), "Sports search labels Live Sports TV");

const cardSrc = fs.readFileSync(
  path.join(root, "components/sports/SportsMatchCard.tsx"),
  "utf8"
);
assert(!cardSrc.includes("CARD_WIDTH = 196"), "fixed 196px card width must be removed");
assert(cardSrc.includes('width: "100%"'), "fixture cards fill grid cells");

const envLocal = fs.readFileSync(path.join(root, ".env.local"), "utf8");
assert(
  /EXPO_PUBLIC_SPORTS_TV_ENABLED\s*=\s*true/.test(envLocal),
  "pilot env enables sports_tv"
);
assert(
  /EXPO_PUBLIC_SPORTS_STREAMS_ENABLED\s*=\s*false/.test(envLocal),
  "pilot env keeps fixture streams off"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      phoneColumns: phoneWidths.map((w) => ({
        available: w,
        columns: sportsFixtureGridColumns(w),
      })),
      sportsTvCategory: SPORTS_TV_CATEGORY,
      sportsTvPageLimit: SPORTS_TV_PAGE_LIMIT,
    },
    null,
    2
  )
);
