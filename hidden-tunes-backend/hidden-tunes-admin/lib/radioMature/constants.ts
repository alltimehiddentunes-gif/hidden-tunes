export const RADIO_MATURE_EXPANSION_SOURCE_KEY = "radio-browser-mature-worldwide-v1";
export const RADIO_MATURE_USER_AGENT = "HiddenTunes/1.0 radio-mature-worldwide-v1";
export const RADIO_MATURE_EMPTY_PAGE_EXHAUST_THRESHOLD = 3;
export const RADIO_MATURE_DEFAULT_PAGE_SIZE = 25;

export const MATURE_REVIEW_STATUSES = [
  "pending",
  "confirmed",
  "borderline",
  "rejected",
] as const;

export const MATURE_RIGHTS_STATUSES = [
  "approved",
  "pending",
  "permission_required",
  "partnership_required",
  "blocked",
  "rejected",
] as const;

export const MATURE_SOURCE_APPROVAL_STATUSES = [
  "approved",
  "manual_review",
  "partnership_required",
  "permission_required",
  "blocked_terms",
  "rejected",
  "exhausted",
] as const;
