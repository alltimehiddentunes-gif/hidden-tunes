"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import { canUploadMusic } from "@/lib/adminPermissions";
import {
  TV_DISCOVERY_QUERY_TEMPLATES,
  buildDiscoveryPlanCsv,
  buildDiscoveryQueriesText,
  parseDiscoverySeedList,
  type TvDiscoveryPlanRow,
  type TvDiscoveryPlanSummary,
} from "@/lib/tvDiscovery";

type DiscoveryGenerateResponse = {
  success: boolean;
  plan?: TvDiscoveryPlanRow[];
  summary?: TvDiscoveryPlanSummary;
  calculator?: {
    formula: string;
    expression: string;
    estimated_catalog_records: number;
  };
  note?: string;
  error?: string;
};

type DiscoveryCreateSourcesResponse = {
  success: boolean;
  created_count?: number;
  requested_count?: number;
  message?: string;
  error?: string;
};

const EXAMPLE_SEEDS = `Blues
Soul Blues
Afrobeats
Amapiano
Jazz
Gospel
Black History
Live Performances`;

export default function AdminTvDiscoveryPage() {
  const router = useRouter();
  const [seedsText, setSeedsText] = useState(EXAMPLE_SEEDS);
  const [defaultCategory, setDefaultCategory] = useState("Music");
  const [defaultGenre, setDefaultGenre] = useState("");
  const [defaultMood, setDefaultMood] = useState("");
  const [targetResultsPerQuery, setTargetResultsPerQuery] = useState(50);
  const [plan, setPlan] = useState<TvDiscoveryPlanRow[]>([]);
  const [summary, setSummary] = useState<TvDiscoveryPlanSummary | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreatingSources, setIsCreatingSources] = useState(false);
  const [autoApproveSources, setAutoApproveSources] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const parsedSeedCount = useMemo(
    () => parseDiscoverySeedList(seedsText).length,
    [seedsText]
  );

  const liveCalculator = useMemo(() => {
    const seedCount = parsedSeedCount;
    const queryTypeCount = TV_DISCOVERY_QUERY_TEMPLATES.length;
    const target = Math.min(500, Math.max(1, Number(targetResultsPerQuery) || 50));

    return {
      seedCount,
      queryTypeCount,
      target,
      planRows: seedCount * queryTypeCount,
      estimatedRecords: seedCount * queryTypeCount * target,
      expression: `${seedCount} × ${queryTypeCount} × ${target}`,
    };
  }, [parsedSeedCount, targetResultsPerQuery]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const allSelected =
    plan.length > 0 && plan.every((row) => selectedSet.has(row.id));

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || "";
  }

  async function ensureAccess() {
    const { profile } = await getActiveUploaderSession();

    if (!profile) {
      router.replace("/admin/login");
      return false;
    }

    if (!canUploadMusic(profile.role)) {
      router.replace("/admin/login");
      return false;
    }

    return true;
  }

  async function handleGeneratePlan() {
    if (!(await ensureAccess())) return;

    setIsGenerating(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setCopyMessage(null);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setErrorMessage("Missing authenticated admin session.");
        return;
      }

      const response = await fetch("/api/admin/tv/discovery", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "generate",
          seeds: seedsText,
          maxResultsPerQuery: targetResultsPerQuery,
          defaultCategory: defaultCategory || null,
          defaultGenre: defaultGenre || null,
          defaultMood: defaultMood || null,
        }),
      });

      const result = (await response.json()) as DiscoveryGenerateResponse;

      if (!response.ok || !result.success || !result.plan) {
        setErrorMessage(result.error || "Could not generate discovery plan.");
        return;
      }

      setPlan(result.plan);
      setSummary(result.summary || null);
      setSelectedIds(result.plan.map((row) => row.id));
      setStatusMessage(
        result.note ||
          `Generated ${result.plan.length} reviewable discovery queries (metadata only).`
      );
    } catch {
      setErrorMessage("Network error while generating discovery plan.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCreateSourcePlaceholders() {
    const selectedRows = plan.filter((row) => selectedSet.has(row.id));

    if (selectedRows.length === 0) {
      setErrorMessage("Select at least one discovery plan row.");
      return;
    }

    if (!(await ensureAccess())) return;

    setIsCreatingSources(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setErrorMessage("Missing authenticated admin session.");
        return;
      }

      const response = await fetch("/api/admin/tv/discovery", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create_sources",
          rows: selectedRows,
          autoApprove: autoApproveSources,
        }),
      });

      const result = (await response.json()) as DiscoveryCreateSourcesResponse;

      if (!response.ok || !result.success) {
        setErrorMessage(result.error || "Could not create TV source placeholders.");
        return;
      }

      setStatusMessage(
        result.message ||
          `Created ${result.created_count || 0} manual TV source placeholders. Open TV Sources to paste video URLs/IDs into each bulk importer.`
      );
    } catch {
      setErrorMessage("Network error while creating source placeholders.");
    } finally {
      setIsCreatingSources(false);
    }
  }

  function toggleRow(rowId: string) {
    setSelectedIds((current) =>
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId]
    );
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(plan.map((row) => row.id));
  }

  async function handleCopyQueries() {
    const rows = plan.filter((row) => selectedSet.has(row.id));
    const payload = buildDiscoveryQueriesText(rows.length ? rows : plan);

    try {
      await navigator.clipboard.writeText(payload);
      setCopyMessage(
        `Copied ${rows.length || plan.length} discovery queries to clipboard.`
      );
      setErrorMessage(null);
    } catch {
      setErrorMessage("Clipboard copy failed in this browser.");
    }
  }

  function handleDownloadCsv() {
    const rows = plan.filter((row) => selectedSet.has(row.id));
    const csv = buildDiscoveryPlanCsv(rows.length ? rows : plan);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hidden-tunes-tv-discovery-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setCopyMessage("Discovery plan CSV downloaded.");
  }

  return (
    <AdminShell
      eyebrow="TV Ultra Premium v2"
      title="TV Discovery"
      description="Generate reviewable discovery plans from seeds without quota-heavy YouTube search. Export queries, then paste found video URLs into TV Sources bulk import."
    >
      <div className="space-y-5">
        <div className="rounded-[2rem] border border-yellow-300/25 bg-yellow-300/[0.06] p-5 sm:p-6">
          <h2 className="text-xl font-black tracking-[-0.04em]">50k target calculator</h2>
          <p className="mt-2 text-sm text-white/55">
            Estimate how many catalog metadata rows you can target before manual URL
            collection and bulk import.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-white/35">
                Seeds
              </p>
              <p className="mt-2 text-3xl font-black">{liveCalculator.seedCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-white/35">
                Query types
              </p>
              <p className="mt-2 text-3xl font-black">{liveCalculator.queryTypeCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-white/35">
                Target / query
              </p>
              <p className="mt-2 text-3xl font-black">{liveCalculator.target}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-white/35">
                Estimated records
              </p>
              <p className="mt-2 text-3xl font-black text-yellow-100">
                {liveCalculator.estimatedRecords.toLocaleString()}
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm font-bold text-white/70">
            {liveCalculator.expression} ={" "}
            <span className="text-yellow-100">
              {liveCalculator.estimatedRecords.toLocaleString()} target records
            </span>
          </p>

          {summary ? (
            <p className="mt-2 text-xs text-white/45">
              Last generated plan: {summary.plan_row_count} rows · estimated{" "}
              {summary.estimated_catalog_records.toLocaleString()} records
            </p>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
            {errorMessage}
          </div>
        ) : null}

        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
            {statusMessage}
          </div>
        ) : null}

        {copyMessage ? (
          <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100">
            {copyMessage}
          </div>
        ) : null}

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <h2 className="text-xl font-black tracking-[-0.04em]">Seed list</h2>
          <p className="mt-2 text-sm text-white/50">
            One seed per line. Each seed expands into {TV_DISCOVERY_QUERY_TEMPLATES.length}{" "}
            discovery query templates. No YouTube API calls are made in this phase.
          </p>

          <label className="mt-4 grid gap-2 text-sm font-bold text-white/70">
            Seeds
            <textarea
              value={seedsText}
              onChange={(event) => setSeedsText(event.target.value)}
              rows={10}
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs leading-5 text-white"
              placeholder="Blues&#10;Jazz&#10;Gospel"
            />
          </label>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-2 text-sm font-bold text-white/70">
              Default category
              <input
                value={defaultCategory}
                onChange={(event) => setDefaultCategory(event.target.value)}
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-white/70">
              Default genre (optional)
              <input
                value={defaultGenre}
                onChange={(event) => setDefaultGenre(event.target.value)}
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-white/70">
              Default mood (optional)
              <input
                value={defaultMood}
                onChange={(event) => setDefaultMood(event.target.value)}
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-white/70">
              Target results per query
              <input
                type="number"
                min={1}
                max={500}
                value={targetResultsPerQuery}
                onChange={(event) =>
                  setTargetResultsPerQuery(Number(event.target.value) || 50)
                }
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={isGenerating || parsedSeedCount === 0}
            onClick={handleGeneratePlan}
            className="mt-5 rounded-2xl border border-yellow-300/30 bg-yellow-300/15 px-5 py-3 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/25 disabled:opacity-50"
          >
            {isGenerating ? "Generating plan..." : "Generate discovery plan"}
          </button>
        </div>

        {plan.length > 0 ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black tracking-[-0.04em]">Discovery plan</h2>
                <p className="mt-1 text-sm text-white/45">
                  {plan.length} rows · {selectedIds.length} selected
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-white/60">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
                Select all
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyQueries}
                className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/80"
              >
                Copy queries
              </button>
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/80"
              >
                Download CSV
              </button>
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-xs font-bold text-white/70">
                <input
                  type="checkbox"
                  checked={autoApproveSources}
                  onChange={(event) => setAutoApproveSources(event.target.checked)}
                />
                Auto-approve sources
              </label>
              <button
                type="button"
                disabled={isCreatingSources || selectedIds.length === 0}
                onClick={handleCreateSourcePlaceholders}
                className="rounded-2xl border border-yellow-300/30 bg-yellow-300/12 px-4 py-2 text-sm font-black text-yellow-100 disabled:opacity-50"
              >
                {isCreatingSources
                  ? "Creating sources..."
                  : "Create TV source placeholders"}
              </button>
            </div>

            <p className="mt-3 text-xs leading-5 text-white/40">
              Workflow: copy queries for manual YouTube browsing (outside this tool),
              collect video URLs/IDs, then open each created source on TV Sources and paste
              into the bulk importer.
            </p>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-black/35 text-white/45">
                  <tr>
                    <th className="px-3 py-3 font-black">Pick</th>
                    <th className="px-3 py-3 font-black">Seed</th>
                    <th className="px-3 py-3 font-black">Query type</th>
                    <th className="px-3 py-3 font-black">Generated query</th>
                    <th className="px-3 py-3 font-black">Category</th>
                    <th className="px-3 py-3 font-black">Genre</th>
                    <th className="px-3 py-3 font-black">Mood</th>
                    <th className="px-3 py-3 font-black">Format</th>
                    <th className="px-3 py-3 font-black">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-white/10 bg-black/15 text-white/75"
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                        />
                      </td>
                      <td className="px-3 py-3 font-bold text-white">{row.seed}</td>
                      <td className="px-3 py-3">{row.query_type_label}</td>
                      <td className="min-w-[280px] px-3 py-3 font-semibold text-yellow-100">
                        {row.generated_query}
                      </td>
                      <td className="px-3 py-3">{row.suggested_category || "—"}</td>
                      <td className="px-3 py-3">{row.suggested_genre || "—"}</td>
                      <td className="px-3 py-3">{row.suggested_mood || "—"}</td>
                      <td className="px-3 py-3">{row.suggested_format || "—"}</td>
                      <td className="px-3 py-3">{row.target_results}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
