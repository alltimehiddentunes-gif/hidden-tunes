/**
 * Radio back-navigation contract: one tap → one logical parent (no history walk).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  RADIO_EXIT_FALLBACK_ROUTE,
  RADIO_HOME_ROUTE,
  RADIO_SEARCH_ROUTE,
  isValidRadioCategoryId,
  resolveRadioBackTarget,
} from "../utils/radioBackTargets";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function main() {
  // --- Pure parent map ---
  assert.equal(
    resolveRadioBackTarget({ screen: "home" }),
    RADIO_EXIT_FALLBACK_ROUTE,
    "Radio Home parent is Library fallback"
  );
  assert.equal(
    resolveRadioBackTarget({ screen: "category", categoryId: "browse-genre" }),
    RADIO_HOME_ROUTE,
    "category results → Radio Home"
  );
  assert.equal(
    resolveRadioBackTarget({ screen: "category", categoryId: "adult-talk" }),
    RADIO_HOME_ROUTE,
    "mature category results → Radio Home (no separate mature hub route)"
  );
  assert.equal(
    resolveRadioBackTarget({ screen: "search" }),
    RADIO_HOME_ROUTE,
    "search → Radio Home"
  );

  const fromSearch = resolveRadioBackTarget({
    screen: "player",
    searchQuery: "ghana",
  });
  assert.deepEqual(
    fromSearch,
    { pathname: "/stations/search", params: { q: "ghana" } },
    "player from search → search results with query"
  );

  const fromGenre = resolveRadioBackTarget({
    screen: "player",
    railId: "browse-genre",
  });
  assert.deepEqual(
    fromGenre,
    {
      pathname: "/stations/[categoryId]",
      params: { categoryId: "browse-genre" },
    },
    "player from genre category → same category results"
  );

  const fromCountry = resolveRadioBackTarget({
    screen: "player",
    railId: "browse-country",
  });
  assert.deepEqual(
    fromCountry,
    {
      pathname: "/stations/[categoryId]",
      params: { categoryId: "browse-country" },
    },
    "player from country category → same category results"
  );

  const fromMood = resolveRadioBackTarget({
    screen: "player",
    railId: "featured",
  });
  assert.deepEqual(
    fromMood,
    {
      pathname: "/stations/[categoryId]",
      params: { categoryId: "featured" },
    },
    "player from featured rail → featured category"
  );

  assert.deepEqual(
    resolveRadioBackTarget({
      screen: "player",
      origin: { type: "search", query: "afrobeats" },
    }),
    { pathname: "/stations/search", params: { q: "afrobeats" } },
    "explicit search origin → search results with query"
  );

  assert.equal(
    resolveRadioBackTarget({ screen: "player", railId: "not-a-real-category" }),
    RADIO_HOME_ROUTE,
    "invalid/missing origin → Radio Home"
  );

  assert.equal(
    resolveRadioBackTarget({
      screen: "player",
      origin: { type: "home" },
    }),
    RADIO_HOME_ROUTE,
    "home origin → Radio Home"
  );

  assert.equal(
    resolveRadioBackTarget({
      screen: "player",
      origin: { type: "recent" },
    }),
    RADIO_HOME_ROUTE,
    "recent origin → Radio Home"
  );

  assert.ok(isValidRadioCategoryId("browse-genre"), "browse-genre is valid");
  assert.ok(isValidRadioCategoryId("trending"), "trending is valid");
  assert.equal(isValidRadioCategoryId("zzz-missing"), false, "missing id invalid");
  assert.equal(RADIO_SEARCH_ROUTE, "/stations/search");

  // Prefer searchQuery over invalid railId
  assert.deepEqual(
    resolveRadioBackTarget({
      screen: "player",
      searchQuery: "jazz",
      railId: "zzz-missing",
    }),
    { pathname: "/stations/search", params: { q: "jazz" } },
    "searchQuery wins over invalid railId"
  );

  // --- Screen wiring contracts (no generic history back for Radio children) ---
  const homeSrc = read("app/stations/index.tsx");
  const categorySrc = read("app/stations/[categoryId].tsx");
  const searchSrc = read("app/stations/search.tsx");
  const playerSrc = read("app/player.tsx");
  const navSrc = read("utils/radioNavigation.ts");
  const targetsSrc = read("utils/radioBackTargets.ts");

  assert.match(homeSrc, /navigateRadioHomeBack/, "home uses Radio home back");
  assert.doesNotMatch(
    homeSrc,
    /safeRouterBack\("\/radio"\)/,
    "home no longer falls back to listening-room /radio"
  );
  assert.match(homeSrc, /bindRadioHardwareBack/, "home binds hardware back");

  assert.match(categorySrc, /navigateRadioChildBack/, "category uses child back");
  assert.doesNotMatch(categorySrc, /safeRouterBack/, "category avoids safeRouterBack");
  assert.doesNotMatch(categorySrc, /router\.back\(/, "category avoids router.back");
  assert.match(categorySrc, /bindRadioHardwareBack/, "category binds hardware back");

  assert.match(searchSrc, /navigateRadioChildBack/, "search uses child back");
  assert.doesNotMatch(searchSrc, /router\.back\(/, "search avoids router.back");
  assert.match(searchSrc, /bindRadioHardwareBack/, "search binds hardware back");

  assert.match(playerSrc, /navigateRadioPlayerBack/, "player live-radio uses Radio player back");
  assert.match(
    playerSrc,
    /isLiveRadioMode[\s\S]*navigateRadioPlayerBack/,
    "player only uses Radio back in live radio mode"
  );

  assert.match(navSrc, /router\.replace/, "Radio back prefers replace");
  assert.match(
    navSrc,
    /export function navigateRadioToParent[\s\S]*?^}/m,
    "navigateRadioToParent is defined"
  );
  const parentFn = navSrc.match(
    /export function navigateRadioToParent\([\s\S]*?\n\}/
  )?.[0] || "";
  assert.ok(parentFn.includes("router.replace"), "parent helper uses replace");
  assert.ok(!parentFn.includes("router.back"), "parent helper does not use history back");
  assert.match(targetsSrc, /resolveRadioBackTarget/, "pure parent resolver exists");
  assert.doesNotMatch(targetsSrc, /router\.back/, "resolver has no history back");
  assert.doesNotMatch(targetsSrc, /from \"react-native\"/, "resolver stays Node-safe");

  console.log("Radio back-navigation contract tests passed.");
}

main();
