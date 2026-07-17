import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { isSportsFeatureEnabled } from "../featureFlags";
import { resolveSportsBroadcastPlayback } from "./resolver";
import type {
  SportsBroadcastRow,
  SportsPlayRequest,
  SportsRightsGrant,
  SportsStreamSource,
  SportsTerritoryRule,
} from "../types";

export async function loadBroadcastForPlay(broadcastId: string) {
  const { data: broadcast, error } = await supabaseAdmin
    .from("sports_broadcasts")
    .select("*")
    .eq("id", broadcastId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!broadcast) return null;

  const [grantRes, sourcesRes, territoriesRes, providerRes] = await Promise.all([
    broadcast.rights_grant_id
      ? supabaseAdmin
          .from("sports_rights_grants")
          .select("*")
          .eq("id", broadcast.rights_grant_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from("sports_stream_sources")
      .select("*")
      .eq("broadcast_id", broadcastId)
      .order("priority", { ascending: true })
      .limit(5),
    broadcast.rights_grant_id
      ? supabaseAdmin
          .from("sports_rights_territories")
          .select("country_code, availability, access_type")
          .eq("rights_grant_id", broadcast.rights_grant_id)
      : Promise.resolve({ data: [], error: null }),
    broadcast.provider_id
      ? supabaseAdmin
          .from("sports_providers")
          .select("id, name, slug, is_enabled, kill_switch, health_status")
          .eq("id", broadcast.provider_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    broadcast: broadcast as SportsBroadcastRow,
    grant: (grantRes.data || null) as SportsRightsGrant | null,
    sources: (sourcesRes.data || []) as SportsStreamSource[],
    territories: (territoriesRes.data || []) as SportsTerritoryRule[],
    provider: providerRes.data as {
      id: string;
      name: string;
      slug: string;
      is_enabled: boolean;
      kill_switch: boolean;
      health_status: string;
    } | null,
  };
}

export async function playSportsBroadcast(
  broadcastId: string,
  request: SportsPlayRequest
) {
  const [sportsEnabled, nativeEnabled, embeddedEnabled, externalEnabled] =
    await Promise.all([
      isSportsFeatureEnabled("sports_enabled"),
      isSportsFeatureEnabled("sports_native_playback_enabled"),
      isSportsFeatureEnabled("sports_embedded_playback_enabled"),
      isSportsFeatureEnabled("sports_external_watch_enabled"),
    ]);

  const loaded = await loadBroadcastForPlay(broadcastId);
  if (!loaded) {
    return {
      ok: false as const,
      code: "NO_AUTHORIZED_SOURCE" as const,
      message: "Broadcast not found.",
      status: 404,
    };
  }

  const source =
    loaded.sources.find((s) => s.status !== "removed") ||
    loaded.sources[0] ||
    null;

  const providerHealthy = Boolean(
    loaded.provider &&
      loaded.provider.is_enabled &&
      !loaded.provider.kill_switch &&
      ["healthy", "degraded", "unknown"].includes(loaded.provider.health_status)
  );

  // Phase 1: never decrypt/return permanent source URLs from browse storage.
  // Native/embed resolution requires an explicit short-lived resolver reference later.
  const outcome = resolveSportsBroadcastPlayback({
    broadcast: loaded.broadcast,
    source,
    grant: loaded.grant,
    territories: loaded.territories,
    request,
    providerHealthy: loaded.provider ? providerHealthy : true,
    providerName: loaded.provider?.name,
    flags: {
      sportsEnabled,
      nativeEnabled,
      embeddedEnabled,
      externalEnabled,
    },
    resolvedManifestUrl: null,
    resolvedEmbedUrl: null,
  });

  if (!outcome.ok) {
    const status =
      outcome.code === "NOT_STARTED" || outcome.code === "EVENT_ENDED"
        ? 409
        : outcome.code === "GEO_BLOCKED" ||
            outcome.code === "PLATFORM_NOT_ALLOWED" ||
            outcome.code === "SUBSCRIPTION_REQUIRED" ||
            outcome.code === "REGISTRATION_REQUIRED"
          ? 403
          : outcome.code === "FEATURE_DISABLED"
            ? 503
            : 404;
    return { ...outcome, status };
  }

  return { ok: true as const, playback: outcome.playback, status: 200 };
}

export async function getBroadcastWatchOptions(broadcastId: string) {
  const loaded = await loadBroadcastForPlay(broadcastId);
  if (!loaded) return null;

  return {
    id: loaded.broadcast.id,
    title: loaded.broadcast.title,
    status: loaded.broadcast.availability_status,
    accessType: loaded.broadcast.access_type,
    officialStatus: loaded.broadcast.official_status,
    published: Boolean(loaded.broadcast.published_at),
    quarantined: Boolean(loaded.broadcast.quarantined_at),
    hasAuthorizedSource: loaded.sources.some(
      (s) =>
        s.status === "verified" ||
        s.status === "live" ||
        s.status === "external_only"
    ),
    // Metadata only — no permanent URLs.
    options: loaded.sources.map((s) => ({
      id: s.id,
      sourceType: s.source_type,
      status: s.status,
      isExternalOnly: s.is_external_only,
      isDirectPlayAllowed: s.is_direct_play_allowed,
      isEmbedAllowed: s.is_embed_allowed,
      priority: s.priority,
    })),
  };
}
