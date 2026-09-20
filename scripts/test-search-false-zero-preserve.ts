/**
 * P0: backend/API song hits must not become a client-side false "0 matches"
 * when the local scorer is stricter than the API for multi-token queries.
 */
import assert from "node:assert/strict";
import {
  rankSearchSongs,
  scoreSearchResult,
  unwrapRankedSearchItems,
} from "../utils/searchRanking";
import { rankApkSongResults } from "../utils/searchApkParity";
import type { HiddenTunesSong } from "../services/hiddenTunesTypes";

const query = "three wooden crosses randy travis";

const apiHits = [
  {
    id: "1",
    title: "Diggin' Up Bones",
    artist: "Randy Travis",
    url: "https://api.hiddentunes.com/api/media/1",
  },
  {
    id: "2",
    title: "Three Wooden Crosses",
    artist: "Randy Travis",
    url: "https://api.hiddentunes.com/api/media/2",
  },
  {
    id: "3",
    title: "Forever and Ever, Amen",
    artist: "Randy Travis",
    url: "https://api.hiddentunes.com/api/media/3",
  },
] as HiddenTunesSong[];

const oldStyle = unwrapRankedSearchItems(
  rankSearchSongs(apiHits, query, { limit: 80 })
);
assert.equal(
  oldStyle.length,
  1,
  "without preserveUnscored, only the true title+artist combined hit should score"
);
assert.equal(oldStyle[0]?.title, "Three Wooden Crosses");

const preserved = unwrapRankedSearchItems(
  rankSearchSongs(apiHits, query, { limit: 80, preserveUnscored: true })
);
assert.equal(preserved.length, 3, "preserveUnscored keeps all API rows");
assert.ok(
  preserved.some((s) => s.title === "Three Wooden Crosses"),
  "preserves the relevant title"
);

const apk = rankApkSongResults(apiHits, query).map((e) => e.item);
assert.equal(apk.length, 3, "rankApkSongResults must preserve API rows");

const scored = scoreSearchResult(
  { title: "Three Wooden Crosses", artist: "Randy Travis" },
  query
);
assert.ok(scored.score > 0, "combined title+artist multi-token query must score");

console.log("test-search-false-zero-preserve: PASS");
