/**
 * Derive fixture availability / playable from provider-confirmed status
 * and eligible event-specific broadcasts only.
 *
 * NEVER invents live from starts_at/ends_at alone.
 * Importer metadata must never set playable=true.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  classifySportsBroadcast,
} from "../broadcasts/classification";
import {
  isProviderConfirmedLiveStatus,
  resolveSportsStatusAuthority,
} from "../status/statusAuthority";
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
  is_official?: boolean | null;
  publisher_name?: string | null;
  publisher_domain?: string | null;
  verification_status?: string | null;
  metadata?: Record<string, unknown> | null;
  quarantined_at?: string | null;
};

export function deriveFixtureAvailability(input: {
  fixtureStatus: string;
  startsAt: string;
  endsAt?: string | null;
  broadcasts: BroadcastPlayabilityRow[];
  providerHealthy?: boolean;
  sportSlug?: string | null;
  metadata?: Record<string, unknown> | null;
  now?: Date;
}): { availabilityState: SportsAvailabilityState; playable: boolean } {
  const now = input.now ?? new Date();
  const status = String(input.fixtureStatus || "").toLowerCase();

  const authority = resolveSportsStatusAuthority({
    fixtureStatus: input.fixtureStatus,
    metadata: input.metadata,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    sportSlug: input.sportSlug,
    now,
  });

  const classified = input.broadcasts.map((b) => ({
    row: b,
    class: classifySportsBroadcast({
      publisherName: b.publisher_name,
      publisherDomain: b.publisher_domain,
      broadcastType: b.broadcast_type,
      playbackKind: b.playback_kind,
      isOfficial: b.is_official,
      verificationStatus: b.verification_status,
      validationStatus: b.validation_status,
      validationExpiresAt: b.validation_expires_at,
      metadata: b.metadata,
      quarantinedAt: b.quarantined_at,
      now,
    }),
  }));

  const eligibleInApp = classified
    .filter(
      (c) =>
        c.class.eventSpecific &&
        c.class.publicStreamEligible &&
        c.class.classification !== "generic_sports_channel" &&
        c.class.classification !== "rejected" &&
        c.class.classification !== "unverified_channel_mapping" &&
        // live_channel alone is never event-specific in-app
        !["live_channel", "channel", "linear"].includes(
          String(c.row.broadcast_type || "").toLowerCase()
        ) &&
        isEligibleForReadyPlayback({
          healthScore: Number(c.row.health_score || 0),
          validationStatus: c.row.validation_status,
          validationExpiresAt: c.row.validation_expires_at,
          providerStatus:
            input.providerHealthy === false ? "unavailable" : "healthy",
          now,
        })
    )
    .map((c) => c.row);

  const hasSubscriptionOnly =
    classified.some(
      (c) =>
        c.row.requires_subscription ||
        c.row.subscription_required ||
        c.row.access_type === "subscription"
    ) && eligibleInApp.length === 0;

  const hasExternalOnly =
    classified.some(
      (c) =>
        c.class.classification === "official_external_watch_link" ||
        c.row.playback_kind === "external" ||
        c.row.access_type === "external" ||
        c.row.broadcast_type === "external_watch"
    ) && eligibleInApp.length === 0;

  const hasHighlights = eligibleInApp.some(
    (b) => b.broadcast_type === "highlights"
  );
  const hasReplay = eligibleInApp.some((b) => b.broadcast_type === "replay");
  const hasLiveInApp = eligibleInApp.some((b) =>
    ["live_match", "live_event"].includes(b.broadcast_type)
  );

  if (
    status === "completed" ||
    status === "expired" ||
    authority.canonical === "completed" ||
    authority.canonical === "ended_stream_unavailable" ||
    authority.staleLiveCandidate
  ) {
    if (hasReplay) {
      return { availabilityState: "replay_available", playable: true };
    }
    if (hasHighlights) {
      return { availabilityState: "highlights_available", playable: true };
    }
    return { availabilityState: "finished", playable: false };
  }

  if (
    status === "cancelled" ||
    status === "postponed" ||
    status === "suspended" ||
    status === "abandoned" ||
    authority.canonical === "cancelled" ||
    authority.canonical === "postponed" ||
    authority.canonical === "suspended" ||
    authority.canonical === "abandoned"
  ) {
    return { availabilityState: "live_unavailable", playable: false };
  }

  // LIVE only from provider-confirmed status — never from the clock.
  const isLive =
    authority.providerConfirmedLive ||
    isProviderConfirmedLiveStatus(status);

  if (isLive) {
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

  if (
    status === "scheduled" ||
    status === "verified" ||
    authority.canonical === "scheduled" ||
    authority.canonical === "pre_live" ||
    authority.canonical === "delayed"
  ) {
    return { availabilityState: "upcoming", playable: false };
  }

  return { availabilityState: "upcoming", playable: false };
}

export async function syncFixturePlayability(
  fixtureId: string
): Promise<{ availabilityState: SportsAvailabilityState; playable: boolean }> {
  const { data: fixture, error } = await supabaseAdmin
    .from("sports_fixtures")
    .select("id, status, starts_at, ends_at, metadata, sport_id")
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
      "id, broadcast_type, access_type, validation_status, health_score, validation_expires_at, requires_subscription, subscription_required, playback_kind, is_embeddable, is_official, publisher_name, publisher_domain, verification_status, metadata, quarantined_at, provider_id"
    )
    .eq("fixture_id", fixtureId)
    .is("unpublished_at", null)
    .is("quarantined_at", null);

  const derived = deriveFixtureAvailability({
    fixtureStatus: fixture.status,
    startsAt: fixture.starts_at,
    endsAt: fixture.ends_at,
    broadcasts: (broadcasts || []) as BroadcastPlayabilityRow[],
    sportSlug,
    metadata: (fixture.metadata || {}) as Record<string, unknown>,
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
