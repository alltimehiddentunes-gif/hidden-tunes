export const RIGHTS_STATUSES = ["green", "amber", "red", "unknown"] as const;
export const RIGHTS_PLATFORMS = [
  "ios",
  "android",
  "web",
  "windows",
  "macos",
  "linux",
] as const;
export const RIGHTS_CONTENT_TYPES = [
  "music",
  "radio",
  "tv",
  "podcast_show",
  "podcast_episode",
  "audiobook",
  "lecture",
  "motivational",
  "sports",
] as const;

export type RightsStatus = (typeof RIGHTS_STATUSES)[number];
export type RightsPlatform = (typeof RIGHTS_PLATFORMS)[number];
export type RightsContentType = (typeof RIGHTS_CONTENT_TYPES)[number];
export type PlatformRules = Partial<Record<RightsPlatform, boolean>>;

export type RightsFilterField =
  | "content_type"
  | "provider_id"
  | "rights_status"
  | "uploader_id"
  | "import_batch"
  | "ingested_at"
  | "country_code"
  | "region"
  | "territory"
  | "evidence_status"
  | "license_expires_at"
  | "stream_type"
  | "source_host"
  | "source_active"
  | "search"
  | `platform.${RightsPlatform}`;

export type RightsFilterOperator =
  | "eq"
  | "in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "present"
  | "missing"
  | "search";

export type RightsFilterClause = {
  field: RightsFilterField;
  op: RightsFilterOperator;
  value?: string | boolean | string[];
};

export type RightsFilter = {
  version: 1;
  all: RightsFilterClause[];
};

export type RightsCatalogItem = {
  id: string;
  contentType: RightsContentType;
  contentId: string;
  parentContentId?: string | null;
  title: string;
  creatorName?: string | null;
  providerId?: string | null;
  providerSlug?: string | null;
  uploaderId?: string | null;
  importBatch?: string | null;
  ingestedAt?: string | null;
  countryCode?: string | null;
  region?: string | null;
  sourceHost?: string | null;
  sourceType?: string | null;
  streamType: "direct" | "proxied" | "relayed" | "rehosted" | "unknown";
  sourceActive: boolean;
  baseRightsStatus: RightsStatus;
  evidenceStatus: "documented" | "missing" | "expiring" | "expired" | "needs_review";
  licenseExpiresAt?: string | null;
};

export type RightsPolicyScope =
  | "global"
  | "content_type"
  | "provider"
  | "uploader"
  | "source"
  | "batch"
  | "network"
  | "hostname"
  | "country"
  | "filter"
  | "content";

export type RightsPolicy = {
  id: string;
  scope: RightsPolicyScope;
  scopeValue?: string | null;
  rightsStatus: RightsStatus;
  platforms: PlatformRules;
  territories?: string[];
  worldwide?: boolean;
  effectiveAt?: string | null;
  expiresAt?: string | null;
  legalBlock?: boolean;
  active?: boolean;
  version?: number;
};

export type RightsDecision = {
  eligible: boolean;
  rightsStatus: RightsStatus;
  platform: RightsPlatform;
  territory: string;
  reason:
    | "enforcement_disabled"
    | "legal_block"
    | "red"
    | "unknown"
    | "amber"
    | "platform_disabled"
    | "territory_denied"
    | "expired"
    | "not_effective"
    | "conflict"
    | "eligible";
  winningPolicyId?: string;
  winningScope?: RightsPolicyScope;
};

export type RightsBulkAction =
  | { type: "set_rights_status"; status: RightsStatus }
  | { type: "set_platform"; platform: RightsPlatform; enabled: boolean }
  | { type: "set_provider"; providerId: string }
  | { type: "attach_license"; licenseId: string }
  | { type: "set_territories"; territories: string[]; worldwide: boolean }
  | { type: "set_expiry"; expiresAt: string | null }
  | { type: "assign_review"; assigneeId: string | null }
  | { type: "add_note"; note: string };

export type DryRunSummary = {
  matching: number;
  wouldChange: number;
  unchanged: number;
  conflicts: number;
  contentOverrides: number;
  inheritedProviderPolicies: number;
  inheritedBatchPolicies: number;
  expiredLicenses: number;
  blockedByHigherPriorityPolicy: number;
  currentlyEnabled: number;
  currentlyDisabled: number;
  proposedEnabled: number;
  proposedDisabled: number;
};

export type RightsLicenseScope = {
  id: string;
  status: "draft" | "active" | "expired" | "revoked" | "superseded";
  contentTypes: RightsContentType[];
  providerIds: string[];
  uploaderIds: string[];
  sourceKeys: string[];
  importBatches: string[];
  territories: string[];
  worldwide: boolean;
  platforms: RightsPlatform[];
  effectiveAt?: string | null;
  expiresAt?: string | null;
  permitsStreaming: boolean;
  permitsDownload: boolean;
  permitsCommercialUse: boolean;
};
