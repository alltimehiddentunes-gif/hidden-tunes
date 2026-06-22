import { isMatureDiscoveryDiagnosticsEnabled } from "./devDiagnostics";

export type MaturePodcastAuditCounts = {
  categoryId: string;
  keywordBatch?: string;
  raw: number;
  afterDedupe: number;
  afterQuality: number;
  playableShows: number;
  source?: string;
};

export type MatureRadioAuditCounts = {
  categoryId: string;
  raw: number;
  afterDedupe: number;
  playableStreams: number;
  afterQuality: number;
};

type Details = Record<string, string | number | boolean | null | undefined>;

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
