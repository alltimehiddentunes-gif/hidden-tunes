"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getActiveUploaderSession } from "@/lib/auth";
import type { Period } from "@/lib/distribution/types";
import type { MicrosoftStoreMetric, MicrosoftStoreSummary } from "@/lib/distribution/microsoftStoreTypes";

const ENDPOINT = "/api/admin/distribution/microsoft-store";
const APPLICATION_ID = "9N9XGSTD8889";
const MAX_IMPORT_BYTES = 2_000_000;
const METRICS: MicrosoftStoreMetric[] = ["store_acquisitions", "store_installs"];
const SOURCE_LABELS: Record<string, string> = {
  microsoft_api: "Microsoft Store analytics API",
  microsoft_report: "Microsoft Partner Center report",
  "microsoft_api + microsoft_report": "Microsoft Store analytics API + Partner Center report",
};
const LABELS: Record<MicrosoftStoreMetric, string> = {
  store_acquisitions: "Store acquisitions",
  store_installs: "Store installs",
};
type PanelState = { period: Period; data: MicrosoftStoreSummary | null; loading: boolean; error: string };
export type MicrosoftStorePanelProps = { period: Period; onSummary?: (summary: MicrosoftStoreSummary | null) => void };

class PanelError extends Error {}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function nullableText(value: unknown, limit = 512) { return value === null || typeof value === "string" && value.length <= limit; }
function nullableCount(value: unknown) { return value === null || typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function dateText(value: unknown) { return typeof value === "string" && value.length <= 64 && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value)); }
function nullableDate(value: unknown) { return value === null || dateText(value); }
function validSummary(value: unknown): value is MicrosoftStoreSummary {
  if (!record(value) || value.applicationId !== APPLICATION_ID || value.channel !== "microsoft_store"
    || !["NOT_CONNECTED", "MANUAL_IMPORT", "DAILY_IMPORT"].includes(String(value.status)) || typeof value.configured !== "boolean"
    || !["today", "7d", "30d", "all"].includes(String(value.period)) || !record(value.range)
    || !dateText(value.range.from) || !dateText(value.range.to) || !record(value.metrics)
    || typeof value.note !== "string" || value.note.length > 4096) return false;
  for (const name of METRICS) {
    const metric = value.metrics[name];
    if (!record(metric) || !nullableCount(metric.value)
      || !(metric.change === null || typeof metric.change === "number" && Number.isFinite(metric.change))
      || !record(metric.coverage) || !nullableDate(metric.coverage.from) || !nullableDate(metric.coverage.to)
      || typeof metric.coverage.complete !== "boolean" || !nullableDate(metric.importedAt)
      || !nullableText(metric.providerFreshness)
      || !(metric.source === null || typeof metric.source === "string" && Object.hasOwn(SOURCE_LABELS, metric.source))) return false;
  }
  return Array.isArray(value.trend) && value.trend.length <= 10000 && value.trend.every(row => record(row) && dateText(row.date) && nullableCount(row.store_acquisitions) && nullableCount(row.store_installs))
    && Array.isArray(value.countries) && value.countries.length <= 10000 && value.countries.every(row => record(row) && typeof row.country === "string" && /^[A-Z]{2}$/.test(row.country) && nullableCount(row.store_acquisitions) && nullableCount(row.store_installs))
    && Array.isArray(value.versions) && value.versions.length <= 10000 && value.versions.every(row => record(row) && typeof row.version === "string" && row.version.length <= 128 && typeof row.store_installs === "number" && nullableCount(row.store_installs));
}
function formatCount(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : "N/A"; }
function sourceLabel(source: string | null | undefined) { return source ? SOURCE_LABELS[source] || "Unknown source" : "Microsoft Store report/API · unavailable"; }
function importTime(value: string | null | undefined) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0, 19).replace("T", " ") + " UTC" : "Not imported"; }
function apiFailure(status: number, importing = false) {
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "Your account does not have permission for this Microsoft Store operation.";
  if (status === 429) return "Please wait before trying this operation again.";
  if (status === 413) return "The report exceeds the permitted upload size.";
  if (importing && (status === 400 || status === 409 || status === 422)) return "The report was not accepted. Check its canonical schema, application ID, source and coverage against the Microsoft report.";
  return importing ? "The import could not be confirmed. Refresh before retrying; the report may have been accepted." : "Microsoft Store measurements are temporarily unavailable. Please retry.";
}

