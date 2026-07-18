/**
 * Continuous catalogue cleaning rules for dead / broken / duplicate content.
 */

export type ConcertCleanAction =
  | "keep_public"
  | "hide"
  | "quarantine"
  | "mark_offline"
  | "mark_unavailable";

export type ConcertCleanDecision = {
  action: ConcertCleanAction;
  reason: string;
};

export function decideConcertCleanAction(input: {
  playable: boolean;
  privateOrRemoved?: boolean;
  fakeLive?: boolean;
  expiredNoReplay?: boolean;
  brokenEmbed?: boolean;
  duplicateExact?: boolean;
  placeholder?: boolean;
}): ConcertCleanDecision {
  if (input.privateOrRemoved) {
    return { action: "mark_unavailable", reason: "removed_or_private" };
  }
  if (input.fakeLive) {
    return { action: "quarantine", reason: "fake_live" };
  }
  if (input.placeholder) {
    return { action: "hide", reason: "placeholder_card" };
  }
  if (input.brokenEmbed) {
    return { action: "hide", reason: "broken_embed" };
  }
  if (input.expiredNoReplay) {
    return { action: "mark_offline", reason: "expired_no_replay" };
  }
  if (input.duplicateExact) {
    return { action: "hide", reason: "duplicate_exact" };
  }
  if (!input.playable) {
    return { action: "hide", reason: "playback_failed" };
  }
  return { action: "keep_public", reason: "playable" };
}
