export const PROVIDER_IDS = [
  "dogmazic",
  "free_music_archive",
  "musopen",
  "wikimedia_commons",
  "open_music_archive",
  "ccmixter",
  "imslp",
  "audiotreasure",
  "public_domain_audio_bibles",
  "internet_archive",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type AcquisitionState =
  | "DISCOVERED" | "RIGHTS_PENDING" | "RIGHTS_APPROVED" | "DOWNLOAD_PENDING"
  | "DOWNLOADED" | "AUDIO_VALIDATED" | "DEDUPLICATED" | "TAXONOMY_PENDING"
  | "TAXONOMY_CLASSIFIED" | "READY_FOR_REVIEW" | "APPROVED_FOR_INGESTION"
  | "INGESTED" | "RIGHTS_REVIEW" | "RIGHTS_BLOCKED" | "DOWNLOAD_FAILED"
  | "QUALITY_REJECTED" | "DUPLICATE" | "METADATA_INVALID" | "INGESTION_FAILED";

export type RightsBucket = "GREEN" | "AMBER" | "RED";
export type RightsDecision = "APPROVED" | "REVIEW" | "BLOCKED";
export type DuplicateClassification =
  | "EXACT_FILE" | "SAME_RECORDING" | "LIKELY_SAME_RECORDING"
  | "SAME_COMPOSITION_DIFFERENT_RECORDING" | "METADATA_ONLY" | "NOT_DUPLICATE";
export type AcquisitionContentFamily = "MUSIC" | "FAITH_BIBLE" | "AUDIOBOOK";
export type RightsLayer = "recording" | "composition";

export type RightsLayerInput = {
  layer: RightsLayer;
  licenseName?: string | null;
  licenseIdentifier?: string | null;
  licenseUrl?: string | null;
  attributionText?: string | null;
  attributionRequired?: boolean | null;
  commercialUseAllowed?: boolean | null;
  redistributionAllowed?: boolean | null;
  derivativeWorksAllowed?: boolean | null;
  jurisdiction?: string | null;
  rightsStatement?: string | null;
  evidencePresent: boolean;
};

export type RightsEvaluationInput = {
  recording: RightsLayerInput;
  composition: RightsLayerInput;
  conflictingEvidence?: boolean;
};

export type RightsEvaluation = {
  bucket: RightsBucket;
  decision: RightsDecision;
  nextState: "RIGHTS_APPROVED" | "RIGHTS_REVIEW" | "RIGHTS_BLOCKED";
  reason: string;
  attributionRequired: boolean;
  attributionText: string | null;
  recording: RightsLayerInput;
  composition: RightsLayerInput;
};

export type SourceRateLimitPolicy = { maxConcurrency: number; minimumDelayMs: number; maxRetries: number };
export type SourceHealth = { providerId: ProviderId; enabled: boolean; reachable: boolean; checkedAt: string; reason?: string };
export type SourceDiscoveryRequest = { query?: string; cursor?: string | null; limit: number };
export type DiscoveredSourceItem = { sourceItemId: string; sourceUrl: string; title?: string | null; artist?: string | null; metadata: Record<string, unknown> };
export type ExternalCatalogAsset = { id: string; providerId: ProviderId; sourceItemId: string; state: AcquisitionState; contentFamily: AcquisitionContentFamily; metadata: Record<string, unknown>; stateChangedAt: string };

