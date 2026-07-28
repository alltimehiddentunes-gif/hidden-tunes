import assert from "node:assert/strict";

import {
  classifyMatureRadioCandidate,
  shouldAutoInsertMatureCandidate,
  shouldRejectMatureCandidate,
} from "../lib/radioMature/classifier";
import {
  applyMatureRadioPublicFilters,
  isPublicMatureRadioRow,
  matureRadioGateEnabled,
} from "../lib/radioMature/platformPolicy";
import { applyPublicRadioFilters, isPublicRadioRow } from "../lib/radioPublicCatalog";
import { isAutomaticMatureRadioSource } from "../lib/radioMature/sourceRegistry";
import { RADIO_MATURE_EXPANSION_SOURCE_KEY } from "../lib/radioMature/constants";

function mockQuery() {
  const filters: Array<{ column: string; value: unknown }> = [];
  const ors: string[] = [];
  const query = {
    eq(column: string, value: unknown) {
      filters.push({ column, value });
      return query;
    },
    is(column: string, value: unknown) {
      filters.push({ column, value });
      return query;
    },
    gte(column: string, value: unknown) {
      filters.push({ column, value });
      return query;
    },
    or(value: string) {
      ors.push(value);
      return query;
    },
    ilike() {
      return query;
    },
    filters,
    ors,
  };
  return query;
}

async function main() {
  assert.equal(
    matureRadioGateEnabled({ mature_enabled: "true", age_confirmed: "true" }),
    true
  );
  assert.equal(matureRadioGateEnabled({ mature_enabled: "true", age_confirmed: "false" }), false);

  const generalQuery = mockQuery();
  applyPublicRadioFilters(generalQuery, {});
  assert.equal(
    generalQuery.filters.some((row) => row.column === "is_mature" && row.value === false),
    true
  );
  assert.equal(generalQuery.ors.length, 0);

  const mixedQuery = mockQuery();
  applyPublicRadioFilters(mixedQuery, { canAccessMature: true });
  assert.equal(mixedQuery.ors.length, 1);
  assert.match(mixedQuery.ors[0], /is_mature\.eq\.false/);
  assert.match(mixedQuery.ors[0], /mature_source_approved\.eq\.true/);
  assert.equal(
    mixedQuery.filters.some((row) => row.column === "is_mature" && row.value === false),
    false
  );

  const matureQuery = mockQuery();
  applyMatureRadioPublicFilters(matureQuery);
  assert.ok(matureQuery.filters.some((row) => row.column === "is_mature" && row.value === true));
  assert.ok(
    matureQuery.filters.some((row) => row.column === "mature_source_approved" && row.value === true)
  );

  assert.equal(isPublicRadioRow({ status: "approved", is_active: true, is_verified: true, playback_status: "playable", is_mature: true, reliability_score: 90 }), false);
  assert.equal(
    isPublicMatureRadioRow({
      status: "approved",
      is_active: true,
      is_verified: true,
      playback_status: "playable",
      is_mature: true,
      mature_source_approved: true,
      mature_review_status: "confirmed",
      rights_status: "approved",
      is_free: true,
      requires_payment: false,
      requires_drm: false,
      reliability_score: 90,
    }),
    true
  );

  const ac = classifyMatureRadioCandidate({
    name: "WXYZ Adult Contemporary Hits",
    tags: "adult contemporary, hits",
  });
  assert.equal(ac.classification, "adult_contemporary_false_positive");

  const confirmed = classifyMatureRadioCandidate({
    name: "Sex Sound Radio",
    tags: "erotic, explicit talk",
  });
  assert.equal(confirmed.classification, "confirmed_mature");
  assert.equal(shouldAutoInsertMatureCandidate(confirmed.classification), true);

  const borderline = classifyMatureRadioCandidate({
    name: "Radio Caprice Erotic",
    tags: "sensual, chill",
  });
  assert.equal(borderline.classification, "confirmed_mature");
  assert.equal(shouldAutoInsertMatureCandidate(borderline.classification), true);

  const reviewQueued = classifyMatureRadioCandidate({
    name: "Morning Chill Waves",
    tags: "asmr, ambient",
  });
  assert.equal(reviewQueued.classification, "borderline");
  assert.equal(shouldAutoInsertMatureCandidate(reviewQueued.classification), true);

  const explicitMusic = classifyMatureRadioCandidate({
    name: "181.FM Power Explicit",
    tags: "explicit, hip-hop",
  });
  assert.equal(explicitMusic.classification, "confirmed_mature");

  const cleanHits = classifyMatureRadioCandidate({
    name: "Classic Rock FM",
    tags: "rock, classic rock",
  });
  assert.equal(cleanHits.classification, "not_mature");
  assert.equal(shouldRejectMatureCandidate(cleanHits.classification), true);

  assert.equal(isAutomaticMatureRadioSource(RADIO_MATURE_EXPANSION_SOURCE_KEY), true);
  assert.equal(isAutomaticMatureRadioSource("laut-fm-erotic-search"), false);
  assert.equal(isAutomaticMatureRadioSource("tunein-iheart"), false);

  console.log(JSON.stringify({ success: true, tests: "radio-mature-isolation" }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
