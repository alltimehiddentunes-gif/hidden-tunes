import {
  evaluateSportsRights,
  selectPreferredPlaybackMode,
} from "../rights/evaluate";
import { evaluateSportsTerritory } from "../territory/evaluate";
import { verifyEventWindow } from "../verification/engine";
import type {
  SportsBroadcastRow,
  SportsPlaybackResult,
  SportsPlayRequest,
  SportsResolverErrorCode,
  SportsRightsGrant,
  SportsStreamSource,
  SportsTerritoryRule,
} from "../types";

export type ResolvePlaybackInput = {
  broadcast: SportsBroadcastRow;
  source: SportsStreamSource | null;
  grant: SportsRightsGrant | null;
  territories: SportsTerritoryRule[];
  request: SportsPlayRequest;
  providerHealthy: boolean;
  providerName?: string;
  flags: {
    sportsEnabled: boolean;
    nativeEnabled: boolean;
    embeddedEnabled: boolean;
    externalEnabled: boolean;
  };
  /** Short-lived resolved URL — never store/return permanent secrets from browse. */
  resolvedManifestUrl?: string | null;
  resolvedEmbedUrl?: string | null;
  now?: Date;
};

export type ResolvePlaybackOutcome =
  | { ok: true; playback: SportsPlaybackResult }
  | { ok: false; code: SportsResolverErrorCode; message: string };

