const PLAYABLE_RIGHTS = new Set(["VERIFIED", "NOT_REQUIRED"]);

export function isStrictlyEligible(hit) {
  if (!hit || typeof hit !== "object") return false;
  if (hit.playbackCapability !== true) return false;
  if (hit.policyState !== "ELIGIBLE") return false;
  if (!PLAYABLE_RIGHTS.has(String(hit.rightsState || ""))) return false;
  if (hit.policyState === "REVIEW_REQUIRED" || hit.policyState === "UNKNOWN" || hit.policyState === "DENIED") {
    return false;
  }
  return Boolean(hit.canonicalSourceKey || (hit.provider && hit.sourceId));
}

export function isTestFixtureSurfaceable(hit, config) {
  if (!config?.testFixtureEnabled || config.production) return false;
  if (!hit || hit.playbackCapability !== true) return false;
  if (hit.policyState === "DENIED") return false;
  const key = String(hit.canonicalSourceKey || "").trim().toLowerCase();
  return Boolean(key && config.testFixtureKeys.has(key));
}

export function isPubliclySurfaceable(hit, config) {
  return isStrictlyEligible(hit) || isTestFixtureSurfaceable(hit, config);
}
