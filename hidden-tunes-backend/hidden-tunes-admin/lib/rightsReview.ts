export const RELEASE_REVIEW_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "copyright_flagged",
  "duplicate_flagged",
  "rejected",
  "published",
  "takedown_requested",
] as const;

export const LICENSE_DECLARATIONS = [
  "own_original_work",
  "licensed_content",
  "royalty_free_content",
  "ai_generated_content",
  "uploading_on_behalf_of_rights_holder",
  "unknown",
] as const;

export const RIGHTS_REVIEW_LATER_PHASE_NOTE =
  "Copyright and duplicate scanning will be added in a later phase.";

export type ReleaseReviewStatus = (typeof RELEASE_REVIEW_STATUSES)[number];
export type LicenseDeclaration = (typeof LICENSE_DECLARATIONS)[number];

export type RightsReviewMetadata = {
  reviewStatus: string | null;
  licenseDeclaration: string | null;
  licenseNotes: string | null;
  copyrightScanStatus: string | null;
  copyrightScanProvider: string | null;
  duplicateScanStatus: string | null;
  duplicateMatchTrackId: string | null;
  rejectionReason: string | null;
};

export function formatRightsValue(
  value: string | number | null | undefined,
  fallback = "Unknown"
) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  return raw
    .replace(/_/g, " ")
    .replace(/\bai\b/gi, "AI")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
