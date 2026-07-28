/**
 * Broadcast legal / identity classification for Sports.
 *
 * Generic sports channels and IPTV lists must never be treated as
 * event-specific official verified streams.
 */

export type SportsBroadcastClass =
  | "event_specific_official"
  | "official_broadcaster_page"
  | "official_external_watch_link"
  | "generic_sports_channel"
  | "unverified_channel_mapping"
  | "replay"
  | "highlights"
  | "expired"
  | "quarantined"
  | "rejected";

export type BroadcastClassificationInput = {
  publisherName?: string | null;
  publisherDomain?: string | null;
  broadcastType?: string | null;
  playbackKind?: string | null;
  isOfficial?: boolean | null;
  verificationStatus?: string | null;
  validationStatus?: string | null;
  validationExpiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
  quarantinedAt?: string | null;
  now?: Date;
};

export type BroadcastClassificationResult = {
  classification: SportsBroadcastClass;
  /** May be treated as event-specific in-app or external watch. */
  eventSpecific: boolean;
  /** Eligible for public Sports browse/play paths. */
  publicStreamEligible: boolean;
  /** is_official may only be true with evidence — this reports computed honesty. */
  officialAllowed: boolean;
  /** verified requires technical + identity proof — not mere import. */
  verifiedAllowed: boolean;
  reasons: string[];
};

const IPTV_PUBLISHER_RE =
  /iptv-org|free-tv\s*iptv|iptv\b/i;
const TV_BRIDGE_RE =
  /tv catalog sports bridge|sports bridge|wave4 sports/i;
const GENERIC_CHANNEL_TYPES = new Set([
  "live_channel",
  "channel",
  "linear",
  "fast_channel",
]);

function metaString(
  meta: Record<string, unknown> | null | undefined,
  key: string
): string {
  const v = meta?.[key];
  return typeof v === "string" ? v : "";
}

/**
 * Classify a broadcast row for eligibility and official/verified honesty.
 */
export function classifySportsBroadcast(
  input: BroadcastClassificationInput
): BroadcastClassificationResult {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const publisher = String(input.publisherName || "");
  const broadcastType = String(input.broadcastType || "").toLowerCase();
  const meta = input.metadata && typeof input.metadata === "object"
    ? input.metadata
    : null;
  const source = metaString(meta, "source");
  const rightsNote = metaString(meta, "rightsNote");
  const org = metaString(meta, "officialOrganization");
  const watchUrl = metaString(meta, "watchUrl");
  const provenance = metaString(meta, "discoveryProvenance");

  if (input.quarantinedAt) {
    return {
      classification: "quarantined",
      eventSpecific: false,
      publicStreamEligible: false,
      officialAllowed: false,
      verifiedAllowed: false,
      reasons: ["already_quarantined"],
    };
  }

  if (
    input.validationExpiresAt &&
    Date.parse(input.validationExpiresAt) < now.getTime()
  ) {
    reasons.push("validation_expired");
  }

  if (
    IPTV_PUBLISHER_RE.test(publisher) ||
    /iptv/i.test(source) ||
    /iptv-org/i.test(provenance)
  ) {
    return {
      classification: "rejected",
      eventSpecific: false,
      publicStreamEligible: false,
      officialAllowed: false,
      verifiedAllowed: false,
      reasons: [...reasons, "iptv_or_community_list_source"],
    };
  }

  if (TV_BRIDGE_RE.test(publisher) || /sports_worldwide_expansion/i.test(source)) {
    return {
      classification: "generic_sports_channel",
      eventSpecific: false,
      publicStreamEligible: false,
      officialAllowed: false,
      verifiedAllowed: false,
      reasons: [...reasons, "tv_bridge_or_keyword_expansion_without_event_proof"],
    };
  }

  if (GENERIC_CHANNEL_TYPES.has(broadcastType)) {
    return {
      classification: "generic_sports_channel",
      eventSpecific: false,
      publicStreamEligible: false,
      officialAllowed: false,
      verifiedAllowed: false,
      reasons: [...reasons, "generic_channel_broadcast_type"],
    };
  }

  if (broadcastType === "highlights") {
    return {
      classification: "highlights",
      eventSpecific: true,
      publicStreamEligible: Boolean(org || input.isOfficial),
      officialAllowed: Boolean(org),
      verifiedAllowed:
        input.validationStatus === "validated" &&
        !reasons.includes("validation_expired"),
      reasons: [...reasons, "highlights_asset"],
    };
  }

  if (broadcastType === "replay") {
    return {
      classification: "replay",
      eventSpecific: true,
      publicStreamEligible: Boolean(org || input.isOfficial),
      officialAllowed: Boolean(org),
      verifiedAllowed:
        input.validationStatus === "validated" &&
        !reasons.includes("validation_expired"),
      reasons: [...reasons, "replay_asset"],
    };
  }

  if (
    broadcastType === "external_watch" ||
    input.playbackKind === "external" ||
    (watchUrl && !metaString(meta, "manifestUrl") && !metaString(meta, "embedUrl"))
  ) {
    const official =
      Boolean(org) ||
      /youtube\.com|youtu\.be/i.test(watchUrl) &&
        Boolean(metaString(meta, "youtubeChannelId"));
    return {
      classification: "official_external_watch_link",
      eventSpecific: official,
      publicStreamEligible: official,
      officialAllowed: official,
      verifiedAllowed: false, // external page ≠ in-app playable verified
      reasons: [
        ...reasons,
        official ? "external_watch_with_org_or_channel" : "external_watch_unproven",
      ],
    };
  }

  const hasOrgEvidence = Boolean(org) || /federation|league|club|official/i.test(rightsNote);
  const eventTypes = new Set(["live_match", "live_event"]);
  if (eventTypes.has(broadcastType) && hasOrgEvidence) {
    const validated =
      input.validationStatus === "validated" &&
      !reasons.includes("validation_expired");
    return {
      classification: "event_specific_official",
      eventSpecific: true,
      publicStreamEligible: validated || Boolean(watchUrl),
      officialAllowed: true,
      verifiedAllowed: validated,
      reasons: [...reasons, "event_specific_with_org_evidence"],
    };
  }

  if (input.isOfficial === true && !hasOrgEvidence) {
    return {
      classification: "unverified_channel_mapping",
      eventSpecific: false,
      publicStreamEligible: false,
      officialAllowed: false,
      verifiedAllowed: false,
      reasons: [...reasons, "false_official_without_evidence"],
    };
  }

  return {
    classification: "unverified_channel_mapping",
    eventSpecific: false,
    publicStreamEligible: false,
    officialAllowed: false,
    verifiedAllowed: false,
    reasons: [...reasons, "insufficient_event_identity_evidence"],
  };
}

export function isUnsafeSportsPublisher(publisherName?: string | null): boolean {
  return IPTV_PUBLISHER_RE.test(String(publisherName || ""));
}

export function isTvBridgeSportsPublisher(publisherName?: string | null): boolean {
  return TV_BRIDGE_RE.test(String(publisherName || ""));
}
