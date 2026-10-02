"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getActiveUploaderSession } from "@/lib/auth";
import type { Period } from "@/lib/distribution/types";
import type { AppleAppStoreMetric, AppleAppStoreSummary } from "@/lib/distribution/appleAppStoreTypes";

const ENDPOINT = "/api/admin/distribution/apple-app-store";
const APPLE_ID = "6773324462";
const APP_NAME = "Hidden Tunes";
const MAX_IMPORT_BYTES = 2_000_000;
const METRICS: AppleAppStoreMetric[] = ["store_units", "store_updates"];
const SOURCE_LABELS: Record<string, string> = {
  apple_api: "App Store Connect Sales API",
  apple_report: "App Store Connect Sales report",
  "apple_api + apple_report": "App Store Connect Sales API + report",
};
const LABELS: Record<AppleAppStoreMetric, string> = {
  store_units: "App units (downloads)",
  store_updates: "App updates",
};
type PanelState = { period: Period; data: AppleAppStoreSummary | null; loading: boolean; error: string };
export type AppleAppStorePanelProps = { period: Period; onSummary?: (summary: AppleAppStoreSummary | null) => void };

class PanelError extends Error {}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function nullableText(value: unknown, limit = 512) { return value === null || typeof value === "string" && value.length <= limit; }
function nullableCount(value: unknown) { return value === null || typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function dateText(value: unknown) { return typeof value === "string" && value.length <= 64 && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value)); }
function nullableDate(value: unknown) { return value === null || dateText(value); }
function validSummary(value: unknown): value is AppleAppStoreSummary {
  if (!record(value) || value.appleId !== APPLE_ID || value.appName !== APP_NAME || value.channel !== "apple_app_store"
    || !["NOT_CONNECTED", "MANUAL_IMPORT", "DAILY_IMPORT"].includes(String(value.status)) || typeof value.configured !== "boolean"
    || !["today", "7d", "30d", "all"].includes(String(value.period)) || !record(value.range)
    || !dateText(value.range.from) || !dateText(value.range.to) || !record(value.metrics)
    || !Array.isArray(value.unavailable) || typeof value.note !== "string" || value.note.length > 4096) return false;
  for (const name of METRICS) {
    const metric = value.metrics[name];
    if (!record(metric) || !nullableCount(metric.value)
      || !(metric.change === null || typeof metric.change === "number" && Number.isFinite(metric.change))
      || !record(metric.coverage) || !nullableDate(metric.coverage.from) || !nullableDate(metric.coverage.to)
      || typeof metric.coverage.complete !== "boolean" || !nullableDate(metric.importedAt)
      || !nullableText(metric.providerFreshness)
      || !(metric.source === null || typeof metric.source === "string" && Object.hasOwn(SOURCE_LABELS, metric.source))) return false;
  }
  return Array.isArray(value.trend) && value.trend.length <= 10000 && value.trend.every(row => record(row) && dateText(row.date) && nullableCount(row.store_units) && nullableCount(row.store_updates))
    && Array.isArray(value.countries) && value.countries.length <= 10000 && value.countries.every(row => record(row) && typeof row.country === "string" && /^[A-Z]{2}$/.test(row.country) && nullableCount(row.store_units) && nullableCount(row.store_updates))
    && Array.isArray(value.versions) && value.versions.length <= 10000 && value.versions.every(row => record(row) && typeof row.version === "string" && row.version.length <= 128 && typeof row.store_units === "number" && typeof row.store_updates === "number");
}
function formatCount(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : "N/A"; }
function sourceLabel(source: string | null | undefined) { return source ? SOURCE_LABELS[source] || "Unknown source" : "App Store Connect · unavailable"; }
function importTime(value: string | null | undefined) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0, 19).replace("T", " ") + " UTC" : "Not imported"; }
function apiFailure(status: number, importing = false) {
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "Your account does not have permission for this Apple App Store operation.";
  if (status === 429) return "Please wait before trying this operation again.";
  if (status === 413) return "The report exceeds the permitted upload size.";
  if (importing && (status === 400 || status === 409 || status === 422)) return "The report was not accepted. Check its canonical schema, Apple ID, source and coverage.";
  return importing ? "The import could not be confirmed. Refresh before retrying; the report may have been accepted." : "Apple App Store measurements are temporarily unavailable. Please retry.";
}

