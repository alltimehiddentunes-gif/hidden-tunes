/**
 * Sports broadcast health scoring for playback eligibility.
 * Ready responses require health_score >= 70 and status = validated.
 */

export const SPORTS_READY_HEALTH_THRESHOLD = 70;

export type HealthScoreInput = {
  validatedWithinMs?: number | null;
  isOfficial?: boolean;
  mobileInAppConfirmed?: boolean;
  countryEligible?: boolean;
  fixtureIdentityConfirmed?: boolean;
  providerHealthy?: boolean;
  validatedFallbackExists?: boolean;
  recentFailureCount?: number;
  repeatedFailures?: boolean;
  expired?: boolean;
  geoBlocked?: boolean;
  invalidOrProhibitedHost?: boolean;
};

export function computeSportsBroadcastHealthScore(
  input: HealthScoreInput
): number {
  let score = 0;

  if (
    typeof input.validatedWithinMs === "number" &&
    input.validatedWithinMs >= 0 &&
    input.validatedWithinMs <= 2 * 60_000
  ) {
    score += 30;
  }
  if (input.isOfficial) score += 20;
  if (input.mobileInAppConfirmed) score += 15;
  if (input.countryEligible) score += 10;
  if (input.fixtureIdentityConfirmed) score += 10;
  if (input.providerHealthy) score += 10;
  if (input.validatedFallbackExists) score += 5;

  const recent = Math.max(0, Number(input.recentFailureCount ?? 0));
  if (recent === 1) score -= 25;
  if (recent > 1 || input.repeatedFailures) score -= 40;
  if (input.expired) score -= 50;
  if (input.geoBlocked) score -= 60;
  if (input.invalidOrProhibitedHost) score -= 100;

  return Math.max(-200, Math.min(200, score));
}

export function isEligibleForReadyPlayback(input: {
  healthScore: number;
  validationStatus: string;
  validationExpiresAt?: string | null;
  providerStatus?: string | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  if (input.validationStatus !== "validated") return false;
  if (input.healthScore < SPORTS_READY_HEALTH_THRESHOLD) return false;
  if (input.validationExpiresAt) {
    const exp = new Date(input.validationExpiresAt);
    if (!Number.isNaN(exp.getTime()) && exp <= now) return false;
  }
  const provider = String(input.providerStatus || "unknown").toLowerCase();
  if (!["healthy", "degraded", "unknown"].includes(provider)) return false;
  return true;
}
