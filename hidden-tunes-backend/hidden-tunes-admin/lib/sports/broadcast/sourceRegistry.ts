/**
 * Rights-controlled official broadcast source registry.
 * Production pilot: approved_embed sources only (bounded).
 */

import type { SourceClassification } from "./sourceClassification";
import {
  classificationAllowsExternalWatch,
  classificationAllowsLiveInApp,
} from "./sourceClassification";
import { PILOT_APPROVED_EMBED_SOURCES } from "./pilotOfficialSources";

export type BroadcastApprovalStatus = SourceClassification;

export type BroadcastSourceType =
  | "youtube_official"
  | "official_embed"
  | "official_external"
  | "direct_stream_contract"
  | "public_broadcaster"
  | "federation_ott"
  | "official_web";

export type BroadcastSourceRecord = {
  id: string;
  sourceType: BroadcastSourceType;
  providerName: string;
  officialOrganization: string;
  officialChannelId: string | null;
  officialDomain: string | null;
  countryCodes: string[];
  sports: string[];
  competitions: string[];
  rightsScope: string;
  commercialAppUse: boolean;
  embeddingAllowed: boolean;
  externalLinkAllowed: boolean;
  authenticationRequired: boolean;
  subscriptionRequired: boolean;
  attribution: string;
  approvalEvidence: string;
  approvalStatus: BroadcastApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  active: boolean;
  lastReviewedAt: string | null;
};

export function buildBroadcastSourceRegistry(): BroadcastSourceRecord[] {
  const now = new Date().toISOString();
  return PILOT_APPROVED_EMBED_SOURCES.map((s) => ({
    id: s.id,
    sourceType: "youtube_official" as const,
    providerName: "youtube",
    officialOrganization: s.organization,
    officialChannelId: s.youtubeChannelId,
    officialDomain: null,
    countryCodes: s.country ? [s.country] : [],
    sports: [s.sport],
    competitions: [],
    rightsScope: s.sourceType,
    commercialAppUse: true,
    embeddingAllowed: true,
    externalLinkAllowed: true,
    authenticationRequired: false,
    subscriptionRequired: false,
    attribution: s.organization,
    approvalEvidence: s.approvalEvidence,
    approvalStatus: "approved_embed" as const,
    approvedBy: "sports-live-pilot",
    approvedAt: now,
    active: true,
    lastReviewedAt: now,
  }));
}

export const OFFICIAL_BROADCAST_SOURCE_SEEDS: BroadcastSourceRecord[] =
  buildBroadcastSourceRegistry();

export function listActiveBroadcastSources(
  records: BroadcastSourceRecord[] = buildBroadcastSourceRegistry()
): BroadcastSourceRecord[] {
  return records.filter((r) => r.active);
}

export function canProduceLiveInApp(source: BroadcastSourceRecord): boolean {
  return (
    source.active &&
    source.commercialAppUse &&
    classificationAllowsLiveInApp(source.approvalStatus) &&
    (source.embeddingAllowed || source.approvalStatus === "approved_direct")
  );
}

export function canProduceLiveExternal(source: BroadcastSourceRecord): boolean {
  return (
    source.active &&
    source.externalLinkAllowed &&
    classificationAllowsExternalWatch(source.approvalStatus)
  );
}

export function allowlistedYoutubeChannelIds(
  records: BroadcastSourceRecord[] = listActiveBroadcastSources()
): string[] {
  return records
    .filter(
      (r) =>
        r.sourceType === "youtube_official" &&
        r.active &&
        r.officialChannelId &&
        (r.approvalStatus === "approved_embed" ||
          r.approvalStatus === "approved_metadata_only" ||
          r.approvalStatus === "approved_external")
    )
    .map((r) => r.officialChannelId!)
    .filter(Boolean);
}
