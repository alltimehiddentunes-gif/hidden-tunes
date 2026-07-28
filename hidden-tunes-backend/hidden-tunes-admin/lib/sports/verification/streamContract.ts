/**
 * Stream verification contract — bounded checks, never HTTP-200-only validation.
 *
 * Aggressive mass probes against third parties are forbidden.
 * Callers must enforce concurrency limits and respectful intervals.
 */

export type SportsStreamVerificationResult = {
  verification_status:
    | "verified"
    | "failed"
    | "blocked"
    | "expired"
    | "skipped"
    | "pending";
  verification_method: string;
  verified_at: string | null;
  last_checked_at: string;
  http_status: number | null;
  content_type: string | null;
  manifest_type: "hls" | "dash" | "progressive" | "embed" | "external" | "unknown" | null;
  segment_verified: boolean;
  identity_verified: boolean;
  source_allowed: boolean;
  failure_reason: string | null;
  failure_count: number;
  success_count: number;
  reliability_score: number;
  expires_at: string | null;
  geographic_restrictions: string[];
};

export type VerifySportsStreamInput = {
  url?: string | null;
  playbackKind?: string | null;
  publisherName?: string | null;
  isOfficialClaim?: boolean;
  officialOrganization?: string | null;
  eventIdentityEvidence?: boolean;
  requiresLogin?: boolean;
  requiresSubscription?: boolean;
  countryAllowlist?: string[];
  countryBlocklist?: string[];
  validationExpiresAt?: string | null;
  priorFailureCount?: number;
  priorSuccessCount?: number;
  /** When false, only classify — do not fetch remote media. */
  allowNetworkProbe?: boolean;
  now?: Date;
};

import {
  classifySportsBroadcast,
  isUnsafeSportsPublisher,
} from "../broadcasts/classification";

function detectManifestType(
  url: string,
  contentType: string | null
): SportsStreamVerificationResult["manifest_type"] {
  const lower = url.toLowerCase();
  const ct = String(contentType || "").toLowerCase();
  if (lower.includes(".m3u8") || ct.includes("mpegurl")) return "hls";
  if (lower.includes(".mpd") || ct.includes("dash+xml")) return "dash";
  if (lower.includes(".mp4") || ct.includes("video/mp4")) return "progressive";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "external";
  return "unknown";
}

/**
 * Evaluate whether a stream may be considered verified for Sports.
 * Network probing is opt-in and bounded by the caller.
 */
