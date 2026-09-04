"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getActiveUploaderSession } from "@/lib/auth";
import type { RightsFilter, RightsFilterClause } from "@/lib/rights/types";

type Row = {
  id: number;
  content_type: string;
  content_id: string;
  title: string;
  creator_name: string | null;
  provider_id: string | null;
  base_rights_status: string;
  evidence_status: string;
  ios_enabled: boolean;
  source_host: string | null;
  ingested_at: string | null;
};

const inputClass = "min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-yellow-300/40";

export default function RightsContentConsole() {
  const [form, setForm] = useState({ contentType: "", providerId: "", rightsStatus: "", uploaderId: "", importBatch: "", after: "", before: "", platform: "", platformEnabled: "", territory: "", evidence: "", streamType: "", sourceHost: "", sourceActive: "", search: "" });
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [snapshot, setSnapshot] = useState<{ id: string; exact_count: number } | null>(null);
  const [selectedAll, setSelectedAll] = useState(false);
  const [action, setAction] = useState("set_rights_status:unknown");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const filter = useMemo<RightsFilter>(() => {
    const all: RightsFilterClause[] = [];
    const eq = (field: RightsFilterClause["field"], value: string) => { if (value) all.push({ field, op: "eq", value }); };
    eq("content_type", form.contentType);
    eq("provider_id", form.providerId);
    eq("rights_status", form.rightsStatus);
    eq("uploader_id", form.uploaderId);
    eq("import_batch", form.importBatch);
    if (form.after) all.push({ field: "ingested_at", op: "gte", value: new Date(`${form.after}T00:00:00.000Z`).toISOString() });
    if (form.before) all.push({ field: "ingested_at", op: "lte", value: new Date(`${form.before}T23:59:59.999Z`).toISOString() });
    if (form.platform && form.platformEnabled) all.push({ field: `platform.${form.platform}` as RightsFilterClause["field"], op: "eq", value: form.platformEnabled === "true" });
    eq("territory", form.territory);
    eq("evidence_status", form.evidence);
    eq("stream_type", form.streamType);
    eq("source_host", form.sourceHost);
    if (form.sourceActive) all.push({ field: "source_active", op: "eq", value: form.sourceActive === "true" });
    if (form.search.trim()) all.push({ field: "search", op: "search", value: form.search.trim() });
    return { version: 1, all };
  }, [form]);

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { session } = await getActiveUploaderSession();
    if (!session) throw new Error("Admin session unavailable.");
    return fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${session.access_token}` } });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setSnapshot(null);
    setSelectedAll(false);
    try {
      const params = new URLSearchParams({ filter: JSON.stringify(filter), pageSize: "100" });
      const response = await authFetch(`/api/admin/rights/content?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load rights catalog.");
      setRows(body.items ?? []);
      setCount(body.count ?? 0);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [authFetch, filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
    // Initial empty filter only; explicit Apply handles later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createSnapshot() {
    setLoading(true);
    try {
      const response = await authFetch("/api/admin/rights/filters/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filter }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to create selection.");
      setSnapshot(body.snapshot);
      setCount(body.matching);
      setSelectedAll(true);
      setMessage(`Selected all ${Number(body.matching).toLocaleString()} filtered records server-side.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function queueDryRun() {
    if (!snapshot || !selectedAll) return;
    const [type, value] = action.split(":");
    const payload = type === "set_platform"
      ? { type, platform: value, enabled: false }
      : { type, status: value };
    setLoading(true);
    try {
      const response = await authFetch("/api/admin/rights/bulk/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snapshot.id, action: payload, reason: "Owner preview in Rights Control Center", idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to queue dry run.");
      setMessage(`Dry run ${body.job.id} queued. It cannot change eligibility.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select label="Content type" value={form.contentType} onChange={update("contentType")} options={["music","radio","tv","podcast_show","podcast_episode","audiobook","lecture","motivational","sports"]} />
          <Select label="Rights status" value={form.rightsStatus} onChange={update("rightsStatus")} options={["green","amber","red","unknown"]} />
          <Input label="Provider UUID" value={form.providerId} onChange={update("providerId")} />
          <Input label="Uploader UUID" value={form.uploaderId} onChange={update("uploaderId")} />
          <Input label="Import batch" value={form.importBatch} onChange={update("importBatch")} />
          <Input label="Uploaded after" type="date" value={form.after} onChange={update("after")} />
          <Input label="Uploaded before" type="date" value={form.before} onChange={update("before")} />
          <Select label="Platform" value={form.platform} onChange={update("platform")} options={["ios","android","web","windows","macos","linux"]} />
          <Select label="Platform state" value={form.platformEnabled} onChange={update("platformEnabled")} options={["true","false"]} />
          <Input label="Territory" value={form.territory} onChange={update("territory")} />
          <Select label="Evidence" value={form.evidence} onChange={update("evidence")} options={["documented","missing","expiring","expired","needs_review"]} />
          <Select label="Stream type" value={form.streamType} onChange={update("streamType")} options={["direct","proxied","relayed","rehosted","unknown"]} />
          <Input label="Source hostname" value={form.sourceHost} onChange={update("sourceHost")} />
          <Select label="Source availability" value={form.sourceActive} onChange={update("sourceActive")} options={["true","false"]} />
          <Input label="Search" value={form.search} onChange={update("search")} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button disabled={loading} onClick={() => void load()} className="rounded-xl bg-yellow-300 px-4 py-2 text-sm font-black text-black disabled:opacity-50">Apply filters</button>
          <span className="text-sm text-white/60">Matching records: <strong className="text-white">{count.toLocaleString()}</strong></span>
        </div>
      </section>

      <section className="rounded-2xl border border-yellow-300/20 bg-yellow-300/[0.06] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-black">Bulk selection</h2><p className="text-sm text-white/55">The server freezes the complete result set; the browser never receives every ID.</p></div>
          <button disabled={loading || count === 0} onClick={() => void createSnapshot()} className="rounded-xl border border-yellow-300/30 px-4 py-2 text-sm font-black text-yellow-100 disabled:opacity-40">Select all {count.toLocaleString()} filtered</button>
        </div>
        {selectedAll && snapshot ? (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
            <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-white/45">Preview action
              <select className={inputClass} value={action} onChange={(event) => setAction(event.target.value)}>
                <option value="set_rights_status:green">Set GREEN</option><option value="set_rights_status:amber">Set AMBER</option><option value="set_rights_status:red">Set RED</option><option value="set_rights_status:unknown">Set UNKNOWN</option>
                <option value="set_platform:ios">Disable iOS</option><option value="set_platform:android">Disable Android</option><option value="set_platform:web">Disable Web</option><option value="set_platform:windows">Disable Windows</option><option value="set_platform:macos">Disable macOS</option><option value="set_platform:linux">Disable Linux</option>
              </select>
            </label>
            <button disabled={loading} onClick={() => void queueDryRun()} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-black">Run dry run</button>
            <span className="text-xs text-white/45">No execution control is exposed in Phase 4A.</span>
          </div>
        ) : null}
      </section>

      {message ? <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/70">{message}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/[0.06] text-xs uppercase tracking-wider text-white/45"><tr><th className="p-3">Type</th><th className="p-3">Title</th><th className="p-3">Rights</th><th className="p-3">Evidence</th><th className="p-3">iOS</th><th className="p-3">Source</th><th className="p-3">Ingested</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={`${row.content_type}:${row.content_id}`} className="border-t border-white/10"><td className="p-3">{row.content_type}</td><td className="p-3"><strong>{row.title}</strong><div className="text-xs text-white/40">{row.creator_name ?? row.content_id}</div></td><td className="p-3">{row.base_rights_status}</td><td className="p-3">{row.evidence_status}</td><td className="p-3">{row.ios_enabled ? "ON" : "OFF"}</td><td className="p-3">{row.source_host ?? "—"}</td><td className="p-3">{row.ingested_at ? new Date(row.ingested_at).toLocaleDateString() : "—"}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function Input(props: { label: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement>; type?: string }) {
  return <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-white/45">{props.label}<input className={inputClass} type={props.type ?? "text"} value={props.value} onChange={props.onChange} /></label>;
}

function Select(props: { label: string; value: string; onChange: React.ChangeEventHandler<HTMLSelectElement>; options: string[] }) {
  return <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-white/45">{props.label}<select className={inputClass} value={props.value} onChange={props.onChange}><option value="">All</option>{props.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}
