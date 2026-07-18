/**
 * Derive fixture availability / playable from validated broadcasts only.
 * Importer metadata must never set playable=true.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
};

export function deriveFixtureAvailability(input: {
  fixtureStatus: string;
  startsAt: string;
  endsAt?: string | null;
  broadcasts: BroadcastPlayabilityRow[];
  providerHealthy?: boolean;
  now?: Date;
}): { availabilityState: SportsAvailabilityState; playable: boolean } {
  const now = input.now ?? new Date();
  const status = String(input.fixtureStatus || "").toLowerCase();
  const starts = new Date(input.startsAt);
  const ends = input.endsAt ? new Date(input.endsAt) : null;

  const eligibleInApp = input.broadcasts.filter((b) =>
    isEligibleForReadyPlayback({
      healthScore: Number(b.health_score || 0),
      validationStatus: b.validation_status,
      validationExpiresAt: b.validation_expires_at,
      providerStatus: input.providerHealthy === false ? "unavailable" : "healthy",
      now,
    })
  );

  const hasSubscriptionOnly =
    input.broadcasts.some(
      (b) =>
        b.requires_subscription ||
        b.subscription_required ||
        b.access_type === "subscription"
    ) && eligibleInApp.length === 0;

  const hasExternalOnly =
    input.broadcasts.some(
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

  if (status === "completed" || status === "expired") {
    if (hasReplay) {
      return { availabilityState: "replay_available", playable: true };
    }
    if (hasHighlights) {
      return { availabilityState: "highlights_available", playable: true };
    }
    return { availabilityState: "finished", playable: false };
  }

  if (status === "cancelled" || status === "postponed") {
    return { availabilityState: "live_unavailable", playable: false };
  }

  const isLive =
    status === "live" ||
    (starts <= now && (!ends || ends > now) && status !== "scheduled");

  if (isLive || status === "live") {
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
      // Highlights during live window — still highlights, not live_in_app.
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

  if (starts > now || status === "scheduled" || status === "verified") {
    return { availabilityState: "upcoming", playable: false };
  }

  return { availabilityState: "upcoming", playable: false };
}

export async function syncFixturePlayability(
  fixtureId: string
): Promise<{ availabilityState: SportsAvailabilityState; playable: boolean }> {
  const { data: fixture, error } = await supabaseAdmin
    .from("sports_fixtures")
    .select("id, status, starts_at, ends_at")
    .eq("id", fixtureId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!fixture) {
    return { availabilityState: "live_unavailable", playable: false };
  }

  const { data: broadcasts } = await supabaseAdmin
    .from("sports_broadcasts")
    .select(
      "id, broadcast_type, access_type, validation_status, health_score, validation_expires_at, requires_subscription, subscription_required, playback_kind, is_embeddable, provider_id"
    )
    .eq("fixture_id", fixtureId)
    .is("unpublished_at", null)
    .is("quarantined_at", null);

  const derived = deriveFixtureAvailability({
    fixtureStatus: fixture.status,
    startsAt: fixture.starts_at,
    endsAt: fixture.ends_at,
    broadcasts: (broadcasts || []) as BroadcastPlayabilityRow[],
  });

  await supabaseAdmin
    .from("sports_fixtures")
    .update({
      availability_state: derived.availabilityState,
      playable: derived.playable,
      playability_updated_at: new Date().toISOString(),
    })
    .eq("id", fixtureId);

  return derived;
}
