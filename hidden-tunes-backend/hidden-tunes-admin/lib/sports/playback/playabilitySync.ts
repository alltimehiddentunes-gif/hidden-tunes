/**
 * Derive fixture availability / playable from validated broadcasts only.
 * Importer metadata must never set playable=true.
 * Uses computeSportsEffectiveLiveState so stale provider "live" cannot stay playable.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  computeSportsEffectiveLiveState,
  finishedFixtureStatusForPersist,
} from "../liveState";
import { isEligibleForReadyPlayback } from "./healthScore";

export type SportsAvailabilityState =
  | "live_in_app"
  | "live_external"
  | "live_subscription"
  | "live_unavailable"
  | "upcoming"
  | "finished"
  | "replay_available"
  | "highlights_available";

export type BroadcastPlayabilityRow = {
  id: string;
  broadcast_type: string;
  access_type: string;
  validation_status: string;
  health_score: number;
  validation_expires_at?: string | null;
  requires_subscription?: boolean;
  subscription_required?: boolean;
  playback_kind?: string | null;
  is_embeddable?: boolean;
  publisher_domain?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isPlaceholderBroadcast(b: BroadcastPlayabilityRow): boolean {
  const domain = String(b.publisher_domain || "").toLowerCase();
  if (domain.includes("example.com") || domain.includes("example.org")) {
    return true;
  }
  const meta = b.metadata || {};
  const url = String(
    meta.official_url || meta.officialUrl || meta.embed_url || meta.url || ""
  ).toLowerCase();
  return url.includes("example.com") || url.includes("example.org");
}

export function deriveFixtureAvailability(input: {
  fixtureStatus: string;
  startsAt: string;
  endsAt?: string | null;
  sportSlug?: string | null;
  broadcasts: BroadcastPlayabilityRow[];
  providerHealthy?: boolean;
  now?: Date;
}): { availabilityState: SportsAvailabilityState; playable: boolean } {
  const now = input.now ?? new Date();
  const status = String(input.fixtureStatus || "").toLowerCase();
  const liveState = computeSportsEffectiveLiveState({
    fixtureStatus: input.fixtureStatus,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    sportSlug: input.sportSlug,
    now,
  });

  const broadcasts = input.broadcasts.filter((b) => !isPlaceholderBroadcast(b));

  const eligibleInApp = broadcasts.filter((b) =>
    isEligibleForReadyPlayback({
      healthScore: Number(b.health_score || 0),
      validationStatus: b.validation_status,
      validationExpiresAt: b.validation_expires_at,
      providerStatus: input.providerHealthy === false ? "unavailable" : "healthy",
      now,
    })
  );

  const hasSubscriptionOnly =
    broadcasts.some(
      (b) =>
        b.requires_subscription ||
        b.subscription_required ||
        b.access_type === "subscription"
    ) && eligibleInApp.length === 0;

  const hasExternalOnly =
    broadcasts.some(
      (b) =>
        b.playback_kind === "external" ||
        b.access_type === "external" ||
        b.broadcast_type === "external_watch"
    ) && eligibleInApp.length === 0;

  const hasHighlights = eligibleInApp.some(
    (b) => b.broadcast_type === "highlights"
  );
  const hasReplay = eligibleInApp.some((b) => b.broadcast_type === "replay");
  const hasLiveInApp = eligibleInApp.some((b) =>
    ["live_match", "live_event", "live_channel"].includes(b.broadcast_type)
  );

  if (liveState.isCancelled || status === "cancelled" || status === "postponed") {
    return { availabilityState: "live_unavailable", playable: false };
  }

  if (liveState.isFinished || status === "completed" || status === "expired") {
    if (hasReplay) {
      return { availabilityState: "replay_available", playable: true };
    }
    if (hasHighlights) {
      return { availabilityState: "highlights_available", playable: true };
    }
    return { availabilityState: "finished", playable: false };
  }

  if (liveState.effectiveLive) {
    if (hasLiveInApp) {
      return { availabilityState: "live_in_app", playable: true };
    }
    if (hasSubscriptionOnly) {
      return { availabilityState: "live_subscription", playable: false };
    }
    if (hasExternalOnly) {
      return { availabilityState: "live_external", playable: false };
    }
    if (hasHighlights) {
      return { availabilityState: "highlights_available", playable: true };
    }
    return { availabilityState: "live_unavailable", playable: false };
  }

  if (hasReplay) {
    return { availabilityState: "replay_available", playable: true };
  }
  if (hasHighlights) {
    return { availabilityState: "highlights_available", playable: true };
  }

  return { availabilityState: "upcoming", playable: false };
}

export async function syncFixturePlayability(
  fixtureId: string
): Promise<{ availabilityState: SportsAvailabilityState; playable: boolean }> {
  const { data: fixture, error } = await supabaseAdmin
    .from("sports_fixtures")
    .select("id, status, starts_at, ends_at, sport_id")
    .eq("id", fixtureId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!fixture) {
    return { availabilityState: "live_unavailable", playable: false };
  }

  let sportSlug: string | null = null;
  if (fixture.sport_id) {
    const { data: sport } = await supabaseAdmin
      .from("sports")
      .select("slug")
      .eq("id", fixture.sport_id)
      .maybeSingle();
    sportSlug = sport?.slug || null;
  }

  const { data: broadcasts } = await supabaseAdmin
    .from("sports_broadcasts")
    .select(
      "id, broadcast_type, access_type, validation_status, health_score, validation_expires_at, requires_subscription, subscription_required, playback_kind, is_embeddable, publisher_domain, metadata, provider_id"
    )
    .eq("fixture_id", fixtureId)
    .is("unpublished_at", null)
    .is("quarantined_at", null);

  const derived = deriveFixtureAvailability({
    fixtureStatus: fixture.status,
    startsAt: fixture.starts_at,
    endsAt: fixture.ends_at,
    sportSlug,
    broadcasts: (broadcasts || []) as BroadcastPlayabilityRow[],
  });

  const finishedStatus = finishedFixtureStatusForPersist({
    fixtureStatus: fixture.status,
    startsAt: fixture.starts_at,
    endsAt: fixture.ends_at,
    sportSlug,
  });

  const update: Record<string, unknown> = {
    availability_state: derived.availabilityState,
    playable: derived.playable,
    playability_updated_at: new Date().toISOString(),
  };
  if (finishedStatus) {
    update.status = finishedStatus;
  }

  await supabaseAdmin.from("sports_fixtures").update(update).eq("id", fixtureId);

  return derived;
}
