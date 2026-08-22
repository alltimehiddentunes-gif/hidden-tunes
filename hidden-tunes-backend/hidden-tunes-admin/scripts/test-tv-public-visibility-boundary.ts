import assert from "node:assert/strict";

import {
  applyTvPublicCatalogFilters,
  isTvStationEligibleForPlatform,
} from "../lib/tvPlatformPolicy";

const staleVerifiedStation = {
  status: "approved",
  is_active: true,
  playback_status: "playable",
  reliability_score: 90,
  consecutive_failures: 0,
  disabled_at: null,
  quarantined_at: null,
  ios_playable: true,
  android_playable: true,
  stream_is_https: true,
  last_health_checked_at: "2026-01-01T00:00:00.000Z",
};

assert.equal(
  isTvStationEligibleForPlatform(
    staleVerifiedStation,
    "ios",
    new Date("2026-08-22T00:00:00.000Z")
  ),
  true,
  "maintenance freshness must not empty the public catalog"
);

const calls: Array<[string, string, unknown]> = [];
const query = {
  eq(column: string, value: unknown) {
    calls.push(["eq", column, value]);
    return this;
  },
  gte(column: string, value: unknown) {
    calls.push(["gte", column, value]);
    return this;
  },
  is(column: string, value: null) {
    calls.push(["is", column, value]);
    return this;
  },
  ilike() {
    return this;
  },
  or() {
    return this;
  },
  order() {
    return this;
  },
  async range() {
    return { data: [], error: null, count: 0 };
  },
};

applyTvPublicCatalogFilters(query, "ios", new Date("2026-08-22T00:00:00.000Z"));
const evidenceFilter = calls.find(
  ([method, column]) => method === "gte" && column === "last_health_checked_at"
);
assert.deepEqual(evidenceFilter, [
  "gte",
  "last_health_checked_at",
  "1970-01-01T00:00:00.000Z",
]);

console.log("PASS: TV public visibility survives stale health sweeps");
