import type { TvGrowthCandidate } from "@/lib/tvStationHealth";

export type TvExpansionSourceStatus =
  | "active"
  | "temporarily_failed"
  | "rate_limited"
  | "exhausted"
  | "disabled_for_safety";

export type TvExpansionSourceCursor = {
  source: string;
  cursor: string;
  page: number;
  processed: number;
  accepted: number;
  rejected: number;
  exhausted: boolean;
  status: TvExpansionSourceStatus;
  lastError: string | null;
  processedFixedIds?: string[];
};

export type TvExpansionSourceDiscoveryStats = {
  discovered: number;
  preRejected: number;
  fingerprintSkipped: number;
  unsupported: number;
  error?: string;
};

export type TvExpansionSourceDiscoveryResult = {
  candidates: TvGrowthCandidate[];
  nextCursor: TvExpansionSourceCursor;
  stats: TvExpansionSourceDiscoveryStats;
};

export type TvExpansionSourceAdapterContext = {
  limit: number;
  cursor: TvExpansionSourceCursor;
  batchNumber: number;
};

export type TvExpansionSourceAdapter = {
  id: string;
  label: string;
  legalBasis: string;
  discover: (ctx: TvExpansionSourceAdapterContext) => Promise<TvExpansionSourceDiscoveryResult>;
};

export type TvExpansionLegalCandidateMeta = {
  provider: string;
  officialPage?: string | null;
  officialStationId?: string | null;
  country?: string | null;
  language?: string | null;
  category?: string | null;
  legalBasis: string;
  discoveredAt: string;
};

export function attachLegalCandidateMeta(
  candidate: TvGrowthCandidate,
  meta: TvExpansionLegalCandidateMeta
): TvGrowthCandidate {
  const tagPrefix = `expansion:${meta.provider}`;
  const tags = [...new Set([...(candidate.tags || []), tagPrefix, ...(meta.category ? [meta.category] : [])])];
  const metaNote = [
    `Provider: ${meta.provider}`,
    meta.officialPage ? `Official: ${meta.officialPage}` : null,
    meta.officialStationId ? `Station ID: ${meta.officialStationId}` : null,
    `Legal basis: ${meta.legalBasis}`,
    `Discovered: ${meta.discoveredAt}`,
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    ...candidate,
    tags,
    description: candidate.description ? `${candidate.description} | ${metaNote}` : metaNote,
    country: candidate.country || meta.country || null,
    region: candidate.region || meta.country || null,
    language: candidate.language || meta.language || null,
    category: candidate.category || meta.category || null,
  };
}

export function createInitialSourceCursor(source: string): TvExpansionSourceCursor {
  return {
    source,
    cursor: "0",
    page: 0,
    processed: 0,
    accepted: 0,
    rejected: 0,
    exhausted: false,
    status: "active",
    lastError: null,
    processedFixedIds: [],
  };
}
