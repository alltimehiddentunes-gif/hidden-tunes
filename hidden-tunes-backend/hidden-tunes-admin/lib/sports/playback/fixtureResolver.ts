/**
 * Provider-neutral Sports fixture playback resolver.
 * POST /api/sports/fixtures/:id/play
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { isSportsFeatureEnabled } from "../featureFlags";
import { validateScoreBatEmbed } from "../providers/scorebat/embedSafety";
import { getScoreBatRuntimeConfig } from "../providers/scorebat/config";
import {
  normalizePlaybackKind,
  type SportsPlaybackKind,
} from "./allowlist";
import { isEligibleForReadyPlayback } from "./healthScore";
import { recordResolverLatency, recordSportsMetric } from "./metrics";
import { createSportsPlaybackSession } from "./sessions";
import { validateSportsBroadcast } from "./validateBroadcast";
import { syncFixturePlayability } from "./playabilitySync";

export type FixturePlayRequest = {
  platform: "ios" | "android" | "web" | "desktop" | "smart_tv";
  country?: string;
  appVersion?: string;
  preferredLanguage?: string;
  userId?: string | null;
};

export type FixturePlaySession =
  | {
      status: "ready";
      fixtureId: string;
      playbackKind: "iframe" | "webview" | "hls" | "dash";
      playbackToken: string;
      expiresAt: string;
      title: string;
      providerLabel: string;
    }
  | {
      status: "external";
      fixtureId: string;
      providerLabel: string;
      officialUrl: string;
    }
  | {
      status: "subscription_required";
      fixtureId: string;
      providerLabel: string;
      officialUrl?: string;
    }
  | {
      status: "unavailable";
      fixtureId: string;
      reason:
        | "expired"
        | "geo_blocked"
        | "provider_disabled"
        | "not_started"
        | "finished"
        | "validation_failed"
        | "no_broadcast";
      message?: string;
    };

type CandidateBroadcast = {
  id: string;
  fixture_id: string | null;
  provider_id: string | null;
  provider_asset_id: string | null;
  broadcast_type: string;
  playback_kind: string | null;
  title: string;
  publisher_name: string | null;
  publisher_domain: string | null;
  is_official: boolean;
  is_embeddable: boolean;
  is_free: boolean;
  requires_login: boolean;
  requires_subscription: boolean;
  subscription_required: boolean;
  mobile_supported: boolean;
  web_supported: boolean;
  country_allowlist: string[] | null;
  country_blocklist: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  validation_status: string;
  health_score: number;
  last_validated_at: string | null;
  validation_expires_at: string | null;
  failure_count: number;
  priority: number;
  access_type: string;
  metadata: Record<string, unknown> | null;
  published_at: string | null;
  unpublished_at: string | null;
  quarantined_at: string | null;
};

const CONTROLLED_MESSAGES = {
  expired: "This broadcast is no longer available.",
  geo_blocked: "This event is not available in your region.",
  subscription: "This provider requires a subscription.",
  external: "The official broadcast must be opened externally.",
  not_started: "The event has not started yet.",
  finished: "The event has finished.",
  validation_failed: "Live playback could not be validated.",
  no_broadcast: "This match is currently unavailable.",
  provider_disabled: "This broadcast is no longer available.",
} as const;

function unavailable(
  fixtureId: string,
  reason: Extract<FixturePlaySession, { status: "unavailable" }>["reason"],
  message?: string
): FixturePlaySession {
  return {
    status: "unavailable",
    fixtureId,
    reason,
    message: message || CONTROLLED_MESSAGES[reason] || CONTROLLED_MESSAGES.no_broadcast,
  };
}

function staleNeedsRevalidation(b: CandidateBroadcast, now: Date): boolean {
  if (b.validation_status === "candidate" || b.validation_status === "validating") {
    return true;
  }
  if (!b.validation_expires_at) return true;
  return new Date(b.validation_expires_at) <= now;
}

function deviceSupports(
  b: CandidateBroadcast,
  platform: FixturePlayRequest["platform"]
): boolean {
  if (platform === "ios" || platform === "android") {
    return b.mobile_supported !== false;
  }
  return b.web_supported !== false;
}

function countryOk(b: CandidateBroadcast, country?: string): boolean {
  const cc = String(country || "")
    .trim()
    .toUpperCase();
  if (!cc || cc === "ZZ") return true;
  const block = (b.country_blocklist || []).map((c) => c.toUpperCase());
  if (block.includes(cc)) return false;
  const allow = (b.country_allowlist || []).map((c) => c.toUpperCase());
  if (allow.length > 0 && !allow.includes(cc)) return false;
  return true;
}

async function loadProvider(providerId: string | null) {
  if (!providerId) return null;
  const { data } = await supabaseAdmin
    .from("sports_providers")
    .select(
      "id, slug, name, is_enabled, kill_switch, health_status"
    )
    .eq("id", providerId)
    .maybeSingle();
  return data;
}

async function loadSourceEmbed(broadcastId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("sports_stream_sources")
    .select("web_fallback_url, resolver_reference, is_embed_allowed, status")
    .eq("broadcast_id", broadcastId)
    .order("priority", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data || data.is_embed_allowed === false) return null;
  return data.web_fallback_url || data.resolver_reference || null;
}

async function revalidateCandidate(
  broadcast: CandidateBroadcast,
  provider: { slug: string; is_enabled: boolean; kill_switch: boolean; health_status: string } | null,
  request: FixturePlayRequest,
  fixtureId: string
): Promise<CandidateBroadcast> {
  const meta = (broadcast.metadata || {}) as {
    embedUrl?: string;
    validatedEmbedUrl?: string;
  };
  const embedRaw =
    meta.validatedEmbedUrl ||
    meta.embedUrl ||
    (await loadSourceEmbed(broadcast.id));

  let assetProof:
    | { exists: boolean; embedContractOk: boolean; reason?: string }
    | undefined;

  if (provider?.slug === "scorebat") {
    const validated = validateScoreBatEmbed(String(embedRaw || ""));
    assetProof = {
      exists: validated.ok,
      embedContractOk: validated.ok,
      reason: validated.ok ? undefined : validated.reason,
    };
    if (validated.ok) {
      meta.validatedEmbedUrl = validated.embedUrl;
    }
  } else if (embedRaw) {
    // Generic: only allowlisted providers reach here; still require embed contract.
    assetProof = {
      exists: false,
      embedContractOk: false,
      reason: "provider_asset_proof_unimplemented",
    };
  }

  const result = validateSportsBroadcast({
    providerId: provider?.slug || "unknown",
    providerEnabled: Boolean(provider?.is_enabled),
    providerKillSwitch: Boolean(provider?.kill_switch),
    providerStatus: provider?.health_status,
    providerAssetId: broadcast.provider_asset_id,
    playbackKind: broadcast.playback_kind || "iframe",
    embedUrlOrHtml: embedRaw,
    isOfficial: broadcast.is_official,
    isEmbeddable: broadcast.is_embeddable,
    mobileSupported: broadcast.mobile_supported,
    webSupported: broadcast.web_supported,
    requiresSubscription:
      broadcast.requires_subscription || broadcast.subscription_required,
    countryAllowlist: broadcast.country_allowlist || [],
    countryBlocklist: broadcast.country_blocklist || [],
    startsAt: broadcast.starts_at,
    endsAt:
      // Highlights providers: do not expire solely on match end.
      provider?.slug === "scorebat" ? null : broadcast.ends_at,
    fixtureId: broadcast.fixture_id || fixtureId,
    expectedFixtureId: fixtureId,
    countryCode: request.country,
    platform: request.platform,
    assetProof,
    recentFailureCount: broadcast.failure_count,
  });

  const update = {
    validation_status:
      result.status === "validated"
        ? "validated"
        : result.status === "blocked"
          ? "blocked"
          : result.status === "expired"
            ? "expired"
            : "failed",
    health_score: result.healthScore,
    last_validated_at: result.checkedAt,
    validation_expires_at: result.expiresAt,
    failure_count:
      result.status === "validated"
        ? 0
        : Number(broadcast.failure_count || 0) + 1,
    metadata: {
      ...(broadcast.metadata || {}),
      ...(meta.validatedEmbedUrl
        ? { validatedEmbedUrl: meta.validatedEmbedUrl }
        : {}),
    },
    updated_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from("sports_broadcasts")
    .update(update)
    .eq("id", broadcast.id);

  await supabaseAdmin.from("sports_playback_validations").insert({
    broadcast_id: broadcast.id,
    provider_id: broadcast.provider_id,
    checked_at: result.checkedAt,
    status: result.status,
    http_status: result.httpStatus ?? null,
    asset_exists: result.assetExists ?? null,
    embed_allowed: result.embedAllowed ?? null,
    mobile_supported: result.mobileSupported ?? null,
    country_result: result.countryResult ?? null,
    latency_ms: result.latencyMs ?? null,
    failure_reason: result.reason ?? null,
    response_metadata: {
      host: result.host || null,
      // Never store full private provider payloads.
    },
  });

  await recordSportsMetric(
    result.status === "validated"
      ? "validation_successes"
      : "validation_failures",
    1,
    broadcast.provider_id
  );

  return {
    ...broadcast,
    validation_status: update.validation_status,
    health_score: update.health_score,
    last_validated_at: update.last_validated_at,
    validation_expires_at: update.validation_expires_at,
    failure_count: update.failure_count,
    metadata: update.metadata,
  };
}

/**
 * Resolve one provider-neutral playback session for a fixture.
 */
