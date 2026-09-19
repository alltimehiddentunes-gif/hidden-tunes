import type { AcquisitionState, ExternalCatalogAsset } from "./types";
import { InvalidAcquisitionTransitionError } from "./errors";

export const MANDATORY_STATES: readonly AcquisitionState[] = [
  "DISCOVERED", "RIGHTS_PENDING", "RIGHTS_APPROVED", "DOWNLOAD_PENDING", "DOWNLOADED",
  "AUDIO_VALIDATED", "DEDUPLICATED", "TAXONOMY_PENDING", "TAXONOMY_CLASSIFIED",
  "READY_FOR_REVIEW", "APPROVED_FOR_INGESTION", "INGESTED",
] as const;
export const HOLDING_STATES: readonly AcquisitionState[] = [
  "RIGHTS_REVIEW", "RIGHTS_BLOCKED", "DOWNLOAD_FAILED", "QUALITY_REJECTED",
  "DUPLICATE", "METADATA_INVALID", "INGESTION_FAILED",
] as const;

const TRANSITIONS: Readonly<Record<AcquisitionState, readonly AcquisitionState[]>> = {
  DISCOVERED: ["RIGHTS_PENDING", "METADATA_INVALID"],
  RIGHTS_PENDING: ["RIGHTS_APPROVED", "RIGHTS_REVIEW", "RIGHTS_BLOCKED"],
  RIGHTS_APPROVED: ["DOWNLOAD_PENDING"], DOWNLOAD_PENDING: ["DOWNLOADED", "DOWNLOAD_FAILED"],
  DOWNLOADED: ["AUDIO_VALIDATED", "QUALITY_REJECTED"], AUDIO_VALIDATED: ["DEDUPLICATED", "QUALITY_REJECTED"],
  DEDUPLICATED: ["TAXONOMY_PENDING", "DUPLICATE"], TAXONOMY_PENDING: ["TAXONOMY_CLASSIFIED"],
  TAXONOMY_CLASSIFIED: ["READY_FOR_REVIEW"], READY_FOR_REVIEW: ["APPROVED_FOR_INGESTION"],
  APPROVED_FOR_INGESTION: ["INGESTED", "INGESTION_FAILED"], INGESTED: [],
  RIGHTS_REVIEW: ["RIGHTS_PENDING", "RIGHTS_APPROVED", "RIGHTS_BLOCKED"], RIGHTS_BLOCKED: [],
  DOWNLOAD_FAILED: ["DOWNLOAD_PENDING"], QUALITY_REJECTED: [], DUPLICATE: [], METADATA_INVALID: [],
  INGESTION_FAILED: ["APPROVED_FOR_INGESTION", "READY_FOR_REVIEW"],
};

export function allowedTransitions(state: AcquisitionState): readonly AcquisitionState[] { return TRANSITIONS[state]; }
export function assertValidTransition(from: AcquisitionState, to: AcquisitionState): void {
  if (!TRANSITIONS[from].includes(to)) throw new InvalidAcquisitionTransitionError(from, to);
}
export function transitionAsset(asset: ExternalCatalogAsset, to: AcquisitionState, stateChangedAt = new Date().toISOString()): ExternalCatalogAsset {
  assertValidTransition(asset.state, to); return { ...asset, state: to, stateChangedAt };
}
