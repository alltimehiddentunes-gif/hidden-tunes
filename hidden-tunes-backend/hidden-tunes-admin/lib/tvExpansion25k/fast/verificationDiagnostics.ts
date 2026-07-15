export type TvVerificationFailureReason =
  | "dns_failure"
  | "connect_timeout"
  | "response_timeout"
  | "http_401"
  | "http_403"
  | "http_404"
  | "http_410"
  | "http_429"
  | "http_5xx"
  | "html_instead_of_media"
  | "invalid_hls_manifest"
  | "invalid_dash_manifest"
  | "no_playable_variant"
  | "segment_unavailable"
  | "unsupported_protocol"
  | "unsupported_codec"
  | "audio_only"
  | "redirect_loop"
  | "too_many_redirects"
  | "certificate_error"
  | "expired_token"
  | "login_required"
  | "payment_required"
  | "drm_detected"
  | "geo_blocked"
  | "empty_response"
  | "connection_reset"
  | "host_unreachable"
  | "source_removed"
  | "private_url"
  | "missing_url"
  | "invalid_url"
  | "platform_not_playable"
  | "unknown_failure";

export type TvVerificationFailureClass = "terminal" | "retryable" | "verifier_suspect";

export type TvVerificationFailureRecord = {
  reason: TvVerificationFailureReason;
  class: TvVerificationFailureClass;
  host: string;
  country: string | null;
  protocol: string | null;
  durationMs: number;
};

export type TvVerificationDiagnosticsSummary = {
  total: number;
  passed: number;
  failed: number;
  terminal: number;
  retryable: number;
  verifierSuspect: number;
  averageDurationMs: number;
  byReason: Record<string, number>;
  byHost: Record<string, number>;
  byCountry: Record<string, number>;
  byProtocol: Record<string, number>;
};

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "invalid-host";
  }
}

function protocolFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (path.includes(".m3u8") || path.includes("m3u8")) return "hls";
    if (path.includes(".mpd")) return "dash";
    return parsed.protocol.replace(":", "");
  } catch {
    return "unknown";
  }
}

export function classifyVerificationFailure(rawReason: string): {
  reason: TvVerificationFailureReason;
  class: TvVerificationFailureClass;
} {
  const reason = String(rawReason || "").trim();
  const lower = reason.toLowerCase();

  if (!reason || lower === "missing url.") return { reason: "missing_url", class: "terminal" };
  if (lower.includes("invalid url")) return { reason: "invalid_url", class: "terminal" };
  if (lower.includes("private") || lower.includes("localhost")) {
    return { reason: "private_url", class: "terminal" };
  }
  if (lower.includes("unsupported url protocol") || lower === "rtmp" || lower === "rtsp") {
    return { reason: "unsupported_protocol", class: "terminal" };
  }
  if (lower.includes("login") || lower.includes("sign-in") || lower.includes("auth")) {
    return { reason: "login_required", class: "terminal" };
  }
  if (lower.includes("paywall") || lower.includes("payment")) {
    return { reason: "payment_required", class: "terminal" };
  }
  if (lower.includes("widevine") || lower.includes("fairplay") || lower.includes("drm")) {
    return { reason: "drm_detected", class: "terminal" };
  }
  if (lower.includes("geo") || lower.includes("region")) {
    return { reason: "geo_blocked", class: "terminal" };
  }
  if (lower.includes("audio only") || lower.includes("audio-only")) {
    return { reason: "audio_only", class: "terminal" };
  }
  if (lower.includes("too_many_redirects") || lower.includes("too many redirect")) {
    return { reason: "too_many_redirects", class: "terminal" };
  }
  if (lower.includes("redirect_limit") || lower.includes("redirect loop")) {
    return { reason: "redirect_loop", class: "terminal" };
  }
  if (lower.includes("http_401")) return { reason: "http_401", class: "terminal" };
  if (lower.includes("http_403")) return { reason: "http_403", class: "terminal" };
  if (lower.includes("http_404")) return { reason: "http_404", class: "terminal" };
  if (lower.includes("http_410")) return { reason: "http_410", class: "terminal" };
  if (lower.includes("http_429")) return { reason: "http_429", class: "retryable" };
  if (/http_5\d\d/.test(lower)) return { reason: "http_5xx", class: "retryable" };
  if (lower.includes("unsupported_payload") || lower.includes("html")) {
    return { reason: "html_instead_of_media", class: "terminal" };
  }
  if (lower.includes("manifest") || lower.includes("#extm3u")) {
    return { reason: "invalid_hls_manifest", class: "terminal" };
  }
  if (lower.includes(".mpd") || lower.includes("dash")) {
    return { reason: "invalid_dash_manifest", class: "terminal" };
  }
  if (lower.includes("segment")) return { reason: "segment_unavailable", class: "retryable" };
  if (lower.includes("certificate") || lower.includes("cert")) {
    return { reason: "certificate_error", class: "terminal" };
  }
  if (lower.includes("token") && (lower.includes("expired") || lower.includes("invalid"))) {
    return { reason: "expired_token", class: "terminal" };
  }
  if (lower.includes("econnreset") || lower.includes("connection reset")) {
    return { reason: "connection_reset", class: "retryable" };
  }
  if (lower.includes("enotfound") || lower.includes("dns") || lower.includes("getaddrinfo")) {
    return { reason: "dns_failure", class: "retryable" };
  }
  if (lower.includes("ehostunreach") || lower.includes("host unreachable")) {
    return { reason: "host_unreachable", class: "retryable" };
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort")) {
    return { reason: "response_timeout", class: "retryable" };
  }
  if (lower.includes("empty")) return { reason: "empty_response", class: "retryable" };
  if (lower.includes("removed") || lower.includes("gone")) {
    return { reason: "source_removed", class: "terminal" };
  }
  if (lower.includes("platform") || lower.includes("ios_playable") || lower.includes("android")) {
    return { reason: "platform_not_playable", class: "terminal" };
  }
  if (lower.includes("http_or_insecure") || lower.includes("insecure")) {
    return { reason: "unsupported_protocol", class: "terminal" };
  }
  if (lower.includes("probe_failed") || (lower.includes("manifest") && lower.includes("fail"))) {
    return { reason: "invalid_hls_manifest", class: "terminal" };
  }
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econnrefused")) {
    return { reason: "connection_reset", class: "retryable" };
  }
  if (lower.includes("youtube") && lower.includes("fail")) {
    return { reason: "html_instead_of_media", class: "terminal" };
  }
  if (lower.includes("probe_passed")) {
    return { reason: "unknown_failure", class: "verifier_suspect" };
  }

  return { reason: "unknown_failure", class: "terminal" };
}

