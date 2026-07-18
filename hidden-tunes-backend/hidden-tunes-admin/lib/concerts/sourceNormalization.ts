import type { ConcertSourceSeed } from "./types";
import { normalizeOfficialWebsiteUrl } from "./providers/officialWebsite";
import {
  isValidYouTubeChannelId,
  normalizeYouTubeChannelUrl,
} from "./providers/youtubeOfficial";

export function normalizeConcertStableKey(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isValidConcertStableKey(input: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(input || "").trim());
}

export function normalizeCountryCode(input: string): string | null {
  const code = String(input || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

export function normalizeLanguageCode(input: string): string | null {
  const code = String(input || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(code)) return null;
  return code;
}

export function normalizeReliabilityScore(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 100) return null;
  return rounded;
}

export function normalizeConcertSourceSeed(source: ConcertSourceSeed): ConcertSourceSeed {
  const officialUrl = normalizeOfficialWebsiteUrl(source.officialUrl) || source.officialUrl;
  const ownershipEvidenceUrl =
    normalizeOfficialWebsiteUrl(source.ownershipEvidenceUrl) || source.ownershipEvidenceUrl;
  const termsUrl = source.termsUrl
    ? normalizeOfficialWebsiteUrl(source.termsUrl) || source.termsUrl
    : null;

  let mediaChannelUrl = source.mediaChannelUrl;
  let providerChannelId = source.providerChannelId;

  if (source.provider === "youtube") {
    mediaChannelUrl =
      normalizeYouTubeChannelUrl(source.mediaChannelUrl) || source.mediaChannelUrl;
    if (providerChannelId && !isValidYouTubeChannelId(providerChannelId)) {
      providerChannelId = null;
    }
  } else {
    mediaChannelUrl =
      normalizeOfficialWebsiteUrl(source.mediaChannelUrl) || source.mediaChannelUrl;
  }

  return {
    ...source,
    stableKey: normalizeConcertStableKey(source.stableKey),
    name: source.name.trim(),
    officialUrl,
    mediaChannelUrl,
    providerChannelId: providerChannelId ? providerChannelId.trim() : null,
    countryCode: normalizeCountryCode(source.countryCode) || source.countryCode,
    region: source.region?.trim() || null,
    languageCodes: source.languageCodes
      .map((code) => normalizeLanguageCode(code))
      .filter((code): code is string => Boolean(code)),
    sourceOwner: source.sourceOwner.trim(),
    ownershipEvidenceUrl,
    termsUrl,
    contentScope: source.contentScope.trim(),
    supportedCountries: source.supportedCountries
      .map((code) => normalizeCountryCode(code))
      .filter((code): code is string => Boolean(code)),
    reviewNotes: source.reviewNotes.trim(),
    reliabilityScore:
      normalizeReliabilityScore(source.reliabilityScore) ?? source.reliabilityScore,
  };
}
