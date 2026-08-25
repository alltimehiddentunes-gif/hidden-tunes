/**
 * Short-lived Sports playback sessions.
 * Client receives opaque token; raw embed URLs only via session resolve.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { isEligibleForReadyPlayback } from "./healthScore";
import {
  isHostAllowedForProvider,
  isPlaybackKindAllowed,
  normalizePlaybackKind,
} from "./allowlist";
import { hashPlaybackToken, mintPlaybackToken } from "./tokens";

export { hashPlaybackToken, mintPlaybackToken } from "./tokens";

export const SPORTS_SESSION_TTL_MS = 5 * 60_000;

export type CreatePlaybackSessionInput = {
  fixtureId: string;
  broadcastId: string;
  userId?: string | null;
  countryCode?: string | null;
  devicePlatform?: string | null;
  ttlMs?: number;
};

export type CreatedPlaybackSession = {
  sessionId: string;
  playbackToken: string;
  expiresAt: string;
};

export async function createSportsPlaybackSession(
  input: CreatePlaybackSessionInput
): Promise<CreatedPlaybackSession> {
  const ttl = input.ttlMs ?? SPORTS_SESSION_TTL_MS;
  const playbackToken = mintPlaybackToken();
  const session_token_hash = hashPlaybackToken(playbackToken);
  const expiresAt = new Date(Date.now() + ttl).toISOString();

  const { data, error } = await supabaseAdmin
    .from("sports_playback_sessions")
    .insert({
      fixture_id: input.fixtureId,
      broadcast_id: input.broadcastId,
      user_id: input.userId || null,
      session_token_hash,
      country_code: input.countryCode || null,
      device_platform: input.devicePlatform || null,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return {
    sessionId: data.id as string,
    playbackToken,
    expiresAt,
  };
}

export type ResolvedPlaybackSession =
  | {
      ok: true;
      fixtureId: string;
      broadcastId: string;
      playbackKind: "iframe" | "webview" | "hls" | "dash" | "progressive";
      title: string;
      providerLabel: string;
      embedUrl?: string | null;
      manifestUrl?: string | null;
      headers?: Record<string, string>;
      expiresAt: string;
    }
  | {
      ok: false;
      reason:
        | "expired"
        | "not_found"
        | "provider_disabled"
        | "broadcast_invalid"
        | "validation_failed";
      message: string;
    };

/**
 * Resolve opaque session token to short-lived playback payload.
 * Never returns API credentials.
 */
