/**
 * Short-lived Sports playback sessions.
 * Client receives opaque token; raw embed URLs only via session resolve.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { isEligibleForReadyPlayback } from "./healthScore";
import { normalizePlaybackKind } from "./allowlist";
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
      playbackKind: "iframe" | "webview" | "hls" | "dash";
      title: string;
      providerLabel: string;
      embedUrl?: string | null;
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
  let providerHealthy = true;
  if (broadcast.provider_id) {
    const { data: provider } = await supabaseAdmin
      .from("sports_providers")
      .select("name, is_enabled, kill_switch, health_status")
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

  const { data: source } = await supabaseAdmin
    .from("sports_stream_sources")
    .select("web_fallback_url, resolver_reference, is_embed_allowed, status")
    .eq("broadcast_id", broadcast.id)
    .order("priority", { ascending: true })
    .limit(1)
    .maybeSingle();

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
  if (kind === "external" || kind === "hls" || kind === "dash") {
    // Session resolve for native kinds would need separate manifest path;
    // Phase 2 pilot is embed/webview only.
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
