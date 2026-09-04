import { hashRightsValue } from "@/lib/rights/filterSchema";
import type { DryRunSummary, RightsBulkAction, RightsStatus } from "@/lib/rights/types";

export type DryRunTarget = {
  id: string;
  rightsStatus: RightsStatus;
  platformEnabled: boolean;
  hasContentOverride?: boolean;
  providerInherited?: boolean;
  batchInherited?: boolean;
  expiredLicense?: boolean;
  blockedByHigherPriorityPolicy?: boolean;
  version?: number;
};

function proposedEnabled(target: DryRunTarget, action: RightsBulkAction) {
  if (action.type === "set_platform") return action.enabled;
  if (action.type === "set_rights_status" && action.status !== "green") return false;
  return target.platformEnabled;
}

function changes(target: DryRunTarget, action: RightsBulkAction) {
  if (action.type === "set_rights_status") return target.rightsStatus !== action.status;
  if (action.type === "set_platform") return target.platformEnabled !== action.enabled;
  return true;
}

export function runDryRun(targets: Iterable<DryRunTarget>, action: RightsBulkAction) {
  const summary: DryRunSummary = {
    matching: 0,
    wouldChange: 0,
    unchanged: 0,
    conflicts: 0,
    contentOverrides: 0,
    inheritedProviderPolicies: 0,
    inheritedBatchPolicies: 0,
    expiredLicenses: 0,
    blockedByHigherPriorityPolicy: 0,
    currentlyEnabled: 0,
    currentlyDisabled: 0,
    proposedEnabled: 0,
    proposedDisabled: 0,
  };
  for (const target of targets) {
    summary.matching += 1;
    if (target.platformEnabled) summary.currentlyEnabled++;
    else summary.currentlyDisabled++;
    if (proposedEnabled(target, action)) summary.proposedEnabled++;
    else summary.proposedDisabled++;
    if (target.hasContentOverride) summary.contentOverrides++;
    if (target.providerInherited) summary.inheritedProviderPolicies++;
    if (target.batchInherited) summary.inheritedBatchPolicies++;
    if (target.expiredLicense) summary.expiredLicenses++;
    if (target.blockedByHigherPriorityPolicy) {
      summary.blockedByHigherPriorityPolicy++;
      summary.conflicts++;
    } else if (changes(target, action)) {
      summary.wouldChange++;
    } else {
      summary.unchanged++;
    }
  }
  return {
    summary,
    previewHash: hashRightsValue({ action, summary }),
  };
}

export function assertDryRunStillValid(input: {
  expectedHash: string;
  actualHash: string;
  snapshotExpiresAt: string;
  expectedWatermark: string;
  actualWatermark: string;
  expectedPolicyRevision: number;
  actualPolicyRevision: number;
}) {
  if (Date.parse(input.snapshotExpiresAt) <= Date.now()) throw new Error("dry_run_expired");
  if (input.expectedHash !== input.actualHash) throw new Error("dry_run_hash_mismatch");
  if (input.expectedWatermark !== input.actualWatermark) throw new Error("catalog_drift");
  if (input.expectedPolicyRevision !== input.actualPolicyRevision) throw new Error("policy_drift");
}
