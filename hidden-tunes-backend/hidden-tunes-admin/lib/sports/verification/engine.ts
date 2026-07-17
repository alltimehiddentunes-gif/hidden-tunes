/**
 * Sports stream verification engine — Stage A–E contracts.
 * Phase 1: pure evaluation helpers + SSRF-safe domain allowlist checks.
 * No production probing of arbitrary URLs.
 */

export type OfficialSourceVerificationInput = {
  providerIdentityConfirmed: boolean;
  rightsHolderIdentityConfirmed: boolean;
  officialDomain: string | null;
  officialChannelOrAccount: boolean;
  authorizedDistribution: boolean;
  commercialUsagePermission: boolean;
  embeddingPermission: boolean;
  nativePlaybackPermission: boolean;
  externalLinkPermission: boolean;
};

export type OfficialSourceVerificationResult = {
  pass: boolean;
  reasons: string[];
};

export function verifyOfficialSource(
  input: OfficialSourceVerificationInput
): OfficialSourceVerificationResult {
  const reasons: string[] = [];
  if (!input.providerIdentityConfirmed) reasons.push("provider_identity_unconfirmed");
  if (!input.rightsHolderIdentityConfirmed) {
    reasons.push("rights_holder_identity_unconfirmed");
  }
  if (!input.officialDomain) reasons.push("official_domain_missing");
  if (!input.officialChannelOrAccount) reasons.push("official_channel_unconfirmed");
  if (!input.authorizedDistribution) reasons.push("distribution_not_authorized");
  if (!input.commercialUsagePermission && !input.externalLinkPermission) {
    reasons.push("no_commercial_or_external_permission");
  }
  return { pass: reasons.length === 0, reasons };
}

export type TechnicalVerificationInput = {
  url: string;
  allowedDomains: string[];
  httpsRequired?: boolean;
};

export type TechnicalVerificationResult = {
  pass: boolean;
  reasons: string[];
  hostname: string | null;
};

/**
 * SSRF protection: only approved provider domains may be checked.
 * Does not fetch arbitrary user-supplied URLs.
 */
export function verifyTechnicalSafety(
  input: TechnicalVerificationInput
): TechnicalVerificationResult {
  const reasons: string[] = [];
  let hostname: string | null = null;

  try {
    const parsed = new URL(input.url);
    hostname = parsed.hostname.toLowerCase();

    if ((input.httpsRequired ?? true) && parsed.protocol !== "https:") {
      reasons.push("https_required");
    }

    if (isPrivateOrLocalHost(hostname)) {
      reasons.push("ssrf_private_host_blocked");
    }

    const allowed = input.allowedDomains.map((d) => d.toLowerCase());
    const host = hostname;
    const domainOk =
      host != null &&
      allowed.some((d) => host === d || host.endsWith(`.${d}`));
    if (!domainOk) {
      reasons.push("domain_not_allowlisted");
    }
  } catch {
    reasons.push("invalid_url");
  }

  return { pass: reasons.length === 0, reasons, hostname };
}

function isPrivateOrLocalHost(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return true;
  }
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  return false;
}

export type ContentVerificationSignals = {
  holdingScreen?: boolean;
  offlineSlate?: boolean;
  staticImage?: boolean;
  blackVideo?: boolean;
  silentAudio?: boolean;
  advertisementOnlyLoop?: boolean;
  wrongEvent?: boolean;
  wrongChannel?: boolean;
  mislabeled?: boolean;
  noFreshSegments?: boolean;
};

export function verifyContentSignals(
  signals: ContentVerificationSignals
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const [key, value] of Object.entries(signals)) {
    if (value) reasons.push(key);
  }
  return { pass: reasons.length === 0, reasons };
}

export type EventWindowInput = {
  startsAt: string | null;
  endsAt: string | null;
  now?: Date;
  preWindowMinutes?: number;
};

export function verifyEventWindow(input: EventWindowInput): {
  phase: "not_started" | "pre" | "live" | "ended" | "unknown";
  okForPlayback: boolean;
  code?: "NOT_STARTED" | "EVENT_ENDED";
} {
  const now = (input.now ?? new Date()).getTime();
  if (!input.startsAt) {
    return { phase: "unknown", okForPlayback: false };
  }
  const start = new Date(input.startsAt).getTime();
  const end = input.endsAt
    ? new Date(input.endsAt).getTime()
    : start + 4 * 60 * 60 * 1000;
  const preMs = (input.preWindowMinutes ?? 30) * 60_000;

  if (now < start - preMs) {
    return { phase: "not_started", okForPlayback: false, code: "NOT_STARTED" };
  }
  if (now < start) {
    return { phase: "pre", okForPlayback: true };
  }
  if (now <= end) {
    return { phase: "live", okForPlayback: true };
  }
  return { phase: "ended", okForPlayback: false, code: "EVENT_ENDED" };
}
