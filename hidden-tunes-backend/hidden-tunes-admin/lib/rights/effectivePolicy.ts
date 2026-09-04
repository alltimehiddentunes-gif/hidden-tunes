import { isRightsEnforcementEnabled } from "@/lib/rights/config";
import type {
  RightsCatalogItem,
  RightsDecision,
  RightsPlatform,
  RightsPolicy,
  RightsPolicyScope,
} from "@/lib/rights/types";

const SCOPE_WEIGHT: Record<RightsPolicyScope, number> = {
  global: 0,
  content_type: 10,
  provider: 20,
  network: 20,
  hostname: 25,
  country: 25,
  uploader: 30,
  source: 35,
  batch: 40,
  filter: 45,
  content: 50,
};

function isActive(policy: RightsPolicy, now: Date) {
  if (policy.active === false) return false;
  if (policy.effectiveAt && Date.parse(policy.effectiveAt) > now.getTime()) return false;
  if (policy.expiresAt && Date.parse(policy.expiresAt) <= now.getTime()) return false;
  return true;
}

function matches(item: RightsCatalogItem, policy: RightsPolicy) {
  switch (policy.scope) {
    case "global": return true;
    case "content_type": return policy.scopeValue === item.contentType;
    case "provider": return policy.scopeValue === item.providerId || policy.scopeValue === item.providerSlug;
    case "uploader": return policy.scopeValue === item.uploaderId;
    case "source": return policy.scopeValue === item.sourceType;
    case "batch": return policy.scopeValue === item.importBatch;
    case "hostname": return policy.scopeValue === item.sourceHost;
    case "country": return policy.scopeValue === item.countryCode;
    case "content": return policy.scopeValue === `${item.contentType}:${item.contentId}`;
    case "network":
    case "filter":
      return false;
  }
}

function pickPolicy(item: RightsCatalogItem, policies: RightsPolicy[], now: Date) {
  const matching = policies.filter((policy) => matches(item, policy));
  const legalBlock = matching.find((policy) => policy.legalBlock && isActive(policy, now));
  if (legalBlock) return { policy: legalBlock, temporalReason: null as null };

  const ranked = matching
    .filter((policy) => isActive(policy, now))
    .sort((left, right) =>
      SCOPE_WEIGHT[right.scope] - SCOPE_WEIGHT[left.scope] ||
      (right.version ?? 1) - (left.version ?? 1) ||
      left.id.localeCompare(right.id)
    );
  if (ranked[0]) {
    const topWeight = SCOPE_WEIGHT[ranked[0].scope];
    const equallySpecific = ranked.filter((candidate) => SCOPE_WEIGHT[candidate.scope] === topWeight);
    const decisions = new Set(equallySpecific.map((candidate) => JSON.stringify({
      status: candidate.rightsStatus,
      platforms: candidate.platforms,
      territories: candidate.territories ?? [],
      worldwide: candidate.worldwide ?? false,
      legalBlock: candidate.legalBlock ?? false,
    })));
    if (decisions.size > 1) return { policy: null, temporalReason: "conflict" as const };
    return { policy: ranked[0], temporalReason: null as null };
  }

  const mostSpecificInactive = matching.sort((left, right) => SCOPE_WEIGHT[right.scope] - SCOPE_WEIGHT[left.scope])[0];
  if (!mostSpecificInactive) return { policy: null, temporalReason: null as null };
  const temporalReason = mostSpecificInactive.expiresAt && Date.parse(mostSpecificInactive.expiresAt) <= now.getTime()
    ? "expired" as const
    : "not_effective" as const;
  return { policy: null, temporalReason };
}

export function evaluateRights(input: {
  item: RightsCatalogItem;
  policies: RightsPolicy[];
  platform: RightsPlatform;
  territory: string;
  now?: Date;
  enforcementEnabled?: boolean;
}): RightsDecision {
  const enforcementEnabled = input.enforcementEnabled ?? isRightsEnforcementEnabled();
  if (!enforcementEnabled) {
    return {
      eligible: true,
      rightsStatus: input.item.baseRightsStatus,
      platform: input.platform,
      territory: input.territory,
      reason: "enforcement_disabled",
    };
  }

  const now = input.now ?? new Date();
  const { policy, temporalReason } = pickPolicy(input.item, input.policies, now);
  if (!policy) {
    return {
      eligible: false,
      rightsStatus: "unknown",
      platform: input.platform,
      territory: input.territory,
      reason: temporalReason ?? "unknown",
    };
  }
  const base = {
    rightsStatus: policy.rightsStatus,
    platform: input.platform,
    territory: input.territory,
    winningPolicyId: policy.id,
    winningScope: policy.scope,
  };
  if (policy.legalBlock) return { ...base, eligible: false, reason: "legal_block" };
  if (policy.rightsStatus === "red") return { ...base, eligible: false, reason: "red" };
  if (policy.rightsStatus === "unknown") return { ...base, eligible: false, reason: "unknown" };
  if (policy.rightsStatus === "amber") return { ...base, eligible: false, reason: "amber" };
  if (policy.platforms[input.platform] !== true) return { ...base, eligible: false, reason: "platform_disabled" };
  const territory = input.territory.toUpperCase();
  if (!policy.worldwide && !(policy.territories ?? []).map((value) => value.toUpperCase()).includes(territory)) {
    return { ...base, eligible: false, reason: "territory_denied" };
  }
  return { ...base, eligible: true, reason: "eligible" };
}

export function filterEligibleItems(input: Omit<Parameters<typeof evaluateRights>[0], "item"> & {
  items: RightsCatalogItem[];
}) {
  return input.items.filter((item) => evaluateRights({ ...input, item }).eligible);
}
