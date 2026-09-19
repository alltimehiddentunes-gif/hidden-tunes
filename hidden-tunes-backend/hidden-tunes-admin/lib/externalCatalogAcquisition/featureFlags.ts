import type { ProviderId } from "./types";
export type AcquisitionFeatureFlags = { externalAcquisition: boolean; downloads: boolean; taxonomy: boolean; ingestion: boolean; publishing: boolean; providers: Readonly<Record<ProviderId, boolean>> };
const enabled = (value: unknown): boolean => String(value || "").trim().toLowerCase() === "true";
export function createFeatureFlags(env: NodeJS.ProcessEnv = process.env): AcquisitionFeatureFlags {
  const providerIds: ProviderId[] = ["dogmazic", "free_music_archive", "musopen", "wikimedia_commons", "open_music_archive", "ccmixter", "imslp", "audiotreasure", "public_domain_audio_bibles", "internet_archive"];
  const providers = Object.fromEntries(providerIds.map((providerId) => [providerId, enabled(env[`EXTERNAL_CATALOG_SOURCE_${providerId.toUpperCase()}`])])) as Record<ProviderId, boolean>;
  return Object.freeze({ externalAcquisition: enabled(env.EXTERNAL_CATALOG_ACQUISITION_ENABLED), downloads: enabled(env.EXTERNAL_CATALOG_DOWNLOADS_ENABLED), taxonomy: enabled(env.EXTERNAL_CATALOG_TAXONOMY_ENABLED), ingestion: enabled(env.EXTERNAL_CATALOG_INGESTION_ENABLED), publishing: enabled(env.EXTERNAL_CATALOG_PUBLISHING_ENABLED), providers: Object.freeze(providers) });
}