export async function resolveFixturePlayback(
  fixtureId: string,
  request: FixturePlayRequest
): Promise<FixturePlaySession> {
  const started = Date.now();
  await recordSportsMetric("resolver_requests");

  try {
    const sportsEnabled = await isSportsFeatureEnabled("sports_enabled");
    if (!sportsEnabled) {
      const session = unavailable(
        fixtureId,
        "provider_disabled",
        CONTROLLED_MESSAGES.provider_disabled
      );
      await recordSportsMetric("unavailable_responses");
      return session;
    }

    const { data: fixture, error } = await supabaseAdmin
      .from("sports_fixtures")
      .select(
        "id, title, status, starts_at, ends_at, visible, availability_state, playable"
      )
      .eq("id", fixtureId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!fixture || fixture.visible === false) {
      const session = unavailable(fixtureId, "no_broadcast");
      await recordSportsMetric("unavailable_responses");
      return session;
    }

    const now = new Date();
    const fixtureStatus = String(fixture.status || "").toLowerCase();
    if (fixtureStatus === "cancelled" || fixtureStatus === "postponed") {
      const session = unavailable(fixtureId, "no_broadcast");
      await recordSportsMetric("unavailable_responses");
      return session;
    }

    const starts = new Date(fixture.starts_at);
    const ends = fixture.ends_at ? new Date(fixture.ends_at) : null;
    const isFinished =
      fixtureStatus === "completed" ||
      fixtureStatus === "expired" ||
      (ends !== null && ends <= now);
    const isUpcoming =
      !isFinished &&
      starts > now &&
      (fixtureStatus === "scheduled" ||
        fixtureStatus === "verified" ||
        fixtureStatus === "discovered");

    const { data: rows } = await supabaseAdmin
      .from("sports_broadcasts")
      .select("*")
      .eq("fixture_id", fixtureId)
      .is("unpublished_at", null)
      .is("quarantined_at", null)
      .order("priority", { ascending: true })
      .limit(25);

    let candidates = (rows || []) as CandidateBroadcast[];

    // Remove disabled / expired / unsupported
    const filtered: CandidateBroadcast[] = [];
    const subscriptionCandidates: CandidateBroadcast[] = [];
    const externalCandidates: CandidateBroadcast[] = [];

    for (const b of candidates) {
      if (b.validation_status === "disabled") continue;

      const provider = await loadProvider(b.provider_id);
      if (
        provider &&
        (!provider.is_enabled ||
          provider.kill_switch ||
          provider.health_status === "disabled")
      ) {
        continue;
      }

      if (b.validation_status === "expired") continue;

      const kind =
        normalizePlaybackKind(b.playback_kind) ||
        (b.is_embeddable ? "iframe" : null);
      if (!kind) continue;

      if (!deviceSupports(b, request.platform)) continue;
      if (!countryOk(b, request.country)) {
        // Keep for geo messaging if nothing else qualifies.
        continue;
      }

      if (
        b.requires_subscription ||
        b.subscription_required ||
        b.access_type === "subscription"
      ) {
        subscriptionCandidates.push(b);
        continue; // reject from live_in_app / ready path
      }

      if (kind === "external" || b.access_type === "external") {
        externalCandidates.push(b);
        continue;
      }

      // Supported in-app kinds only
      if (!["iframe", "webview", "hls", "dash"].includes(kind)) continue;

      filtered.push(b);
    }

    // Revalidate stale candidates
    const refreshed: CandidateBroadcast[] = [];
    for (const b of filtered) {
      const provider = await loadProvider(b.provider_id);
      if (staleNeedsRevalidation(b, now)) {
        refreshed.push(
          await revalidateCandidate(b, provider, request, fixtureId)
        );
      } else {
        refreshed.push(b);
      }
    }

    // Rank validated eligible
    const ranked = refreshed
      .filter((b) =>
        isEligibleForReadyPlayback({
          healthScore: Number(b.health_score || 0),
          validationStatus: b.validation_status,
          validationExpiresAt: b.validation_expires_at,
          providerStatus: "healthy",
          now,
        })
      )
      .sort((a, b) => {
        if (b.health_score !== a.health_score) {
          return b.health_score - a.health_score;
        }
        return a.priority - b.priority;
      });

    await syncFixturePlayability(fixtureId);

    if (ranked.length > 0) {
      const chosen = ranked[0];
      const provider = await loadProvider(chosen.provider_id);
      const kind = (normalizePlaybackKind(chosen.playback_kind) ||
        "iframe") as Exclude<SportsPlaybackKind, "external">;

      // ScoreBat kill / playback flags
      if (provider?.slug === "scorebat") {
        const cfg = getScoreBatRuntimeConfig();
        const playbackFlag = await isSportsFeatureEnabled(
          "sports_scorebat_playback_enabled"
        );
        if (
          cfg.killSwitch ||
          !cfg.enabled ||
          !cfg.playbackEnabled ||
          !playbackFlag
        ) {
          const session = unavailable(fixtureId, "provider_disabled");
          await recordSportsMetric("unavailable_responses");
          return session;
        }
      }

      const created = await createSportsPlaybackSession({
        fixtureId,
        broadcastId: chosen.id,
        userId: request.userId,
        countryCode: request.country,
        devicePlatform: request.platform,
      });

      const clientKind: "iframe" | "webview" | "hls" | "dash" =
        kind === "webview"
          ? "webview"
          : kind === "hls"
            ? "hls"
            : kind === "dash"
              ? "dash"
              : "iframe";

      const session: FixturePlaySession = {
        status: "ready",
        fixtureId,
        playbackKind: clientKind,
        playbackToken: created.playbackToken,
        expiresAt: created.expiresAt,
        title: fixture.title || chosen.title,
        providerLabel:
          chosen.publisher_name || provider?.name || "Official broadcaster",
      };
      await recordSportsMetric("ready_responses");
      return session;
    }

    if (subscriptionCandidates.length > 0) {
      const sub = subscriptionCandidates[0];
      const provider = await loadProvider(sub.provider_id);
      const meta = (sub.metadata || {}) as { officialUrl?: string };
      const session: FixturePlaySession = {
        status: "subscription_required",
        fixtureId,
        providerLabel: sub.publisher_name || provider?.name || "Official provider",
        officialUrl: meta.officialUrl,
      };
      await recordSportsMetric("subscription_responses");
      return session;
    }

    if (externalCandidates.length > 0) {
      const ext = externalCandidates[0];
      const provider = await loadProvider(ext.provider_id);
      const meta = (ext.metadata || {}) as { officialUrl?: string };
      const embed = await loadSourceEmbed(ext.id);
      const officialUrl = meta.officialUrl || embed || "";
      if (!officialUrl) {
        const session = unavailable(fixtureId, "no_broadcast");
        await recordSportsMetric("unavailable_responses");
        return session;
      }
      const session: FixturePlaySession = {
        status: "external",
        fixtureId,
        providerLabel: ext.publisher_name || provider?.name || "Official provider",
        officialUrl,
      };
      await recordSportsMetric("external_responses");
      return session;
    }

    if (isUpcoming) {
      const session = unavailable(
        fixtureId,
        "not_started",
        CONTROLLED_MESSAGES.not_started
      );
      await recordSportsMetric("unavailable_responses");
      return session;
    }
    if (isFinished) {
      const session = unavailable(
        fixtureId,
        "finished",
        CONTROLLED_MESSAGES.finished
      );
      await recordSportsMetric("unavailable_responses");
      return session;
    }

    // Geo-only miss?
    const anyBlockedByCountry = (candidates || []).some(
      (b) => !countryOk(b, request.country)
    );
    if (anyBlockedByCountry && candidates.length > 0) {
      const session = unavailable(
        fixtureId,
        "geo_blocked",
        CONTROLLED_MESSAGES.geo_blocked
      );
      await recordSportsMetric("unavailable_responses");
      return session;
    }

    if (refreshed.some((b) => b.validation_status === "failed")) {
      const session = unavailable(
        fixtureId,
        "validation_failed",
        CONTROLLED_MESSAGES.validation_failed
      );
      await recordSportsMetric("unavailable_responses");
      return session;
    }

    const session = unavailable(fixtureId, "no_broadcast");
    await recordSportsMetric("unavailable_responses");
    return session;
  } finally {
    await recordResolverLatency(Date.now() - started);
  }
}
