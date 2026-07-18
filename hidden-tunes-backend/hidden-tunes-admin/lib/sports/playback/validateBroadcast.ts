/**
 * Sports broadcast validation — never marks validated on HTTP 200 alone.
 */

import {
  getProviderAllowlist,
  isHostAllowedForProvider,
  isPlaybackKindAllowed,
  normalizePlaybackKind,
  type SportsPlaybackKind,
} from "./allowlist";
import { computeSportsBroadcastHealthScore } from "./healthScore";

export type SportsValidationStatus =
  | "validated"
  | "failed"
  | "blocked"
  | "expired";

export type ValidationResult = {
  status: SportsValidationStatus;
  healthScore: number;
  reason?: string;
  checkedAt: string;
  expiresAt: string;
  httpStatus?: number | null;
  assetExists?: boolean;
  embedAllowed?: boolean;
  mobileSupported?: boolean;
  countryResult?: string;
  latencyMs?: number;
  host?: string | null;
};

export type ValidateSportsBroadcastInput = {
  providerId: string;
  providerEnabled: boolean;
  providerKillSwitch: boolean;
  providerStatus?: string | null;
  providerAssetId?: string | null;
  playbackKind?: string | null;
  embedUrlOrHtml?: string | null;
  officialUrl?: string | null;
  isOfficial?: boolean;
  isEmbeddable?: boolean;
  mobileSupported?: boolean;
  webSupported?: boolean;
  requiresSubscription?: boolean;
  countryAllowlist?: string[];
  countryBlocklist?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  fixtureId?: string | null;
  expectedFixtureId?: string | null;
  countryCode?: string | null;
  platform: "ios" | "android" | "web" | "desktop" | "smart_tv";
  /** Provider-specific proof that the asset is a real playable embed/session. */
  assetProof?: {
    exists: boolean;
    embedContractOk: boolean;
    reason?: string;
  };
  recentFailureCount?: number;
  now?: Date;
  /** Validation TTL — live: 2m, starting soon: 5m, default: 10m */
  ttlMs?: number;
};

function extractHttpsHost(urlOrHtml: string): {
  host: string | null;
  url: string | null;
  reason?: string;
} {
  const trimmed = String(urlOrHtml || "").trim();
  if (!trimmed) return { host: null, url: null, reason: "empty" };

  let urlStr = trimmed;
  if (/<iframe/i.test(trimmed)) {
    const match =
      trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i) ||
      trimmed.match(/src=["'](https?:\/\/[^"']+)["']/i);
    if (!match?.[1]) return { host: null, url: null, reason: "no_iframe_src" };
    urlStr = match[1].trim();
  }

  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:") {
      return { host: null, url: null, reason: "non_https" };
    }
    if (parsed.username || parsed.password) {
      return { host: null, url: null, reason: "url_credentials" };
    }
    return { host: parsed.hostname.toLowerCase(), url: parsed.toString() };
  } catch {
    return { host: null, url: null, reason: "invalid_url" };
  }
}

function countryEligible(
  countryCode: string | null | undefined,
  allowlist: string[] | undefined,
  blocklist: string[] | undefined
): { ok: boolean; result: string } {
  const cc = String(countryCode || "")
    .trim()
    .toUpperCase();
  if (!cc || cc === "ZZ") {
    return { ok: true, result: "unknown_country_permitted" };
  }
  const block = (blocklist || []).map((c) => c.toUpperCase());
  if (block.includes(cc)) return { ok: false, result: "blocked" };
  const allow = (allowlist || []).map((c) => c.toUpperCase());
  if (allow.length > 0 && !allow.includes(cc)) {
    return { ok: false, result: "not_allowlisted" };
  }
  return { ok: true, result: "eligible" };
}

/**
 * Validate a sports broadcast candidate.
 * HTTP 200 of a webpage alone is never sufficient.
 */
