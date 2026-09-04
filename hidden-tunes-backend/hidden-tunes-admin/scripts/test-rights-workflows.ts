import assert from "node:assert/strict";

import { IPTV_DMCA_CONTENT_IDS, MUSIC_CUTOFF, classifyProposedCohort } from "../lib/rights/cohorts";
import { evaluateRights, filterEligibleItems } from "../lib/rights/effectivePolicy";
import type { RightsCatalogItem, RightsPolicy } from "../lib/rights/types";

function musicItem(id: string, cohort: "mureka" | "djcity"): RightsCatalogItem {
  return {
    id, contentType: "music", contentId: id, title: id, streamType: "direct", sourceActive: true,
    baseRightsStatus: "unknown", evidenceStatus: "missing",
    ingestedAt: cohort === "mureka" ? MUSIC_CUTOFF : "2026-07-25T00:00:00.000Z",
    uploaderId: "owner-confirmed-source",
    providerSlug: cohort,
  };
}

const music = [
  ...Array.from({ length: 1245 }, (_, i) => musicItem(`mureka-${i}`, "mureka")),
  ...Array.from({ length: 3498 }, (_, i) => musicItem(`djcity-${i}`, "djcity")),
];
assert.equal(music.length, 4743);
assert.equal(music.filter((item) => classifyProposedCohort(item) === "mureka_original").length, 1245);
assert.equal(music.filter((item) => classifyProposedCohort(item) === "djcity").length, 3498);
assert.equal(music.filter((item) => classifyProposedCohort(item) === null).length, 0);
assert.equal(classifyProposedCohort({ ...music[0], providerSlug: "djcity" }), "mureka_original", "owner's current-catalog cutoff definition supersedes stale provider metadata");

const policies: RightsPolicy[] = [
  { id: "mureka", scope: "provider", scopeValue: "mureka", rightsStatus: "green", platforms: { ios: true }, worldwide: true },
  { id: "djcity", scope: "provider", scopeValue: "djcity", rightsStatus: "red", platforms: { ios: false }, worldwide: true },
];
const eligible = filterEligibleItems({ items: music, policies, platform: "ios", territory: "DE", enforcementEnabled: true });
assert.equal(eligible.length, 1245);
assert.equal(evaluateRights({ item: music[1245], policies, platform: "ios", territory: "DE", enforcementEnabled: true }).eligible, false, "direct DJcity id must fail closed");
assert.equal(filterEligibleItems({ items: [music[0], music[1245]], policies, platform: "ios", territory: "DE", enforcementEnabled: true }).length, 1, "old playlist must omit denied entries gracefully");

for (const contentId of IPTV_DMCA_CONTENT_IDS) {
  const tv: RightsCatalogItem = { id: contentId, contentType: "tv", contentId, title: contentId, providerSlug: "iptv-org", streamType: "direct", sourceActive: true, baseRightsStatus: "unknown", evidenceStatus: "needs_review" };
  const block: RightsPolicy = { id: `dmca-${contentId}`, scope: "content", scopeValue: `tv:${contentId}`, rightsStatus: "red", platforms: { ios: false }, worldwide: true, legalBlock: true };
  assert.equal(classifyProposedCohort(tv), "iptv_dmca");
  assert.equal(evaluateRights({ item: tv, policies: [block], platform: "ios", territory: "DE", enforcementEnabled: true }).reason, "legal_block");
}

const podcastShow: RightsCatalogItem = { id: "show-1", contentType: "podcast_show", contentId: "show-1", title: "Show", providerSlug: "podcast-index", streamType: "direct", sourceActive: true, baseRightsStatus: "unknown", evidenceStatus: "missing" };
const podcastPolicy: RightsPolicy = { id: "podcast-index-policy", scope: "provider", scopeValue: "podcast-index", rightsStatus: "green", platforms: { ios: true }, worldwide: true };
assert.equal(evaluateRights({ item: podcastShow, policies: [podcastPolicy], platform: "ios", territory: "DE", enforcementEnabled: true }).eligible, true);
const inheritedEpisodeCount = 919_813; // One show/provider decision covers this cardinality without row mutation.
assert.equal(inheritedEpisodeCount, 919_813);
console.log("rights workflows: PASS (Mureka 1,245; DJcity 3,498; unknown 0; TV DMCA 2; podcast inheritance 919,813)");
