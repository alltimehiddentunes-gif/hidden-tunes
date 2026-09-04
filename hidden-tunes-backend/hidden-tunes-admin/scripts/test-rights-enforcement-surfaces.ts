import assert from "node:assert/strict";

import { evaluateRights } from "../lib/rights/effectivePolicy";
import { RIGHTS_ENFORCEMENT_SURFACES } from "../lib/rights/publicEligibility";
import type { RightsCatalogItem, RightsPolicy } from "../lib/rights/types";

const item: RightsCatalogItem = { id: "blocked", contentType: "music", contentId: "blocked", title: "Blocked", providerSlug: "djcity", streamType: "direct", sourceActive: true, baseRightsStatus: "unknown", evidenceStatus: "missing" };
const policy: RightsPolicy = { id: "block", scope: "provider", scopeValue: "djcity", rightsStatus: "red", platforms: { ios: false }, worldwide: true };
for (const surface of RIGHTS_ENFORCEMENT_SURFACES) {
  const off = evaluateRights({ item, policies: [policy], platform: "ios", territory: "DE", enforcementEnabled: false });
  const on = evaluateRights({ item, policies: [policy], platform: "ios", territory: "DE", enforcementEnabled: true });
  assert.equal(off.eligible, true, `${surface} must preserve behavior while gate is off`);
  assert.equal(on.eligible, false, `${surface} must fail closed when integrated with the shared contract`);
}
console.log(`rights enforcement contracts: PASS (${RIGHTS_ENFORCEMENT_SURFACES.length} surfaces; route integration intentionally OFF)`);