export function AppleAppStorePanel({ period, onSummary }: AppleAppStorePanelProps) {
  const [state, setState] = useState<PanelState>({ period, data: null, loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const callback = useRef(onSummary);
  const mounted = useRef(false);
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => { callback.current = onSummary; }, [onSummary]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; uploadController.current?.abort(); };
  }, []);

  useEffect(() => {
    let active = true;
    let timedOut = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (active) {
        setState({ period, data: null, loading: false, error: "Apple App Store measurements took too long to load. Please retry." });
        callback.current?.(null);
      }
    }, 20000);
    const timer = window.setTimeout(() => {
      setState({ period, data: null, loading: true, error: "" });
      callback.current?.(null);
      async function load() {
        try {
          const { session } = await getActiveUploaderSession();
          if (!session) throw new PanelError("Sign in with an owner or admin account to view Apple App Store measurements.");
          if (!active || controller.signal.aborted) return;
          const response = await fetch(`${ENDPOINT}?period=${encodeURIComponent(period)}`, {
            headers: { Authorization: `Bearer ${session.access_token}` }, credentials: "omit", cache: "no-store", signal: controller.signal,
          });
          if (!response.ok) throw new PanelError(apiFailure(response.status));
          const result: unknown = await response.json();
          if (!validSummary(result) || result.period !== period) throw new PanelError("Apple App Store measurements returned an incomplete or mismatched response. Please retry.");
          if (active && !controller.signal.aborted) {
            setState({ period, data: result, loading: false, error: "" });
            callback.current?.(result);
          }
        } catch (error) {
          if (active && !timedOut) {
            setState({ period, data: null, loading: false, error: error instanceof PanelError ? error.message : "Could not load Apple App Store measurements. Please retry." });
            callback.current?.(null);
          }
        } finally { window.clearTimeout(timeout); }
      }
      void load();
    }, 0);
    return () => { active = false; window.clearTimeout(timer); window.clearTimeout(timeout); controller.abort(); };
  }, [period, revision]);

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (importing) return;
    setImportError(""); setImportMessage("");
    const file = selectedFile;
    if (!file || !/\.json$/i.test(file.name)) { setImportError("Choose a canonical Apple report JSON file."); return; }
    if (file.size > MAX_IMPORT_BYTES) { setImportError("Choose a JSON file no larger than 2 MB."); return; }
    setImporting(true);
    const controller = new AbortController();
    uploadController.current = controller;
    let submitted = false;
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      let document: unknown;
      const contents = await file.text();
      try { document = JSON.parse(contents); } catch { throw new PanelError("This file is not valid JSON. Raw Sales TSV/CSV exports must first be mapped to the canonical Apple report format."); }
      if (!record(document) || document.schemaVersion !== 1 || document.appleId !== APPLE_ID
        || document.source !== "apple_report" || !METRICS.includes(document.metric as AppleAppStoreMetric)
        || !record(document.coverage) || !Array.isArray(document.rows)) throw new PanelError("Choose canonical JSON mapped from an actual App Store Connect Sales report, with source apple_report and Apple ID 6773324462.");
      const { session } = await getActiveUploaderSession();
      if (!session) throw new PanelError("Sign in with an authorized account before importing an Apple report.");
      if (controller.signal.aborted) throw new PanelError("The import timed out before it was sent. Please try again.");
      submitted = true;
      const response = await fetch(ENDPOINT, {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        credentials: "omit", body: contents, signal: controller.signal,
      });
      if (!response.ok) throw new PanelError(apiFailure(response.status, true));
      if (mounted.current && !controller.signal.aborted) {
        setImportMessage("Report accepted. Reloading the selected period from stored evidence.");
        setSelectedFile(null);
        setRevision(value => value + 1);
      }
    } catch (error) {
      if (mounted.current) setImportError(controller.signal.aborted && submitted
        ? "The import response was interrupted. Refresh before retrying; the report may have been accepted."
        : error instanceof PanelError ? error.message : "The report could not be imported. Check the JSON file and try again.");
    } finally {
      window.clearTimeout(timeout);
      if (uploadController.current === controller) uploadController.current = null;
      if (mounted.current) setImporting(false);
    }
  }

  const data = state.period === period ? state.data : null;
  const loading = state.period !== period || state.loading;
  const status = data?.status.replaceAll("_", " ") || "NOT AVAILABLE";
  const units = data?.metrics.store_units;
  const updates = data?.metrics.store_updates;
  const trend = data?.trend.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-31) || [];
  const countries = data?.countries.slice(0, 31) || [];
  const versions = data?.versions.slice(0, 31) || [];

  return <section id="apple-app-store" className="dist-panel" aria-labelledby="apple-app-store-title" aria-busy={loading}>
    <div className="dist-section-heading"><div className="dist-toolbar"><h2 id="apple-app-store-title">Apple App Store</h2><span className="dist-badge">{status}</span><button type="button" className="dist-refresh" onClick={() => setRevision(value => value + 1)} disabled={loading}>Refresh Apple data</button></div>
      <p>{APP_NAME} · Apple App Store · Apple ID {APPLE_ID}. Units and updates come from App Store Connect Sales reports. They are not Microsoft installs, artifact requests or first launches.</p></div>
    <p className="dist-source">Apple ID: {APPLE_ID} · {data ? `Selected report period: ${data.range.from} → ${data.range.to}` : "Report period unavailable"}</p>
    <p className="dist-source">{data ? data.configured ? "Server App Store Connect credentials are present. This flag does not verify authorization or a working API connection." : "Server App Store Connect credentials are not configured. Manual Sales report imports remain available." : "API configuration has not been verified."}</p>
    {!loading && data && !data.configured && data.status === "NOT_CONNECTED" && <div className="dist-warning" role="status"><p>No Apple Sales evidence is stored yet. Configure APPLE_ASC_ISSUER_ID, APPLE_ASC_KEY_ID, APPLE_ASC_VENDOR_NUMBER and a server-side .p8 key, then run the operator sync — or import canonical JSON. N/A does not mean zero downloads.</p></div>}
    <p className="dist-load-status" aria-live="polite">{loading ? "Loading Apple App Store evidence…" : data ? data.note : "Apple App Store measurements are unavailable; N/A does not mean zero."}</p>
    {state.period === period && state.error && <div className="dist-warning" role="alert"><p>{state.error}</p></div>}
    <div className="dist-small-kpis">
      {METRICS.map(name => {
        const metric = data?.metrics[name];
        return <article className="dist-metric" key={name}><h3>{LABELS[name]}</h3><strong>{formatCount(metric?.value)}</strong>
          <p className="dist-source">Source: {sourceLabel(metric?.source)}</p>
          <p>{name === "store_units" ? "Sales report units for first-time app downloads (product types 1/1F/1T)." : "Sales report units for app updates (product types 7/7F/7T)."}</p>
          <p>Coverage: {metric?.coverage.from || "N/A"} → {metric?.coverage.to || "N/A"} · {metric?.coverage.complete ? "Complete selected period" : "Partial or unavailable coverage"}</p>
          <p>Imported: {importTime(metric?.importedAt)}</p>
          <p>Provider freshness, as supplied: {metric?.providerFreshness || "Not supplied"}</p>
          <p className="dist-comparison">{typeof metric?.change === "number" ? `${metric.change > 0 ? "+" : ""}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(metric.change)}% vs previous comparable period` : "Change: N/A · comparable coverage unavailable"}</p>
        </article>;
      })}
    </div>
    <p className="dist-footnote">Unavailable from this Sales source (shown as N/A elsewhere): {(data?.unavailable || ["sessions", "crashes", "active_devices", "acquisition_source", "proceeds_converted"]).join(", ")}.</p>
    <div className="dist-table-scroll" role="region" aria-label="Apple App Store daily trend" tabIndex={0}><table><caption>Daily Apple trend · latest 31 reported dates</caption><thead><tr><th scope="col">Date</th><th scope="col">Units</th><th scope="col">Updates</th></tr></thead><tbody>
      {trend.length ? trend.map(row => <tr key={row.date}><th scope="row">{row.date}</th><td>{formatCount(row.store_units)}</td><td>{formatCount(row.store_updates)}</td></tr>) : <tr><td colSpan={3}>No imported daily evidence for this period.</td></tr>}
    </tbody></table></div>
    <div className="dist-table-scroll" role="region" aria-label="Apple App Store territory measurements" tabIndex={0}><table><caption>Territories · up to 31 reported rows</caption><thead><tr><th scope="col">Territory</th><th scope="col">Units</th><th scope="col">Updates</th></tr></thead><tbody>
      {countries.length ? countries.map(row => <tr key={row.country}><th scope="row">{row.country === "ZZ" ? "Unknown" : row.country}</th><td>{formatCount(row.store_units)}</td><td>{formatCount(row.store_updates)}</td></tr>) : <tr><td colSpan={3}>No imported territory evidence for this period.</td></tr>}
    </tbody></table></div>
    <p className="dist-source">Units source: {sourceLabel(units?.source)}. Updates source: {sourceLabel(updates?.source)}.</p>
    <div className="dist-table-scroll" role="region" aria-label="Apple App Store versions" tabIndex={0}><table><caption>Versions · up to 31 reported rows</caption><thead><tr><th scope="col">Version</th><th scope="col">Units</th><th scope="col">Updates</th></tr></thead><tbody>
      {versions.length ? versions.map(row => <tr key={row.version}><th scope="row">{row.version || "Unknown"}</th><td>{formatCount(row.store_units)}</td><td>{formatCount(row.store_updates)}</td></tr>) : <tr><td colSpan={3}>No imported version evidence for this period.</td></tr>}
    </tbody></table></div>
    <details className="dist-details"><summary>Import an Apple Sales report or configure App Store Connect API access</summary>
      <p className="dist-source">API setup requires an App Store Connect API key with Sales access. Configure issuer ID, key ID, vendor number and the .p8 private key on the server only. This panel never requests or displays them.</p>
      <p className="dist-source">Map an actual Sales SUMMARY report for Apple ID {APPLE_ID} into the supported JSON format before import. Never upload estimates, credentials or personal records.</p>
      <form onSubmit={submitImport}><label className="dist-source">Mapped Apple report JSON · maximum 2 MB<input type="file" accept=".json,application/json" disabled={importing} onChange={event => { setSelectedFile(event.target.files?.[0] || null); setImportMessage(""); setImportError(""); }} /></label>
        <button type="submit" className="dist-refresh" disabled={importing || !selectedFile}>{importing ? "Importing report…" : "Import report"}</button>
      </form>
      <p className="dist-source" role="status">{importMessage}</p>{importError && <p className="dist-warning" role="alert">{importError}</p>}
    </details>
  </section>;
}

export default AppleAppStorePanel;
