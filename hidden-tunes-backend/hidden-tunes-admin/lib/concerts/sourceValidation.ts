import { assertConcertSourceAuthorizationFlags } from "./sourceAuthorization";
import {
  isValidConcertStableKey,
  normalizeConcertSourceSeed,
  normalizeCountryCode,
  normalizeReliabilityScore,
} from "./sourceNormalization";
import { isHttpsOfficialUrl } from "./providers/officialWebsite";
import { isValidYouTubeChannelId } from "./providers/youtubeOfficial";
import {
  CONCERT_AUTHORIZATION_BASES,
  CONCERT_EMBED_POLICIES,
  CONCERT_MEDIA_PROVIDERS,
  CONCERT_PROVIDER_TYPES,
  type ConcertRegistryValidationIssue,
  type ConcertRegistryValidationResult,
  type ConcertSourceSeed,
} from "./types";

function pushError(
  errors: ConcertRegistryValidationIssue[],
  message: string,
  stableKey?: string,
  field?: string
) {
  errors.push({ message, stableKey, field });
}

export function validateConcertSourceRecord(
  source: ConcertSourceSeed
): ConcertRegistryValidationResult {
  const errors: ConcertRegistryValidationIssue[] = [];
  const warnings: ConcertRegistryValidationIssue[] = [];
  const normalized = normalizeConcertSourceSeed(source);
  const key = normalized.stableKey;

  if (!isValidConcertStableKey(key)) {
    pushError(errors, "Invalid stable key", key, "stableKey");
  }
  if (!normalized.name) {
    pushError(errors, "Missing display name", key, "name");
  }
  if (!(CONCERT_PROVIDER_TYPES as readonly string[]).includes(normalized.providerType)) {
    pushError(errors, "Unsupported provider type", key, "providerType");
  }
  if (!(CONCERT_MEDIA_PROVIDERS as readonly string[]).includes(normalized.provider)) {
    pushError(errors, "Unsupported media provider", key, "provider");
  }
  if (!(CONCERT_AUTHORIZATION_BASES as readonly string[]).includes(normalized.authorizationBasis)) {
    pushError(errors, "Unsupported authorization state", key, "authorizationBasis");
  }
  if (!(CONCERT_EMBED_POLICIES as readonly string[]).includes(normalized.embedPolicy)) {
    pushError(errors, "Unsupported embed-policy state", key, "embedPolicy");
  }
  if (!normalized.officialUrl || !isHttpsOfficialUrl(normalized.officialUrl)) {
    pushError(errors, "Missing or invalid official website (https required)", key, "officialUrl");
  }
  if (!normalized.mediaChannelUrl) {
    pushError(errors, "Missing official media/channel URL", key, "mediaChannelUrl");
  }
  if (!normalized.ownershipEvidenceUrl || !isHttpsOfficialUrl(normalized.ownershipEvidenceUrl)) {
    pushError(errors, "Missing ownership evidence URL", key, "ownershipEvidenceUrl");
  }
  if (!normalizeCountryCode(normalized.countryCode)) {
    pushError(errors, "Invalid country code", key, "countryCode");
  }
  if (!normalized.sourceOwner) {
    pushError(errors, "Missing source owner", key, "sourceOwner");
  }
  if (!normalized.contentScope) {
    pushError(errors, "Missing content scope", key, "contentScope");
  }
  if (!normalized.expectedConcertFormats.length) {
    pushError(errors, "Missing expected concert formats", key, "expectedConcertFormats");
  }
  if (!normalized.validationMethod) {
    pushError(errors, "Missing validation method", key, "validationMethod");
  }
  if (!normalized.lastReviewedAt || !/^\d{4}-\d{2}-\d{2}$/.test(normalized.lastReviewedAt)) {
    pushError(errors, "Missing or invalid last-reviewed date", key, "lastReviewedAt");
  }
  if (normalizeReliabilityScore(normalized.reliabilityScore) == null) {
    pushError(errors, "Invalid reliability score (0-100)", key, "reliabilityScore");
  }
  if (!normalized.languageCodes.length) {
    pushError(errors, "At least one language code is required", key, "languageCodes");
  }
  if (!normalized.reviewNotes) {
    pushError(errors, "Missing review notes / classification reason", key, "reviewNotes");
  }

  if (normalized.provider === "youtube") {
    if (
      normalized.providerChannelId &&
      !isValidYouTubeChannelId(normalized.providerChannelId)
    ) {
      pushError(errors, "Invalid YouTube channel ID", key, "providerChannelId");
    }
    if (!normalized.providerChannelId) {
      warnings.push({
        stableKey: key,
        field: "providerChannelId",
        message:
          "YouTube source has no verified UC channel ID; later import should resolve and confirm identity.",
      });
    }
  }

  for (const message of assertConcertSourceAuthorizationFlags(normalized)) {
    pushError(errors, message, key, "authorization");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateConcertSourceRegistry(
  sources: ConcertSourceSeed[]
): ConcertRegistryValidationResult & {
  enabledCount: number;
  disabledCount: number;
  importEnabledCount: number;
  byProviderType: Record<string, number>;
  byCountry: Record<string, number>;
  byAuthorization: Record<string, number>;
  byEmbedPolicy: Record<string, number>;
} {
  const errors: ConcertRegistryValidationIssue[] = [];
  const warnings: ConcertRegistryValidationIssue[] = [];
  const stableKeys = new Map<string, number>();
  const providerChannels = new Map<string, number>();

  let enabledCount = 0;
  let disabledCount = 0;
  let importEnabledCount = 0;
  const byProviderType: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  const byAuthorization: Record<string, number> = {};
  const byEmbedPolicy: Record<string, number> = {};

  sources.forEach((source, index) => {
    const normalized = normalizeConcertSourceSeed(source);
    const result = validateConcertSourceRecord(source);
    errors.push(...result.errors);
    warnings.push(...result.warnings);

    const prevKey = stableKeys.get(normalized.stableKey);
    if (prevKey != null) {
      errors.push({
        stableKey: normalized.stableKey,
        field: "stableKey",
        message: `Duplicate stable key (also at index ${prevKey})`,
      });
    } else {
      stableKeys.set(normalized.stableKey, index);
    }

    if (normalized.providerChannelId) {
      const channelKey = `${normalized.provider}:${normalized.providerChannelId}`;
      const prevChannel = providerChannels.get(channelKey);
      if (prevChannel != null) {
        errors.push({
          stableKey: normalized.stableKey,
          field: "providerChannelId",
          message: `Duplicate provider channel ID ${channelKey} (also at index ${prevChannel})`,
        });
      } else {
        providerChannels.set(channelKey, index);
      }
    }

    if (normalized.enabled) enabledCount += 1;
    else disabledCount += 1;
    if (normalized.importEnabled) importEnabledCount += 1;

    byProviderType[normalized.providerType] =
      (byProviderType[normalized.providerType] || 0) + 1;
    byCountry[normalized.countryCode] = (byCountry[normalized.countryCode] || 0) + 1;
    byAuthorization[normalized.authorizationBasis] =
      (byAuthorization[normalized.authorizationBasis] || 0) + 1;
    byEmbedPolicy[normalized.embedPolicy] =
      (byEmbedPolicy[normalized.embedPolicy] || 0) + 1;
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    enabledCount,
    disabledCount,
    importEnabledCount,
    byProviderType,
    byCountry,
    byAuthorization,
    byEmbedPolicy,
  };
}
