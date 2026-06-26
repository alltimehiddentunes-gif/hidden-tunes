import { isMatureDiscoveryDiagnosticsEnabled } from "./devDiagnostics";

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

export function logMatureRadioCategoryAudit(counts: MatureRadioAuditCounts) {
  logMatureDiscovery("mature_radio_category_audit", counts);
}

export function logMatureDiscoveryWeakCategory(
  categoryId: string,
  count: number,
  threshold: number
) {
  if (count >= threshold) return;
  logMatureDiscovery("mature_weak_category", { kind: "radio", categoryId, count, threshold });
}

export function logMatureInventoryAuditSummary(
  summary: Record<string, string | number | boolean | string[]>
) {
  logMatureDiscovery("mature_radio_inventory_summary", summary);
}