export function resolveSportsBroadcastPlayback(
  input: ResolvePlaybackInput
): ResolvePlaybackOutcome {
  const now = input.now ?? new Date();

  if (!input.flags.sportsEnabled) {
    return {
      ok: false,
      code: "FEATURE_DISABLED",
      message: "Sports playback is disabled.",
    };
  }

  if (!input.broadcast.published_at || input.broadcast.unpublished_at) {
    return {
      ok: false,
      code: "NOT_PUBLISHED",
      message: "Broadcast is not published.",
    };
  }

  if (input.broadcast.quarantined_at) {
    return {
      ok: false,
      code: "STREAM_QUARANTINED",
      message: "Broadcast is quarantined.",
    };
  }

  if (
    input.broadcast.availability_status === "quarantined" ||
    input.source?.status === "quarantined"
  ) {
    return {
      ok: false,
      code: "STREAM_QUARANTINED",
      message: "Stream is quarantined.",
    };
  }

  if (
    input.broadcast.availability_status === "rights_revoked" ||
    input.source?.status === "rights_revoked"
  ) {
    return {
      ok: false,
      code: "RIGHTS_REVOKED",
      message: "Rights have been revoked.",
    };
  }

  if (
    input.broadcast.availability_status === "offline" ||
    input.source?.status === "offline"
  ) {
    return {
      ok: false,
      code: "STREAM_OFFLINE",
      message: "Stream is offline.",
    };
  }

  if (!input.providerHealthy) {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "Provider is unavailable.",
    };
  }

  const window = verifyEventWindow({
    startsAt: input.broadcast.starts_at,
    endsAt: input.broadcast.ends_at,
    now,
  });
  if (window.code === "NOT_STARTED") {
    return {
      ok: false,
      code: "NOT_STARTED",
      message: "Event has not started yet.",
    };
  }
  if (window.code === "EVENT_ENDED") {
    return {
      ok: false,
      code: "EVENT_ENDED",
      message: "Event has ended.",
    };
  }

  const rights = evaluateSportsRights({
    grant: input.grant,
    platform: input.request.platform,
    now,
  });
  if (!rights.ok) {
    const code =
      rights.code === "RIGHTS_EXPIRED"
        ? "RIGHTS_EXPIRED"
        : rights.code === "RIGHTS_REVOKED"
          ? "RIGHTS_REVOKED"
          : rights.code === "PLATFORM_NOT_ALLOWED"
            ? "PLATFORM_NOT_ALLOWED"
            : "NO_AUTHORIZED_SOURCE";
    return { ok: false, code, message: rights.message };
  }

  const territory = evaluateSportsTerritory({
    country: input.request.country,
    rules: input.territories,
    territoryMode:
      (input.broadcast.territory_mode as
        | "allowlist"
        | "blocklist"
        | "worldwide_unproven") || "allowlist",
  });

  if (!territory.ok && territory.code === "GEO_BLOCKED") {
    return { ok: false, code: "GEO_BLOCKED", message: territory.message };
  }
  if (!territory.ok && territory.code === "SUBSCRIPTION_REQUIRED") {
    return {
      ok: false,
      code: "SUBSCRIPTION_REQUIRED",
      message: territory.message,
    };
  }
  if (!territory.ok && territory.code === "REGISTRATION_REQUIRED") {
    return {
      ok: false,
      code: "REGISTRATION_REQUIRED",
      message: territory.message,
    };
  }
  if (!territory.ok && !territory.allowExternal) {
    return { ok: false, code: "GEO_BLOCKED", message: territory.message };
  }

  if (input.broadcast.subscription_required) {
    return {
      ok: false,
      code: "SUBSCRIPTION_REQUIRED",
      message: "Subscription is required.",
    };
  }
  if (input.broadcast.registration_required) {
    return {
      ok: false,
      code: "REGISTRATION_REQUIRED",
      message: "Registration is required.",
    };
  }

  if (!input.source) {
    return {
      ok: false,
      code: "NO_AUTHORIZED_SOURCE",
      message: "No authorized source is available.",
    };
  }

  if (input.source.expires_at && new Date(input.source.expires_at) <= now) {
    return {
      ok: false,
      code: "NO_AUTHORIZED_SOURCE",
      message: "Source token or URL has expired.",
    };
  }

  let allowedModes = rights.allowedModes;
  if (!territory.allowNative) {
    allowedModes = allowedModes.filter((m) => m !== "native");
  }
  if (!territory.allowEmbedded) {
    allowedModes = allowedModes.filter((m) => m !== "embedded");
  }
  if (!territory.allowExternal) {
    allowedModes = allowedModes.filter((m) => m !== "external");
  }

  if (territory.code === "EXTERNAL_ONLY" || input.source.is_external_only) {
    allowedModes = allowedModes.filter((m) => m === "external");
  }

  const mode = selectPreferredPlaybackMode(allowedModes, input.source, {
    nativeEnabled: input.flags.nativeEnabled,
    embeddedEnabled: input.flags.embeddedEnabled,
    externalEnabled: input.flags.externalEnabled,
  });

  if (!mode) {
    if (input.source.is_external_only || territory.code === "EXTERNAL_ONLY") {
      return {
        ok: false,
        code: "EXTERNAL_ONLY",
        message: "Content is external-only and cannot resolve natively.",
      };
    }
    return {
      ok: false,
      code: "NO_AUTHORIZED_SOURCE",
      message: "No authorized playback mode is available.",
    };
  }

  const provider = input.providerName || "official_provider";
  const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();

  if (mode === "native") {
    const manifestUrl = String(input.resolvedManifestUrl || "").trim();
    if (!manifestUrl) {
      return {
        ok: false,
        code: "NO_AUTHORIZED_SOURCE",
        message: "Native playback URL could not be resolved.",
      };
    }
    return {
      ok: true,
      playback: {
        mode: "native",
        manifestUrl,
        expiresAt,
        headers: {},
        drm: null,
        heartbeatInterval: 30,
      },
    };
  }

  if (mode === "embedded") {
    const embedUrl = String(input.resolvedEmbedUrl || "").trim();
    if (!embedUrl) {
      return {
        ok: false,
        code: "NO_AUTHORIZED_SOURCE",
        message: "Embed URL could not be resolved.",
      };
    }
    return {
      ok: true,
      playback: {
        mode: "embedded",
        provider,
        embedUrl,
        expiresAt,
      },
    };
  }

  const fallback =
    String(input.source.web_fallback_url || "").trim() ||
    String(input.source.external_deep_link || "").trim();
  if (!fallback) {
    return {
      ok: false,
      code: "NO_AUTHORIZED_SOURCE",
      message: "External watch URL is missing.",
    };
  }

  const accessType =
    input.broadcast.access_type === "subscription"
      ? "subscription"
      : input.broadcast.access_type === "registration"
        ? "registration"
        : "free";

  return {
    ok: true,
    playback: {
      mode: "external",
      provider,
      deepLink: input.source.external_deep_link,
      fallbackUrl: fallback,
      accessType,
    },
  };
}
