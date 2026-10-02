export type Period = "today" | "7d" | "30d" | "all";
export type Platform = "android" | "windows" | "macos" | "linux" | "ios" | "web" | "fire" | "unknown";
export type ShareActionName = "share_open" | "share_copy_link" | "share_native" | "share_whatsapp" | "share_facebook" | "share_x" | "share_telegram" | "share_email" | "share_sms" | "share_qr_view" | "share_qr_download";
export type ShareEventName = ShareActionName | "install_link_open" | "share_link_open";
export type ShareSource = "download_center" | "install_landing" | "share" | "unknown";
export type WebsiteEventName = "page_view" | "cta_click" | "command_copy" | ShareEventName;
export type EvidenceMetric = "artifact_request" | "delivered_bytes" | "confirmed_delivery";
export type Metric = WebsiteEventName | EvidenceMetric;

/** Phase A intentionally has no visitor, installation, account or playback identity. */
export type DistributionEvent = {
  id: string;
  name: WebsiteEventName;
  occurred_at: string;
  platform: Platform;
  channel: string;
  version: string | null;
  campaign: string | null;
  referrer: string | null;
  /** Present only on new share/install-link observations; no recipient identity. */
  share_source?: ShareSource;
};
export type AnalyticsEvent = DistributionEvent;
export type IngestResult = { accepted: number; duplicates: number };
export type Breakdown = { key: string; source: string; metric: string; value: number };
export type Source = {
  id: string;
  label: string;
  freshness: string;
  from: string | null;
  to: string | null;
  note: string;
};
export type DistributionSummary = {
  generatedAt: string;
  period: Period;
  range: { from: string; to: string };
  previous: { from: string; to: string } | null;
  totals: Record<Metric, number | null>;
  metricCoverage: Record<Metric, { complete: boolean; note: string }>;
  changes: Partial<Record<Metric, number | null>>;
  trend: Array<{ date: string; page_view: number | null; cta_click: number | null; artifact_request: number | null }>;
  breakdowns: { platform: Breakdown[]; channel: Breakdown[]; country: Breakdown[]; campaign: Breakdown[]; version: Breakdown[] };
  sources: Source[];
};
export type Summary = DistributionSummary;

/** Trusted operator import only; never accept through public event ingestion.
 * Every document completely replaces its UTC dates for its one evidence source.
 * Coverage is inclusive from / exclusive to. Rows contain only observed evidence.
 * All metrics declared in `metrics` must be included in each replacement snapshot;
 * an absent row means zero for that metric only inside the stated coverage.
 */
export type EvidenceImport = {
  schemaVersion: 1;
  evidenceId: string;
  source: { id: string; label: string; freshness: string; note: string };
  coverage: { from: string; to: string };
  metrics: EvidenceMetric[];
  rows: Array<{
    date: string;
    platform: Platform;
    channel: string;
    country: string;
    version: string | null;
    campaign: string | null;
    metric: EvidenceMetric;
    value: number;
  }>;
};
export type ImportResult = { imported: number; duplicate: boolean; source: string };
