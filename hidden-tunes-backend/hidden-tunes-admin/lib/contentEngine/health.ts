import type {
  ContentHealthCheckResult,
  ContentHealthStatus,
} from "@/lib/contentEngine/types";

export function mapHttpProbeToHealthStatus(input: {
  statusCode: number | null;
  error?: string | null;
  responseTimeMs?: number | null;
}): ContentHealthStatus {
  if (input.error) {
    return input.statusCode === null ? "dead" : "failed";
  }

  if (input.statusCode === null) {
    return "failed";
  }

  if (input.statusCode >= 500) {
    return "failed";
  }

  if (input.statusCode === 404 || input.statusCode === 410) {
    return "dead";
  }

  if (input.statusCode >= 400) {
    return "failed";
  }

  if (
    typeof input.responseTimeMs === "number" &&
    input.responseTimeMs > 5000
  ) {
    return "degraded";
  }

  if (input.statusCode >= 200 && input.statusCode < 400) {
    return "active";
  }

  return "unchecked";
}

export function buildHealthCheckResult(input: {
  statusCode?: number | null;
  contentType?: string | null;
  responseTimeMs?: number | null;
  checkedAt?: string;
  error?: string | null;
}): ContentHealthCheckResult {
  const statusCode =
    typeof input.statusCode === "number" && Number.isFinite(input.statusCode)
      ? input.statusCode
      : null;
  const responseTimeMs =
    typeof input.responseTimeMs === "number" &&
    Number.isFinite(input.responseTimeMs)
      ? Math.max(0, Math.floor(input.responseTimeMs))
      : null;

  const healthStatus = mapHttpProbeToHealthStatus({
    statusCode,
    error: input.error || null,
    responseTimeMs,
  });

  return {
    statusCode,
    contentType: input.contentType?.trim() || null,
    responseTimeMs,
    checkedAt: input.checkedAt || new Date().toISOString(),
    error: input.error?.trim() || null,
    healthStatus,
  };
}

export function shouldQuarantineAfterHealthFailures(
  consecutiveFailures: number,
  threshold = 3
) {
  return consecutiveFailures >= threshold;
}

export function shouldMarkHealthDead(result: ContentHealthCheckResult) {
  return result.healthStatus === "dead";
}

export function isHealthStatusPubliclyEligible(status: ContentHealthStatus) {
  return status === "active" || status === "degraded";
}