export async function resolveSportsPlaybackSession(
  token: string
): Promise<ResolvedPlaybackSession> {
  const raw = String(token || "").trim();
  if (!raw) {
    return {
      ok: false,
      reason: "not_found",
      message: "This broadcast is no longer available.",
    };
  }

  const tokenHash = hashPlaybackToken(raw);
  const { data: session, error } = await supabaseAdmin
    .from("sports_playback_sessions")
    .select("*")
    .eq("session_token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!session) {
    return {
      ok: false,
      reason: "not_found",
      message: "This broadcast is no longer available.",
    };
  }

  const now = new Date();
  if (new Date(session.expires_at) <= now) {
    await supabaseAdmin
      .from("sports_playback_sessions")
      .update({
        failed_at: now.toISOString(),
        failure_reason: "expired",
      })
      .eq("id", session.id);
    return {
      ok: false,
      reason: "expired",
      message: "This broadcast is no longer available.",
    };
  }

  const { data: broadcast } = await supabaseAdmin
    .from("sports_broadcasts")
    .select(
      "id, title, fixture_id, playback_kind, validation_status, health_score, validation_expires_at, provider_id, metadata, published_at, unpublished_at, quarantined_at"
    )
    .eq("id", session.broadcast_id)
    .maybeSingle();

  if (!broadcast || broadcast.unpublished_at || broadcast.quarantined_at) {
    return {
      ok: false,
      reason: "broadcast_invalid",
      message: "This broadcast is no longer available.",
    };
  }

  if (
    !isEligibleForReadyPlayback({
      healthScore: Number(broadcast.health_score ?? 0),
      validationStatus: String(broadcast.validation_status || ""),
      validationExpiresAt: broadcast.validation_expires_at,
      now,
    })
  ) {
    return {
      ok: false,
      reason: "validation_failed",
      message: "Live playback could not be validated.",
    };
  }

  let providerLabel = "Official broadcaster";
  let providerSlug = "";
  let providerHealthy = true;
  if (broadcast.provider_id) {
    const { data: provider } = await supabaseAdmin
      .from("sports_providers")
      .select("slug, name, is_enabled, kill_switch, health_status")
      .eq("id", broadcast.provider_id)
      .maybeSingle();
    if (
      !provider ||
      !provider.is_enabled ||
      provider.kill_switch ||
      ["unavailable", "disabled"].includes(String(provider.health_status))
    ) {
      return {
        ok: false,
        reason: "provider_disabled",
        message: "This broadcast is no longer available.",
      };
    }
    providerLabel = provider.name || providerLabel;
    providerSlug = String(provider.slug || "");
    providerHealthy = ["healthy", "degraded", "unknown"].includes(
      String(provider.health_status)
    );
  }

  if (!providerHealthy) {
    return {
      ok: false,
      reason: "provider_disabled",
      message: "This broadcast is no longer available.",
    };
  }

  const { data: sources } = await supabaseAdmin
    .from("sports_stream_sources")
    .select(
      "source_type, resolver_reference, web_fallback_url, referer_requirement, user_agent_requirement, expires_at, is_direct_play_allowed, is_embed_allowed, is_external_only, priority, status"
    )
    .eq("broadcast_id", broadcast.id)
    .order("priority", { ascending: true })
    .limit(10);

  const usableSources = (sources || []).filter((candidate) => {
    if (
      candidate.is_external_only ||
      ["expired", "offline", "quarantined", "rights_revoked", "removed"].includes(
        String(candidate.status || "")
      )
    ) return false;
    if (candidate.expires_at && Date.parse(candidate.expires_at) <= now.getTime()) {
      return false;
    }
    return true;
  });

  const nativeKind = normalizePlaybackKind(broadcast.playback_kind);
  if (
    nativeKind === "hls" ||
    nativeKind === "dash" ||
    nativeKind === "progressive"
  ) {
    const nativeSource = usableSources.find((candidate) => {
      if (!candidate.is_direct_play_allowed) return false;
      const rawUrl = String(
        candidate.resolver_reference || candidate.web_fallback_url || ""
      ).trim();
      if (!rawUrl) return false;
      try {
        const parsed = new URL(rawUrl);
        return (
          parsed.protocol === "https:" &&
          Boolean(providerSlug) &&
          isHostAllowedForProvider(providerSlug, parsed.hostname) &&
          isPlaybackKindAllowed(providerSlug, nativeKind)
        );
      } catch {
        return false;
      }
    });

    if (!nativeSource) {
      return {
        ok: false,
        reason: "broadcast_invalid",
        message: "This broadcast is no longer available.",
      };
    }

    const manifestUrl = String(
      nativeSource.resolver_reference || nativeSource.web_fallback_url
    );
    const headers: Record<string, string> = {};
    if (nativeSource.referer_requirement) {
      headers.Referer = String(nativeSource.referer_requirement);
    }
    if (nativeSource.user_agent_requirement) {
      headers["User-Agent"] = String(nativeSource.user_agent_requirement);
    }

    await supabaseAdmin
      .from("sports_playback_sessions")
      .update({
        resolved_at: now.toISOString(),
        started_at: session.started_at || now.toISOString(),
      })
      .eq("id", session.id);

    return {
      ok: true,
      fixtureId: session.fixture_id,
      broadcastId: broadcast.id,
      playbackKind: nativeKind,
      title: broadcast.title,
      providerLabel,
      manifestUrl,
      headers: Object.keys(headers).length ? headers : undefined,
      expiresAt: session.expires_at,
    };
  }

  const source = usableSources.find((candidate) => candidate.is_embed_allowed);

  const meta = (broadcast.metadata || {}) as {
    embedUrl?: string;
    validatedEmbedUrl?: string;
  };
  const embedUrl =
    meta.validatedEmbedUrl ||
    meta.embedUrl ||
    source?.web_fallback_url ||
    source?.resolver_reference ||
    null;

  if (!embedUrl || source?.is_embed_allowed === false) {
    return {
      ok: false,
      reason: "broadcast_invalid",
      message: "This broadcast is no longer available.",
    };
  }

  const kind =
    normalizePlaybackKind(broadcast.playback_kind) ||
    ("iframe" as const);
  if (
    kind === "external" ||
    kind === "hls" ||
    kind === "dash" ||
    kind === "progressive"
  ) {
    if (kind === "external") {
      return {
        ok: false,
        reason: "broadcast_invalid",
        message: "The official broadcast must be opened externally.",
      };
    }
  }

  const playbackKind =
    kind === "webview" ? "webview" : kind === "iframe" ? "iframe" : "iframe";

  await supabaseAdmin
    .from("sports_playback_sessions")
    .update({
      resolved_at: now.toISOString(),
      started_at: session.started_at || now.toISOString(),
    })
    .eq("id", session.id);

  return {
    ok: true,
    fixtureId: session.fixture_id,
    broadcastId: broadcast.id,
    playbackKind,
    title: broadcast.title,
    providerLabel,
    embedUrl: String(embedUrl),
    expiresAt: session.expires_at,
  };
}
