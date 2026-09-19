import { IngestionGateError } from "./errors";
import type { AcquisitionFeatureFlags } from "./featureFlags";
import type { AcquisitionState, ExternalCatalogAsset } from "./types";
export function isApprovedForIngestion(state: AcquisitionState): boolean { return state === "APPROVED_FOR_INGESTION"; }
export function assertIngestionAllowed(asset: ExternalCatalogAsset, flags: AcquisitionFeatureFlags): void {
  if (!isApprovedForIngestion(asset.state)) throw new IngestionGateError("Asset must reach APPROVED_FOR_INGESTION before ingestion.");
  if (!flags.externalAcquisition || !flags.ingestion || !flags.publishing) throw new IngestionGateError("External acquisition ingestion and publishing gates are disabled.");
}

