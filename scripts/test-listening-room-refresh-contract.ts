import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  decideListeningRoomRefresh,
  shouldPersistListeningRoomRefresh,
} from "../services/listeningRoomRefreshPolicy";

const fresh = decideListeningRoomRefresh({
  requestFailed: false,
  responseShapeRecognized: true,
  rawCount: 100,
  playableCount: 96,
  cachedCount: 40,
});
assert.equal(fresh, "fresh");
assert.equal(shouldPersistListeningRoomRefresh(fresh), true);

for (const decision of [
  decideListeningRoomRefresh({
    requestFailed: true,
    responseShapeRecognized: true,
    rawCount: 0,
    playableCount: 0,
    cachedCount: 40,
  }),
  decideListeningRoomRefresh({
    requestFailed: false,
    responseShapeRecognized: false,
    rawCount: 0,
    playableCount: 0,
    cachedCount: 40,
  }),
  decideListeningRoomRefresh({
    requestFailed: false,
    responseShapeRecognized: true,
    rawCount: 12,
    playableCount: 0,
    cachedCount: 40,
  }),
]) {
  assert.equal(decision, "preserve-cache-error");
  assert.equal(shouldPersistListeningRoomRefresh(decision), false);
}

const emptyWithCache = decideListeningRoomRefresh({
  requestFailed: false,
  responseShapeRecognized: true,
  rawCount: 0,
  playableCount: 0,
  cachedCount: 40,
});
assert.equal(emptyWithCache, "preserve-cache-empty");
assert.equal(shouldPersistListeningRoomRefresh(emptyWithCache), false);

const genuineEmpty = decideListeningRoomRefresh({
  requestFailed: false,
  responseShapeRecognized: true,
  rawCount: 0,
  playableCount: 0,
  cachedCount: 0,
});
assert.equal(genuineEmpty, "genuine-empty");
assert.equal(shouldPersistListeningRoomRefresh(genuineEmpty), false);

const errorWithoutCache = decideListeningRoomRefresh({
  requestFailed: true,
  responseShapeRecognized: true,
  rawCount: 0,
  playableCount: 0,
  cachedCount: 0,
});
assert.equal(errorWithoutCache, "error");

const apiSource = readFileSync("services/hiddenTunesApi.ts", "utf8");
const homeSource = readFileSync("app/music-feed.tsx", "utf8");

assert.match(
  apiSource,
  /refreshDecision === "preserve-cache-empty"[\s\S]*?songs: cachedBeforeRefresh\.slice/,
  "an empty refresh must return valid cached tracks"
);
assert.match(
  apiSource,
  /shouldPersistListeningRoomRefresh\(refreshDecision\)/,
  "cache writes must use the explicit refresh policy"
);
assert.match(
  apiSource,
  /source: "cache-fallback"[\s\S]*?errorCode:/,
  "request failures must remain distinguishable from genuine empty results"
);
assert.match(
  apiSource,
  /songsPageInflight\.get\(inflightKey\)/,
  "identical catalog requests must remain deduplicated"
);
assert.match(
  homeSource,
  /type HomeCatalogStatus = "loading" \| "cached" \| "fresh" \| "empty" \| "error"/,
  "Home must model all Listening Room availability states"
);
assert.match(
  homeSource,
  /catalogStatus === "error"[\s\S]*?TESTER_COPY\.networkUnavailable/,
  "Home must render a useful request-failure state"
);
assert.match(
  homeSource,
  /actionLabel=\{homeUi\.refreshCatalog\}[\s\S]*?onAction=\{\(\) => void refreshCatalog\(\)\}/,
  "failure and empty states must provide non-blocking Retry"
);

console.log("listening room refresh contracts passed");
