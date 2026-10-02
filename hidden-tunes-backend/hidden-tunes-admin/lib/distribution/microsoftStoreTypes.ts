export const MICROSOFT_STORE_APPLICATION_ID = "9N9XGSTD8889" as const;
export type MicrosoftStoreMetric = "store_acquisitions" | "store_installs";
export type MicrosoftStoreSource = "microsoft_api" | "microsoft_report";
export type MicrosoftStorePeriod = "today" | "7d" | "30d" | "all";
export type MicrosoftStoreImport = {
  schemaVersion: 1;
  applicationId: typeof MICROSOFT_STORE_APPLICATION_ID;
  metric: MicrosoftStoreMetric;
  source: MicrosoftStoreSource;
  coverage: { from: string; to: string };
  /** Optional provider timestamp, preserved verbatim; never replaced with import time. */
  providerFreshness: string | null;
  rows: Array<{ date: string; country: string; version: string | null; value: number }>;
};
export type MicrosoftStoreMetricSummary = {
  value: number | null;
  change: number | null;
  coverage: { from: string | null; to: string | null; complete: boolean };
  source: string | null;
  importedAt: string | null;
  providerFreshness: string | null;
};
export type MicrosoftStoreSummary = {
  applicationId: typeof MICROSOFT_STORE_APPLICATION_ID;
  channel: "microsoft_store";
  status: "NOT_CONNECTED" | "MANUAL_IMPORT" | "DAILY_IMPORT";
  /** Only reports presence of the three server-side settings, not successful authorization. */
  configured: boolean;
  period: MicrosoftStorePeriod;
  range: { from: string; to: string };
  metrics: Record<MicrosoftStoreMetric, MicrosoftStoreMetricSummary>;
  trend: Array<{ date: string; store_acquisitions: number | null; store_installs: number | null }>;
  countries: Array<{ country: string; store_acquisitions: number | null; store_installs: number | null }>;
  versions: Array<{ version: string; store_installs: number }>;
  note: string;
};
