import type { RightsCatalogItem } from "@/lib/rights/types";

export const MUSIC_CUTOFF = "2026-07-24T23:59:59.999Z";
export const DJCITY_UPLOADER_ID = "2ab4318b-e99e-4545-a511-d5eee8d6a2f9";
export const MUREKA_ACCOUNT_UID = "118869219999745";
export const MUREKA_OWNER = "Lotsu Emmanuel";
export const MUREKA_EMAIL = "alltimeshiddentunes@gmail.com";
export const PROPOSED_COHORT_COUNTS = {
  murekaOriginal: 1276,
  djcity: 3467,
  iptvDmca: 2,
} as const;

// Owner-confirmed post-cutoff Mureka exceptions. These stable production IDs
// prevent a historical date fallback from undoing the corrected provenance.
export const MUREKA_CORRECTED_TRACK_IDS = [
  // Chicago Blues: 13 tracks posted after the original cutoff.
  "35f20622-126c-4b43-bd3a-acd97c411b26",
  "94417d1c-2205-454c-beba-38d41aed53bc",
  "2a1b78a1-72ae-4dcb-976a-d222a6e6d24c",
  "8f30b2c7-8065-4f34-aea8-b5b74d240416",
  "204f393f-4e05-471a-8fd5-f7baea3b9271",
  "ec017b72-98de-4ce6-977a-476725a10cf0",
  "cb017091-4bf5-4784-a68a-6035772cd120",
  "ea16aacc-ecd5-4c7f-9216-a80f42496f99",
  "97a1fa15-49a7-4dae-a245-95a0c6b61b08",
  "dbc9de81-07f0-4f8e-98fe-eb4d4b810ce3",
  "bc15c9cb-8104-4bc6-bb90-1433e7a8938f",
  "f9554757-ac76-4d54-8b91-63c9f0887f56",
  "a7c7cd0f-6466-4df6-8f0b-3fe9e835cc3c",
  // Hidden Tunes Afrobeats on 2026-08-16 UTC, anchored by PUSANA PENE.
  "fc94f595-82e8-4d41-9ea1-5cbbc618020e",
  "f6979d59-3433-4aa9-a34b-ceaf621cfdc7",
  "bdacc5b5-a17c-4f1b-8be6-8c6885476efd",
  "30ba2158-a6ae-40d4-a240-ef872e8a4caa",
  "19822b5d-662b-45f1-8edd-84c153f6371c",
  "644b32f7-a2d4-42dd-a5db-b1b1f089017e",
  "5d61fbbd-da1a-4e51-886b-4a3c3afe24ea",
  "3c0a4ecd-0d26-4217-9b91-54d077c5c600",
  "8017f4a4-9c74-43f0-927b-f4d609cd7030",
  "364373d8-6fb4-4344-bce8-29686e258231",
  "234c8496-af9b-475a-a772-6256ffb4874e",
  "6d736bbc-26c1-458e-8843-5ef93cc2cbdb",
  "13fa0d73-795a-465e-959c-a9e4596ee0a7",
  "a8cc2b5b-f2ed-4210-ba24-64c2f8e17b35",
  "0f1661e7-70b1-4811-82ac-5c38a9385df9",
  "4036ccc7-487e-4473-9451-f3caee48a885",
  "71517732-5572-4f39-a3a4-459275fedcac",
  "8c65b1e0-a8d8-43c4-a4e3-186e76d96444",
] as const;

const MUREKA_CORRECTED_TRACK_ID_SET = new Set<string>(MUREKA_CORRECTED_TRACK_IDS);

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
  if (MUREKA_CORRECTED_TRACK_ID_SET.has(item.contentId)) return "mureka_original";
  if (item.providerSlug === "mureka") return "mureka_original";
  if (item.providerSlug === "djcity") return "djcity";
  const ingested = item.ingestedAt ? Date.parse(item.ingestedAt) : Number.NaN;
  const cutoff = Date.parse(MUSIC_CUTOFF);
  if (!Number.isNaN(ingested)) return ingested <= cutoff ? "mureka_original" : "djcity";
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