export function MicrosoftStorePanel({ period, onSummary }: MicrosoftStorePanelProps) {
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
        setState({ period, data: null, loading: false, error: "Microsoft Store measurements took too long to load. Please retry." });
        callback.current?.(null);
      }
    }, 20000);
    const timer = window.setTimeout(() => {
      setState({ period, data: null, loading: true, error: "" });
      callback.current?.(null);
      async function load() {
        try {
          const { session } = await getActiveUploaderSession();
          if (!session) throw new PanelError("Sign in with an owner or admin account to view Microsoft Store measurements.");
          if (!active || controller.signal.aborted) return;
          const response = await fetch(`${ENDPOINT}?period=${encodeURIComponent(period)}`, {
            headers: { Authorization: `Bearer ${session.access_token}` }, credentials: "omit", cache: "no-store", signal: controller.signal,
          });
          if (!response.ok) throw new PanelError(apiFailure(response.status));
          const result: unknown = await response.json();
          if (!validSummary(result) || result.period !== period) throw new PanelError("Microsoft Store measurements returned an incomplete or mismatched response. Please retry.");
          if (active && !controller.signal.aborted) {
            setState({ period, data: result, loading: false, error: "" });
            callback.current?.(result);
          }
        } catch (error) {
          if (active && !timedOut) {
            setState({ period, data: null, loading: false, error: error instanceof PanelError ? error.message : "Could not load Microsoft Store measurements. Please retry." });
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
    if (!file || !/\.json$/i.test(file.name)) { setImportError("Choose a canonical Microsoft report JSON file."); return; }
    if (file.size > MAX_IMPORT_BYTES) { setImportError("Choose a JSON file no larger than 2 MB."); return; }
    setImporting(true);
    const controller = new AbortController();
    uploadController.current = controller;
    let submitted = false;
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      let document: unknown;
      const contents = await file.text();
      try { document = JSON.parse(contents); } catch { throw new PanelError("This file is not valid JSON. Raw CSV and Excel exports must first be mapped to the canonical Microsoft report format."); }
      if (!record(document) || document.schemaVersion !== 1 || document.applicationId !== APPLICATION_ID
        || document.source !== "microsoft_report" || !METRICS.includes(document.metric as MicrosoftStoreMetric)
        || !record(document.coverage) || !Array.isArray(document.rows)) throw new PanelError("Choose canonical JSON mapped from an actual Microsoft report, with source microsoft_report and application ID 9N9XGSTD8889.");
      const { session } = await getActiveUploaderSession();
      if (!session) throw new PanelError("Sign in with an authorized account before importing a Microsoft report.");
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
  const acquisitions = data?.metrics.store_acquisitions;
  const installs = data?.metrics.store_installs;
  const trend = data?.trend.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-31) || [];
  const countries = data?.countries.slice(0, 31) || [];
  const versions = data?.versions.slice(0, 31) || [];

  return <section id="microsoft-store" className="dist-panel" aria-labelledby="microsoft-store-title" aria-busy={loading}>
    <div className="dist-section-heading"><div className="dist-toolbar"><h2 id="microsoft-store-title">Microsoft Store</h2><span className="dist-badge">{status}</span><button type="button" className="dist-refresh" onClick={() => setRevision(value => value + 1)} disabled={loading}>Refresh Store data</button></div>
      <p>License acquisitions and successful Store installs, including reinstalls. These measurements do not establish first app launches, active people or listening time.</p></div>
    <p className="dist-source">Application: {APPLICATION_ID} · {data ? `Selected report period: ${data.range.from} → ${data.range.to}` : "Report period unavailable"}</p>
    <p className="dist-source">{data ? data.configured ? "Server credentials are present. This flag does not verify authorization or a working API connection." : "Server credentials are not configured (MICROSOFT_STORE_TENANT_ID / CLIENT_ID / CLIENT_SECRET). Manual Microsoft report imports remain available." : "API configuration has not been verified."}</p>
    {!loading && data && !data.configured && data.status === "NOT_CONNECTED" && <div className="dist-warning" role="status"><p>No Microsoft Store acquisitions or installs are stored yet. Configure Partner Center API credentials on the admin server and run scripts/sync-microsoft-store.ts, or import canonical JSON below. N/A does not mean zero downloads.</p></div>}
    <p className="dist-load-status" aria-live="polite">{loading ? "Loading Microsoft Store evidence…" : data ? data.note : "Microsoft Store measurements are unavailable; N/A does not mean zero."}</p>
    {state.period === period && state.error && <div className="dist-warning" role="alert"><p>{state.error}</p></div>}
    <div className="dist-small-kpis">
      {METRICS.map(name => {
        const metric = data?.metrics[name];
        return <article className="dist-metric" key={name}><h3>{LABELS[name]}</h3><strong>{formatCount(metric?.value)}</strong>
          <p className="dist-source">Source: {sourceLabel(metric?.source)}</p>
          <p>{name === "store_acquisitions" ? "Licenses acquired through Microsoft Store." : "Successful Store installations; may include reinstallations."}</p>
          <p>Coverage: {metric?.coverage.from || "N/A"} → {metric?.coverage.to || "N/A"} · {metric?.coverage.complete ? "Complete selected period" : "Partial or unavailable coverage"}</p>
          <p>Imported: {importTime(metric?.importedAt)}</p>
          <p>Provider freshness, as supplied: {metric?.providerFreshness || "Not supplied"}</p>
          <p className="dist-comparison">{typeof metric?.change === "number" ? `${metric.change > 0 ? "+" : ""}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(metric.change)}% vs previous comparable period` : "Change: N/A · comparable coverage unavailable"}</p>
        </article>;
      })}
    </div>
    <p className="dist-footnote">Provider freshness is preserved as reported; an unspecified time zone remains unspecified. Import time records when Hidden Tunes received the evidence. Tables show up to 31 rows; period totals use all available evidence.</p>
    <div className="dist-table-scroll" role="region" aria-label="Microsoft Store daily trend" tabIndex={0}><table><caption>Daily Store trend · latest 31 reported dates</caption><thead><tr><th scope="col">Date</th><th scope="col">License acquisitions</th><th scope="col">Store installs</th></tr></thead><tbody>
      {trend.length ? trend.map(row => <tr key={row.date}><th scope="row">{row.date}</th><td>{formatCount(row.store_acquisitions)}</td><td>{formatCount(row.store_installs)}</td></tr>) : <tr><td colSpan={3}>No imported daily evidence for this period.</td></tr>}
    </tbody></table></div>
    <div className="dist-table-scroll" role="region" aria-label="Microsoft Store country measurements" tabIndex={0}><table><caption>Countries · up to 31 reported rows</caption><thead><tr><th scope="col">Country</th><th scope="col">License acquisitions</th><th scope="col">Store installs</th></tr></thead><tbody>
      {countries.length ? countries.map(row => <tr key={row.country}><th scope="row">{row.country === "ZZ" ? "Unknown" : row.country}</th><td>{formatCount(row.store_acquisitions)}</td><td>{formatCount(row.store_installs)}</td></tr>) : <tr><td colSpan={3}>No imported country evidence for this period.</td></tr>}
    </tbody></table></div>
    <p className="dist-source">Acquisition columns source: {sourceLabel(acquisitions?.source)}. Install columns source: {sourceLabel(installs?.source)}.</p>
    <div className="dist-table-scroll" role="region" aria-label="Microsoft Store installed versions" tabIndex={0}><table><caption>Installed versions · up to 31 reported rows</caption><thead><tr><th scope="col">Version</th><th scope="col">Store installs</th><th scope="col">Source</th></tr></thead><tbody>
      {versions.length ? versions.map(row => <tr key={row.version}><th scope="row">{row.version || "Unknown"}</th><td>{formatCount(row.store_installs)}</td><td>{sourceLabel(installs?.source)}</td></tr>) : <tr><td colSpan={3}>No imported installed-version evidence for this period.</td></tr>}
    </tbody></table></div>
    <details className="dist-details"><summary>Import a Microsoft report or configure API access</summary>
      <p className="dist-source">API setup requires a Partner Center account linked to a Microsoft Entra application. Configure its credentials on the server only; this panel never requests or displays them.</p>
      <p className="dist-source">Use an actual Microsoft acquisition or installation report. CSV and Excel exports need their report columns verified and mapped to the supported JSON format before import. Import each measurement separately and include its reporting dates. Never upload estimates, credentials or personal records.</p>
      <form onSubmit={submitImport}><label className="dist-source">Mapped Microsoft report JSON · maximum 2 MB<input type="file" accept=".json,application/json" disabled={importing} onChange={event => { setSelectedFile(event.target.files?.[0] || null); setImportMessage(""); setImportError(""); }} /></label>
        <button type="submit" className="dist-refresh" disabled={importing || !selectedFile}>{importing ? "Importing report…" : "Import report"}</button>
      </form>
      <p className="dist-source" role="status">{importMessage}</p>{importError && <p className="dist-warning" role="alert">{importError}</p>}
    </details>
  </section>;
}

export default MicrosoftStorePanel;
