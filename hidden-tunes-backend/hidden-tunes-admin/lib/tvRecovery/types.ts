import type { DeepStreamOutcome, DeepStreamProbeResult } from "@/lib/tvStreamProtocol";

export type TvRecoveryStation = {
  id: string;
  title: string;
  source_type: string | null;
  source_id: string | null;
  source_key: string | null;
  source_url: string | null;
  validated_stream_url: string | null;
  embed_url: string | null;
  status: string | null;
  playback_status: string | null;
  is_active: boolean;
  reliability_score: number | null;
  consecutive_failures: number | null;
  quarantined_at: string | null;
  disabled_at: string | null;
  last_health_checked_at?: string | null;
  last_health_error?: string | null;
  last_validation_result?: string | null;
  ios_playable?: boolean | null;
  android_playable?: boolean | null;
  stream_protocol?: string | null;
  stream_is_https?: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type TvProviderIdentity = {
  providerId: string;
  canonicalId: string;
  sourceKey: string;
};

export type TvProviderCandidate = {
  providerId: string;
  canonicalId: string;
  sourceKey: string;
  sourceType: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type TvRecoverySourceDescriptor = {
  protocol: string;
  host: string | null;
  path: string | null;
  fingerprint: string;
  temporary: boolean;
};

export type TvRecoveryDuplicateDecision = {
  decision: "canonical" | "duplicate_of" | "unique" | "conflict";
  canonicalStationId: string;
  relatedStationIds: string[];
  reason: string;
};

export type TvRecoveryAction =
  | "none"
  | "refresh_source"
  | "correct_health"
  | "queue_inactive_review"
  | "classify_drm"
  | "classify_temporary"
  | "preserve_unresolved"
  | "duplicate_suppressed";

export type TvRecoveryPatch = Partial<{
  source_url: string;
  validated_stream_url: string | null;
  playback_status: string;
  reliability_score: number;
  consecutive_failures: number;
  quarantined_at: string | null;
  disabled_at: string | null;
  last_health_checked_at: string;
  last_health_error: string | null;
  last_validation_result: string;
  ios_playable: boolean;
  android_playable: boolean;
  stream_protocol: string | null;
  stream_is_https: boolean;
  is_active: boolean;
}>;

export type TvRecoveryPlan = {
  stationId: string;
  stationName: string;
  providerIdentity: TvProviderIdentity | null;
  providerMetadata: Record<string, string | number | boolean | null> | null;
  currentSource: TvRecoverySourceDescriptor | null;
  proposedSource: TvRecoverySourceDescriptor | null;
  currentState: {
    status: string | null;
    playbackStatus: string | null;
    active: boolean;
    reliabilityScore: number | null;
  };
  proposedState: {
    playbackStatus: string | null;
    active: boolean;
    reliabilityScore: number | null;
  };
  validation: {
    outcome: DeepStreamOutcome | "not_run";
    reason: string;
    manifestValidated: boolean;
    mediaValidated: boolean;
  };
  duplicate: TvRecoveryDuplicateDecision;
  drm: boolean;
  temporary: boolean;
  exactRecoveryReason: string;
  action: TvRecoveryAction;
  activationEligible: boolean;
  reviewChecks: {
    exactIdentity: boolean;
    duplicateSafe: boolean;
    canonicalRecord: boolean;
    providerProvenance: boolean;
    playbackValidated: boolean;
    conflict: boolean;
  };
  patch: TvRecoveryPatch;
};

export type TvRecoveryProbe = (
  sourceUrl: string,
  station: TvRecoveryStation
) => Promise<DeepStreamProbeResult>;

export type TvRecoveryAuditEvent = {
  at: string;
  stationId: string;
  action: TvRecoveryAction;
  applied: boolean;
  summary: Omit<TvRecoveryPlan, "patch">;
};
