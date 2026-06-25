import { isMatureDiscoveryDiagnosticsEnabled } from "./devDiagnostics";

export type MaturePodcastAuditCounts = {
  categoryId: string;
  keywordBatch?: string;
  queryTermsUsed?: string[];
  raw: number;
  afterDedupe: number;
  showsWithEpisodes?: number;
  afterQuality: number;
  playableShows: number;
  finalDisplayedCount?: number;
  first20Titles?: string[];
  source?: string;
};

export type MatureRadioAuditCounts = {
  categoryId: string;
  raw: number;
  afterDedupe: number;
  playableStreams: number;
  httpsStreams?: number;
  afterQuality: number;
  finalDisplayedCount?: number;
  first20StationNames?: string[];
};

type Details = Record<string, string | number | boolean | null | undefined | string[]>;

function shouldLog() {
  return isMatureDiscoveryDiagnosticsEnabled();
}

export function logMatureDiscovery(event: string, details: Details = {}) {
  if (!shouldLog()) return;
  console.log("[HTMatureDiscovery]", event, { at: Date.now(), ...details });
}

export function logMaturePodcastCategoryAudit(counts: MaturePodcastAuditCounts) {
  logMatureDiscovery("mature_podcast_category_audit", counts);
}

export function logMatureRadioCategoryAudit(counts: MatureRadioAuditCounts) {
  logMatureDiscovery("mature_radio_category_audit", counts);
}

export function logMatureDiscoveryWeakCategory(
  kind: "podcast" | "radio",
  categoryId: string,
  count: number,
  threshold: number
) {
  if (count >= threshold) return;
  logMatureDiscovery("mature_weak_category", { kind, categoryId, count, threshold });
}

export function logMatureInventoryAuditSummary(
  kind: "podcast" | "radio",
  summary: Record<string, string | number | boolean | string[]>
) {
  logMatureDiscovery(`mature_${kind}_inventory_summary`, summary);
}
