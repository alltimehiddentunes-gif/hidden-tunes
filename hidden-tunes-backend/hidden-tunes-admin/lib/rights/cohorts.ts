import type { RightsCatalogItem } from "@/lib/rights/types";

export const MUSIC_CUTOFF = "2026-07-24T23:59:59.999Z";
export const DJCITY_UPLOADER_ID = "2ab4318b-e99e-4545-a511-d5eee8d6a2f9";
export const MUREKA_ACCOUNT_UID = "118869219999745";
export const MUREKA_OWNER = "Lotsu Emmanuel";
export const MUREKA_EMAIL = "alltimeshiddentunes@gmail.com";
export const PROPOSED_COHORT_COUNTS = {
  murekaOriginal: 1245,
  djcity: 3498,
  iptvDmca: 2,
} as const;

export const IPTV_DMCA_CONTENT_IDS = [
  "a85e2c8e-505d-40e1-9238-3a1fe223c2b3",
  "e8450e95-8329-4137-8fdf-e4b678a541dbf",
] as const;

export type ProposedCohort =
  | "mureka_original"
  | "djcity"
  | "iptv_dmca"
  | null;

export function classifyProposedCohort(item: RightsCatalogItem): ProposedCohort {
  if (item.contentType === "tv" && IPTV_DMCA_CONTENT_IDS.includes(item.contentId as never)) {
    return "iptv_dmca";
  }
  if (item.contentType !== "music") return null;
  const ingested = item.ingestedAt ? Date.parse(item.ingestedAt) : Number.NaN;
  const cutoff = Date.parse(MUSIC_CUTOFF);
  if (!Number.isNaN(ingested)) return ingested <= cutoff ? "mureka_original" : "djcity";
  if (item.providerSlug === "mureka") return "mureka_original";
  if (item.providerSlug === "djcity") return "djcity";
  return null;
}

export const PROPOSED_COHORTS = [
  {
    key: "mureka_original",
    label: "MUREKA ORIGINAL",
    expectedCount: PROPOSED_COHORT_COUNTS.murekaOriginal,
    proposal: "GREEN / iOS ON",
    warning: "Final owner-confirmed provenance; no production policy is attached.",
  },
  {
    key: "djcity",
    label: "DJCITY",
    expectedCount: PROPOSED_COHORT_COUNTS.djcity,
    proposal: "RED / iOS OFF",
    warning: "Final owner-confirmed provenance; preserve records, media, and relationships.",
  },
  {
    key: "iptv_dmca",
    label: "IPTV DMCA",
    expectedCount: PROPOSED_COHORT_COUNTS.iptvDmca,
    proposal: "RED / iOS OFF",
    warning: "Roja TV and Roja Movies; proposed only.",
  },
] as const;