export function validateSportsBroadcast(
  input: ValidateSportsBroadcastInput
): ValidationResult {
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const ttlMs = input.ttlMs ?? 10 * 60_000;
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

  const fail = (
    status: SportsValidationStatus,
    reason: string,
    extras: Partial<ValidationResult> = {}
  ): ValidationResult => {
    const healthScore = computeSportsBroadcastHealthScore({
      validatedWithinMs: null,
      isOfficial: input.isOfficial,
      mobileInAppConfirmed: false,
      countryEligible: extras.countryResult === "eligible",
      fixtureIdentityConfirmed:
        Boolean(input.fixtureId) &&
        (!input.expectedFixtureId ||
          input.fixtureId === input.expectedFixtureId),
      providerHealthy: ["healthy", "degraded", "unknown"].includes(
        String(input.providerStatus || "unknown")
      ),
      recentFailureCount: (input.recentFailureCount ?? 0) + 1,
      repeatedFailures: (input.recentFailureCount ?? 0) >= 1,
      expired: status === "expired",
      geoBlocked: status === "blocked" && reason.includes("geo"),
      invalidOrProhibitedHost: reason.includes("host") || reason.includes("allowlist"),
    });
    return {
      status,
      healthScore,
      reason,
      checkedAt,
      expiresAt,
      ...extras,
    };
  };

  if (input.providerKillSwitch || !input.providerEnabled) {
    return fail("blocked", "provider_disabled");
  }

  const allowlist = getProviderAllowlist(input.providerId);
  if (!allowlist) {
    return fail("blocked", "provider_not_allowlisted");
  }
  if (!allowlist.inAppPlaybackAllowed) {
    return fail("blocked", "in_app_not_permitted");
  }

  if (input.requiresSubscription) {
    return fail("blocked", "subscription_required");
  }

  if (input.endsAt) {
    const ends = new Date(input.endsAt);
    if (!Number.isNaN(ends.getTime()) && ends <= now) {
      // Highlights/replay may still be valid after live end — only expire live windows
      // when contentClass is live. Callers set endsAt null for highlights.
      if (allowlist.contentClass === "live") {
        return fail("expired", "event_finished");
      }
    }
  }

  const kind =
    normalizePlaybackKind(input.playbackKind) ||
    (input.isEmbeddable ? "iframe" : null);
  if (!kind || kind === "external") {
    return fail("failed", "unsupported_playback_kind");
  }
  if (!isPlaybackKindAllowed(input.providerId, kind)) {
    return fail("blocked", "playback_kind_not_allowed");
  }

  const platformMobile =
    input.platform === "ios" || input.platform === "android";
  if (platformMobile && input.mobileSupported === false) {
    return fail("blocked", "mobile_unsupported");
  }

  const geo = countryEligible(
    input.countryCode,
    input.countryAllowlist,
    input.countryBlocklist
  );
  if (!geo.ok) {
    return fail("blocked", `geo_${geo.result}`, {
      countryResult: geo.result,
    });
  }

  if (
    input.expectedFixtureId &&
    input.fixtureId &&
    input.fixtureId !== input.expectedFixtureId
  ) {
    return fail("failed", "fixture_identity_mismatch");
  }

  const source = String(input.embedUrlOrHtml || input.officialUrl || "").trim();
  const extracted = extractHttpsHost(source);
  if (!extracted.host || !extracted.url) {
    return fail("failed", extracted.reason || "missing_asset", {
      assetExists: false,
      embedAllowed: false,
      countryResult: geo.result,
    });
  }

  if (!isHostAllowedForProvider(input.providerId, extracted.host)) {
    return fail("blocked", "prohibited_host", {
      assetExists: false,
      embedAllowed: false,
      countryResult: geo.result,
      host: extracted.host,
    });
  }

  // Asset proof is mandatory — HTTP 200 of a landing page is not enough.
  const proof = input.assetProof;
  if (!proof || !proof.exists || !proof.embedContractOk) {
    return fail("failed", proof?.reason || "asset_proof_missing", {
      assetExists: proof?.exists ?? false,
      embedAllowed: proof?.embedContractOk ?? false,
      countryResult: geo.result,
      host: extracted.host,
    });
  }

  if (!input.providerAssetId) {
    return fail("failed", "missing_provider_asset_id", {
      assetExists: true,
      embedAllowed: true,
      countryResult: geo.result,
      host: extracted.host,
    });
  }

  const mobileOk =
    !platformMobile || input.mobileSupported !== false;
  const healthScore = computeSportsBroadcastHealthScore({
    validatedWithinMs: 0,
    isOfficial: input.isOfficial ?? allowlist.contentClass !== "unknown",
    mobileInAppConfirmed: mobileOk,
    countryEligible: true,
    fixtureIdentityConfirmed: Boolean(input.fixtureId),
    providerHealthy: ["healthy", "degraded", "unknown"].includes(
      String(input.providerStatus || "unknown")
    ),
    validatedFallbackExists: false,
    recentFailureCount: input.recentFailureCount ?? 0,
    repeatedFailures: (input.recentFailureCount ?? 0) >= 2,
    expired: false,
    geoBlocked: false,
    invalidOrProhibitedHost: false,
  });

  return {
    status: "validated",
    healthScore,
    checkedAt,
    expiresAt,
    assetExists: true,
    embedAllowed: true,
    mobileSupported: mobileOk,
    countryResult: geo.result,
    host: extracted.host,
  };
}

export type { SportsPlaybackKind };