export async function verifySportsStreamContract(
  input: VerifySportsStreamInput
): Promise<SportsStreamVerificationResult> {
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const failureCount = Number(input.priorFailureCount || 0);
  const successCount = Number(input.priorSuccessCount || 0);

  const base = (): SportsStreamVerificationResult => ({
    verification_status: "pending",
    verification_method: "contract_v1",
    verified_at: null,
    last_checked_at: checkedAt,
    http_status: null,
    content_type: null,
    manifest_type: null,
    segment_verified: false,
    identity_verified: false,
    source_allowed: false,
    failure_reason: null,
    failure_count: failureCount,
    success_count: successCount,
    reliability_score: 0,
    expires_at: null,
    geographic_restrictions: [
      ...(input.countryAllowlist || []).map((c) => `allow:${c}`),
      ...(input.countryBlocklist || []).map((c) => `block:${c}`),
    ],
  });

  const result = base();

  if (isUnsafeSportsPublisher(input.publisherName)) {
    result.verification_status = "blocked";
    result.failure_reason = "source_not_allowed_iptv_or_community_list";
    result.failure_count = failureCount + 1;
    result.reliability_score = 0;
    return result;
  }

  const classification = classifySportsBroadcast({
    publisherName: input.publisherName,
    playbackKind: input.playbackKind,
    isOfficial: input.isOfficialClaim,
    metadata: {
      officialOrganization: input.officialOrganization || "",
    },
    now,
  });

  result.source_allowed = classification.publicStreamEligible || classification.eventSpecific;
  if (!result.source_allowed && classification.classification === "rejected") {
    result.verification_status = "blocked";
    result.failure_reason = classification.reasons.join(",") || "source_rejected";
    result.failure_count = failureCount + 1;
    return result;
  }

  if (input.requiresLogin || input.requiresSubscription) {
    result.verification_status = "blocked";
    result.failure_reason = "login_or_subscription_required_not_bypassed";
    result.failure_count = failureCount + 1;
    return result;
  }

  if (
    input.validationExpiresAt &&
    Date.parse(input.validationExpiresAt) < now.getTime()
  ) {
    result.verification_status = "expired";
    result.failure_reason = "stream_validation_expired";
    result.failure_count = failureCount + 1;
    return result;
  }

  result.identity_verified = Boolean(
    input.eventIdentityEvidence || input.officialOrganization
  );
  if (!result.identity_verified) {
    result.verification_status = "failed";
    result.failure_reason = "event_identity_evidence_missing";
    result.failure_count = failureCount + 1;
    return result;
  }

  const url = String(input.url || "").trim();
  if (!url) {
    result.verification_status = "failed";
    result.failure_reason = "missing_url";
    result.failure_count = failureCount + 1;
    return result;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    result.verification_status = "failed";
    result.failure_reason = "invalid_url";
    result.failure_count = failureCount + 1;
    return result;
  }

  if (parsed.protocol !== "https:") {
    result.verification_status = "failed";
    result.failure_reason = "https_required";
    result.failure_count = failureCount + 1;
    return result;
  }

  result.manifest_type = detectManifestType(url, null);

  if (!input.allowNetworkProbe) {
    // Classification-only path — honest pending, not verified.
    result.verification_status = "pending";
    result.verification_method = "contract_v1_no_network";
    result.failure_reason = "network_probe_not_requested";
    result.reliability_score = result.identity_verified ? 20 : 0;
    return result;
  }

  // Bounded single HEAD/GET — caller must rate-limit across jobs.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "*/*" },
    });
    clearTimeout(timer);
    result.http_status = response.status;
    result.content_type = response.headers.get("content-type");
    result.manifest_type = detectManifestType(url, result.content_type);

    if (!response.ok) {
      result.verification_status = "failed";
      result.failure_reason = `http_${response.status}`;
      result.failure_count = failureCount + 1;
      return result;
    }

    const bodyPreview = (await response.text()).slice(0, 4000);
    const looksHtml =
      /<!doctype html|<html[\s>]/i.test(bodyPreview) &&
      result.manifest_type !== "embed";
    if (looksHtml && result.manifest_type !== "external") {
      result.verification_status = "failed";
      result.failure_reason = "html_error_or_landing_page_not_media";
      result.failure_count = failureCount + 1;
      return result;
    }

    if (result.manifest_type === "hls") {
      const hasPlaylist =
        /#EXTM3U/i.test(bodyPreview) &&
        (/#EXT-X-STREAM-INF|#EXTINF/i.test(bodyPreview) ||
          /\.m3u8/i.test(bodyPreview));
      result.segment_verified = hasPlaylist;
      if (!hasPlaylist) {
        result.verification_status = "failed";
        result.failure_reason = "hls_manifest_invalid";
        result.failure_count = failureCount + 1;
        return result;
      }
    } else if (result.manifest_type === "external") {
      // External pages are identity-checked only — not in-app playable verified.
      result.segment_verified = false;
      result.verification_status = "verified";
      result.verified_at = checkedAt;
      result.verification_method = "contract_v1_external_identity";
      result.success_count = successCount + 1;
      result.reliability_score = 55;
      result.expires_at = new Date(now.getTime() + 30 * 60_000).toISOString();
      return result;
    } else {
      // Without a dedicated segment fetch, do not claim segment_verified.
      result.segment_verified = false;
      result.verification_status = "failed";
      result.failure_reason = "unsupported_or_unproven_manifest_type";
      result.failure_count = failureCount + 1;
      return result;
    }

    result.verification_status = "verified";
    result.verified_at = checkedAt;
    result.success_count = successCount + 1;
    result.reliability_score = Math.min(
      100,
      70 + (result.segment_verified ? 15 : 0) + (result.identity_verified ? 10 : 0)
    );
    result.expires_at = new Date(now.getTime() + 10 * 60_000).toISOString();
    return result;
  } catch (err) {
    result.verification_status = "failed";
    result.failure_reason =
      err instanceof Error ? `fetch_error:${err.name}` : "fetch_error";
    result.failure_count = failureCount + 1;
    return result;
  }
}

export function shouldQuarantineAfterFailures(
  failureCount: number,
  threshold = 5
): boolean {
  return failureCount >= threshold;
}