export class TvVerificationDiagnostics {
  private records: TvVerificationFailureRecord[] = [];
  private passed = 0;
  private totalDurationMs = 0;
  private checks = 0;

  recordPass(durationMs: number) {
    this.checks += 1;
    this.passed += 1;
    this.totalDurationMs += durationMs;
  }

  recordFailure(
    rawReason: string,
    url: string,
    country: string | null | undefined,
    durationMs: number
  ) {
    this.checks += 1;
    this.totalDurationMs += durationMs;
    const classified = classifyVerificationFailure(rawReason);
    this.records.push({
      reason: classified.reason,
      class: classified.class,
      host: hostFromUrl(url),
      country: country ? String(country).toUpperCase() : null,
      protocol: protocolFromUrl(url),
      durationMs,
    });
  }

  summary(): TvVerificationDiagnosticsSummary {
    const byReason: Record<string, number> = {};
    const byHost: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    const byProtocol: Record<string, number> = {};
    let terminal = 0;
    let retryable = 0;
    let verifierSuspect = 0;

    for (const row of this.records) {
      byReason[row.reason] = (byReason[row.reason] || 0) + 1;
      byHost[row.host] = (byHost[row.host] || 0) + 1;
      const countryKey = row.country || "unknown";
      byCountry[countryKey] = (byCountry[countryKey] || 0) + 1;
      const protocolKey = row.protocol || "unknown";
      byProtocol[protocolKey] = (byProtocol[protocolKey] || 0) + 1;
      if (row.class === "terminal") terminal += 1;
      if (row.class === "retryable") retryable += 1;
      if (row.class === "verifier_suspect") verifierSuspect += 1;
    }

    return {
      total: this.checks,
      passed: this.passed,
      failed: this.records.length,
      terminal,
      retryable,
      verifierSuspect,
      averageDurationMs: this.checks > 0 ? Math.round(this.totalDurationMs / this.checks) : 0,
      byReason,
      byHost,
      byCountry,
      byProtocol,
    };
  }
}

export function redactStreamUrlForReport(url: string) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|auth|key|sig|session|password/i.test(key)) {
        parsed.searchParams.set(key, "REDACTED");
      }
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "invalid-url";
  }
}
