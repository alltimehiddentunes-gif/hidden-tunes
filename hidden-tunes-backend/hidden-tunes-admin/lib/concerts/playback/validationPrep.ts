/**
 * Phase 6 playback validation contracts — preparation only (no publication).
 * oEmbed is evidence, not proof that playback starts.
 */

export type ConcertPlaybackValidationSignal =
  | "watch_page_ok"
  | "embed_allowed"
  | "provider_player_loads"
  | "playback_starts"
  | "is_currently_live"
  | "scheduled_not_started"
  | "replay_available"
  | "region_blocked"
  | "age_restricted"
  | "login_required"
  | "subscription_required"
  | "members_only"
  | "removed_or_private"
  | "temporary_provider_error"
  | "dead_stream"
  | "fake_live_loop"
  | "unsupported_player";

export type ConcertPlaybackValidationPrep = {
  concertItemId: string;
  concertStreamId?: string | null;
  signals: Partial<Record<ConcertPlaybackValidationSignal, boolean | null>>;
  evidence: Record<string, unknown>;
  readyForPhase6: boolean;
  blockers: string[];
};

export function buildConcertPlaybackValidationPrep(input: {
  concertItemId: string;
  concertStreamId?: string | null;
  oembedOk?: boolean | null;
  embeddable?: boolean | null;
  liveBroadcastContent?: string | null;
  regionBlocked?: boolean | null;
  privacyStatus?: string | null;
}): ConcertPlaybackValidationPrep {
  const signals: ConcertPlaybackValidationPrep["signals"] = {
    watch_page_ok: input.oembedOk ?? null,
    embed_allowed: input.embeddable ?? null,
    provider_player_loads: null, // Phase 6
    playback_starts: null, // Phase 6 — never inferred from oEmbed alone
    is_currently_live: input.liveBroadcastContent === "live",
    scheduled_not_started: input.liveBroadcastContent === "upcoming",
    replay_available: input.liveBroadcastContent === "none" && input.oembedOk === true,
    region_blocked: input.regionBlocked ?? null,
    age_restricted: null,
    login_required: null,
    subscription_required: null,
    members_only: null,
    removed_or_private:
      input.privacyStatus === "private" || input.privacyStatus === "unlisted"
        ? true
        : input.privacyStatus
          ? false
          : null,
    temporary_provider_error: null,
    dead_stream: input.oembedOk === false ? true : null,
    fake_live_loop: null,
    unsupported_player: null,
  };

  const blockers: string[] = [];
  if (signals.embed_allowed === false) blockers.push("embed_disabled");
  if (signals.removed_or_private === true) blockers.push("private_or_removed");
  if (signals.dead_stream === true) blockers.push("dead_stream");
  // oEmbed success alone is insufficient for publication readiness.
  if (signals.playback_starts == null) {
    blockers.push("playback_start_unproven");
  }

  return {
    concertItemId: input.concertItemId,
    concertStreamId: input.concertStreamId || null,
    signals,
    evidence: {
      oembed_is_evidence_only: true,
      live_broadcast_content: input.liveBroadcastContent || null,
    },
    readyForPhase6: blockers.every((b) => b === "playback_start_unproven"),
    blockers,
  };
}

export function assertOembedIsNotPlaybackProof(oembedOk: boolean): {
  playableProven: false;
  note: string;
} {
  return {
    playableProven: false,
    note: oembedOk
      ? "oEmbed succeeded — metadata evidence only; playback start still unproven"
      : "oEmbed failed — not playable evidence",
  };
}
