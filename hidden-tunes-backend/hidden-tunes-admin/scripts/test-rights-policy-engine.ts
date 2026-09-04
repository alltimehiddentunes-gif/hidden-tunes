import assert from "node:assert/strict";

import { isRightsBulkExecutionEnabled, isRightsEnforcementEnabled } from "../lib/rights/config";
import { canExecuteRights, canReadRights } from "../lib/adminPermissions";
import { evaluateRights } from "../lib/rights/effectivePolicy";
import { normalizeRightsFilter } from "../lib/rights/filterSchema";
import { expiryWindow, licenseCoversItem } from "../lib/rights/licenseScopes";
import type { RightsCatalogItem, RightsPolicy } from "../lib/rights/types";

const item: RightsCatalogItem = {
  id: "1", contentType: "music", contentId: "track-1", title: "Test", providerId: "djcity",
  uploaderId: "owner", importBatch: "batch-a", streamType: "direct", sourceActive: true,
  baseRightsStatus: "unknown", evidenceStatus: "missing",
};
const policies: RightsPolicy[] = [
  { id: "global", scope: "global", rightsStatus: "green", platforms: { ios: true }, worldwide: true },
  { id: "provider", scope: "provider", scopeValue: "djcity", rightsStatus: "red", platforms: { ios: false }, worldwide: true },
  { id: "batch", scope: "batch", scopeValue: "batch-a", rightsStatus: "green", platforms: { ios: true }, territories: ["DE"] },
  { id: "content", scope: "content", scopeValue: "music:track-1", rightsStatus: "red", platforms: { ios: false }, worldwide: true },
];

assert.equal(isRightsEnforcementEnabled({} as NodeJS.ProcessEnv), false);
assert.equal(isRightsBulkExecutionEnabled({ RIGHTS_BULK_EXECUTION_ENABLED: "1" } as NodeJS.ProcessEnv), false);
assert.equal(canExecuteRights("owner"), true);
assert.equal(canExecuteRights("admin"), false);
assert.equal(canReadRights("moderator"), true);
assert.equal(canReadRights("uploader"), false);
assert.equal(evaluateRights({ item, policies, platform: "ios", territory: "DE", enforcementEnabled: false }).reason, "enforcement_disabled");
assert.equal(evaluateRights({ item, policies, platform: "ios", territory: "DE", enforcementEnabled: true }).winningPolicyId, "content");
assert.equal(evaluateRights({ item, policies: policies.slice(0, 3), platform: "ios", territory: "DE", enforcementEnabled: true }).winningPolicyId, "batch");
assert.equal(evaluateRights({ item, policies: policies.slice(0, 2), platform: "ios", territory: "DE", enforcementEnabled: true }).reason, "red");
assert.equal(evaluateRights({ item, policies: [
  { id: "same-a", scope: "provider", scopeValue: "djcity", rightsStatus: "green", platforms: { ios: true }, worldwide: true },
  { id: "same-b", scope: "provider", scopeValue: "djcity", rightsStatus: "red", platforms: { ios: false }, worldwide: true },
], platform: "ios", territory: "DE", enforcementEnabled: true }).reason, "conflict");

const scope = { id: "license", status: "active" as const, contentTypes: ["music" as const], providerIds: ["djcity"], uploaderIds: [], sourceKeys: [], importBatches: [], territories: ["DE"], worldwide: false, platforms: ["ios" as const], permitsStreaming: true, permitsDownload: false, permitsCommercialUse: true };
assert.deepEqual(licenseCoversItem({ scope, item, platform: "ios", territory: "DE" }), { covered: true, reason: "covered" });
assert.equal(licenseCoversItem({ scope, item, platform: "ios", territory: "US" }).covered, false);
assert.equal(expiryWindow("2026-09-10T00:00:00Z", new Date("2026-09-03T00:00:00Z")), "7_days");

const normalized = normalizeRightsFilter({ version: 1, all: [
  { field: "rights_status", op: "eq", value: "red" },
  { field: "content_type", op: "eq", value: "music" },
] });
assert.equal(normalized.all[0].field, "content_type");
assert.throws(() => normalizeRightsFilter({ version: 1, all: [{ field: "password", op: "eq", value: "x" }] }));
console.log("rights policy engine: PASS");
