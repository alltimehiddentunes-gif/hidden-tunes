/** Hidden Tunes on the Apple App Store. Never treat this as interchangeable with Microsoft metrics. */
export const APPLE_APP_STORE_APPLE_ID = "6773324462" as const;
export const APPLE_APP_STORE_APP_NAME = "Hidden Tunes" as const;
export type AppleAppStoreMetric = "store_units" | "store_updates";
export type AppleAppStoreSource = "apple_api" | "apple_report";
export type AppleAppStorePeriod = "today" | "7d" | "30d" | "all";
export type AppleAppStoreImport = {
  schemaVersion: 1;
  appleId: typeof APPLE_APP_STORE_APPLE_ID;
  metric: AppleAppStoreMetric;
  source: AppleAppStoreSource;
  coverage: { from: string; to: string };
  /** Optional provider timestamp, preserved verbatim; never replaced with import time. */
  providerFreshness: string | null;
  rows: Array<{ date: string; country: string; version: string | null; value: number }>;
};
export type AppleAppStoreMetricSummary = {
  value: number | null;
  change: number | null;
  coverage: { from: string | null; to: string | null; complete: boolean };
  source: string | null;
  importedAt: string | null;
  providerFreshness: string | null;
};
export type AppleAppStoreSummary = {
  appleId: typeof APPLE_APP_STORE_APPLE_ID;
  appName: typeof APPLE_APP_STORE_APP_NAME;
  channel: "apple_app_store";
  status: "NOT_CONNECTED" | "MANUAL_IMPORT" | "DAILY_IMPORT";
  /** Presence of server-side App Store Connect settings only — not successful authorization. */
  configured: boolean;
  period: AppleAppStorePeriod;
  range: { from: string; to: string };
  metrics: Record<AppleAppStoreMetric, AppleAppStoreMetricSummary>;
  trend: Array<{ date: string; store_units: number | null; store_updates: number | null }>;
  countries: Array<{ country: string; store_units: number | null; store_updates: number | null }>;
  versions: Array<{ version: string; store_units: number; store_updates: number }>;
  unavailable: string[];
  note: string;
};
