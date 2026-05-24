"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import {
  applyManualBulkMatch,
  autoMatchBulkLyricsBlocks,
  getBulkMatchThresholds,
  parseBulkLyricsFiles,
  parsePastedBulkLyrics,
  type BulkLyricsKind,
  type BulkLyricsMatchedRow,
  type BulkLyricsMatchStatus,
} from "@/lib/bulkLyricsIntake";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import { canEditAllTrackLyrics } from "@/lib/adminPermissions";
import type { CreatorLyricsCatalogTrack } from "@/lib/creatorLyricsCatalog";

type CatalogResponse = {
  success: boolean;
  error?: string;
  scope?: "all" | "owned";
  role?: string | null;
  tracks?: CreatorLyricsCatalogTrack[];
};

type SaveResponse = {
  success: boolean;
  error?: string;
  message?: string;
  savedCount?: number;
  failedCount?: number;
  results?: Array<{
    trackId: string;
    releaseId: string;
    success: boolean;
    message: string;
  }>;
};

function statusTone(status: BulkLyricsMatchStatus) {
  if (status === "matched") {
    return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  }
  if (status === "possible") {
    return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
  }
  return "border-red-300/20 bg-red-500/10 text-red-100";
}

function kindTone(kind: BulkLyricsKind) {
  return kind === "synced"
    ? "border-violet-300/20 bg-violet-400/10 text-violet-100"
    : "border-white/10 bg-white/[0.06] text-white/70";
}

export default function BulkLyricsIntakePage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "owned">("owned");
  const [catalog, setCatalog] = useState<CreatorLyricsCatalogTrack[]>([]);
  const [pasteInput, setPasteInput] = useState("");
  const [rows, setRows] = useState<BulkLyricsMatchedRow[]>([]);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const thresholds = getBulkMatchThresholds();

  const loadCatalog = useCallback(async (token: string) => {
    const response = await fetch("/api/admin/creator/bulk-lyrics/catalog", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json().catch(() => null)) as CatalogResponse | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error || "Bulk lyrics catalog could not load.");
    }

    setCatalog(data.tracks || []);
    setScope(data.scope === "all" ? "all" : "owned");
    setRole(data.role || null);
  }, []);

  useEffect(() => {
    async function boot() {
      try {
        const { profile } = await getActiveUploaderSession();
        if (!profile) {
          router.replace("/admin/login");
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || "";
        if (!token) {
          router.replace("/admin/login");
          return;
        }

        setAccessToken(token);
        await loadCatalog(token);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : "Bulk lyrics intake could not load."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void boot();
  }, [loadCatalog, router]);

  const readyRows = useMemo(
    () => rows.filter((row) => row.match && row.status === "matched"),
    [rows]
  );

  const reviewCounts = useMemo(
    () => ({
      matched: rows.filter((row) => row.status === "matched").length,
      possible: rows.filter((row) => row.status === "possible").length,
      unmatched: rows.filter((row) => row.status === "unmatched").length,
    }),
    [rows]
  );

  function runAutoMatch(blocks: ReturnType<typeof parsePastedBulkLyrics>) {
    if (!blocks.length) {
      setRows([]);
      setParseNote("No lyrics blocks were detected.");
      return;
    }

    setRows(autoMatchBulkLyricsBlocks(blocks, catalog));
    setParseNote(
      `${blocks.length} block${blocks.length === 1 ? "" : "s"} parsed. Review matches before saving.`
    );
    setSaveMessage(null);
    setSaveError(null);
  }

  async function handleParsePaste() {
    setIsParsing(true);
    setParseNote(null);

    try {
      const blocks = parsePastedBulkLyrics(pasteInput);
      runAutoMatch(blocks);
    } finally {
      setIsParsing(false);
    }
  }

  async function handleImportFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    setIsParsing(true);
    setParseNote(null);

    try {
      const blocks = await parseBulkLyricsFiles(files);
      if (!blocks.length) {
        setParseNote("No valid .txt or .lrc files were imported.");
        return;
      }
      runAutoMatch(blocks);
    } finally {
      setIsParsing(false);
    }
  }

  function updateManualMatch(rowId: string, trackId: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.block.id !== rowId) return row;

        const track =
          catalog.find((entry) => entry.trackId === trackId) ||
          null;

        return applyManualBulkMatch(row, track);
      })
    );
  }

  function confirmPossibleMatch(rowId: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.block.id !== rowId || !row.match) return row;
        return {
          ...row,
          status: "matched",
          score: Math.max(row.score, thresholds.matched),
        };
      })
    );
  }

  async function handleConfirmSave() {
    if (!accessToken) return;

    const items = readyRows
      .filter((row) => row.match)
      .map((row) => ({
        trackId: row.match!.trackId,
        releaseId: row.match!.releaseId,
        mode: row.block.kind === "synced" ? "synced" : "plain",
        value: row.block.content,
      }));

    if (!items.length) {
      setSaveError("Confirm at least one matched song before saving.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/admin/creator/bulk-lyrics/save", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
      });
      const data = (await response.json().catch(() => null)) as SaveResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || data?.message || "Bulk lyrics save failed.");
      }

      setSaveMessage(data.message || `${data.savedCount || 0} lyrics saved.`);
      setRows((current) =>
        current.filter((row) => !row.match || row.status !== "matched")
      );
    } catch (error: unknown) {
      setSaveError(
        error instanceof Error ? error.message : "Bulk lyrics save failed."
      );
    } finally {
      setIsSaving(false);
    }
  }

  const isAdminScope = canEditAllTrackLyrics(role);

  return (
    <AdminShell
      title="Bulk Lyrics Intake"
      description="Import multiple plain or LRC lyrics files, auto-match songs, then save after review."
      actions={
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push("/admin/creator/lyrics")}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75"
          >
            Creator Lyrics Hub
          </button>
          {accessToken ? (
            <button
              type="button"
              onClick={() => void loadCatalog(accessToken)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75"
            >
              Refresh Catalog
            </button>
          ) : null}
        </div>
      }
    >
      {errorMessage ? (
        <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {errorMessage}
        </p>
      ) : null}

      <section className="mt-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-300">
              {isAdminScope ? "Admin scope" : "Owned tracks only"}
            </p>
            <h2 className="mt-2 text-2xl font-black">Import lyrics blocks</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-white/58">
              Paste multiple blocks separated by blank lines or `---`. Import safe
              `.txt` / `.lrc` files. Matching uses filename, LRC tags, title, artist,
              album, and fuzzy scores. Nothing is saved until you confirm.
            </p>
            <p className="mt-2 text-xs text-white/40">
              Catalog: {catalog.length} editable songs · Match ≥
              {Math.round(thresholds.matched * 100)}% · Possible ≥
              {Math.round(thresholds.possible * 100)}%
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.7fr)]">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-widest text-white/38">
              Paste lyrics
            </span>
            <textarea
              value={pasteInput}
              onChange={(event) => setPasteInput(event.target.value)}
              rows={14}
              placeholder={"[ti:Song Title]\n[ar:Artist Name]\n[al:Album Name]\n\n[00:12.00]First line...\n\n---\n\nNext song plain lyrics..."}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-violet-300/35"
            />
          </label>

          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-white/38">
                File import
              </p>
              <p className="mt-2 text-sm text-white/50">
                `.txt` and `.lrc` only, up to 512 KB each.
              </p>
              <input
                type="file"
                accept=".txt,.lrc,text/plain"
                multiple
                onChange={(event) => void handleImportFiles(event)}
                className="mt-4 block w-full text-sm text-white/70 file:mr-3 file:rounded-xl file:border-0 file:bg-violet-300 file:px-4 file:py-2 file:text-sm file:font-black file:text-black"
              />
            </div>

            <button
              type="button"
              disabled={isParsing || isLoading || !pasteInput.trim()}
              onClick={() => void handleParsePaste()}
              className="rounded-2xl bg-violet-300 px-5 py-4 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isParsing ? "Parsing..." : "Parse & Auto-Match"}
            </button>
          </div>
        </div>

        {parseNote ? (
          <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {parseNote}
          </p>
        ) : null}
      </section>

      {rows.length > 0 ? (
        <section className="mt-5 rounded-[2rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
                Match Review
              </p>
              <h2 className="mt-2 text-2xl font-black">Confirm before saving</h2>
              <p className="mt-2 text-sm text-white/45">
                {reviewCounts.matched} matched · {reviewCounts.possible} possible ·{" "}
                {reviewCounts.unmatched} unmatched
              </p>
            </div>

            <button
              type="button"
              disabled={isSaving || readyRows.length === 0}
              onClick={() => void handleConfirmSave()}
              className="rounded-2xl bg-yellow-300 px-5 py-4 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSaving
                ? "Saving..."
                : `Save ${readyRows.length} confirmed match${readyRows.length === 1 ? "" : "es"}`}
            </button>
          </div>

          {saveError ? (
            <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {saveError}
            </p>
          ) : null}
          {saveMessage ? (
            <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {saveMessage}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-3">
            {rows.map((row) => (
              <article
                key={row.block.id}
                className="rounded-[1.4rem] border border-white/10 bg-black/25 p-4"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusTone(
                          row.status
                        )}`}
                      >
                        {row.status}
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${kindTone(
                          row.block.kind
                        )}`}
                      >
                        {row.block.kind === "synced" ? "LRC synced" : "Plain"}
                      </span>
                      {row.score > 0 ? (
                        <span className="text-xs font-bold text-white/45">
                          Score {Math.round(row.score * 100)}%
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-3 text-lg font-black text-white">
                      {row.block.sourceLabel}
                    </h3>
                    <p className="mt-1 text-sm text-white/45">
                      {row.block.titleHint || "No title hint"} ·{" "}
                      {row.block.artistHint || "No artist hint"} ·{" "}
                      {row.block.albumHint || "No album hint"}
                    </p>

                    {row.match ? (
                      <p className="mt-3 text-sm font-bold text-white/72">
                        → {row.match.trackTitle} / {row.match.artistName} /{" "}
                        {row.match.albumTitle}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-white/45">
                        No confident match yet.
                      </p>
                    )}

                    <pre className="mt-3 max-h-28 overflow-auto rounded-xl border border-white/10 bg-black/35 p-3 text-xs leading-5 text-white/55">
                      {row.block.content.slice(0, 500)}
                      {row.block.content.length > 500 ? "\n…" : ""}
                    </pre>
                  </div>

                  <div className="w-full shrink-0 xl:w-72">
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/35">
                        Manual song match
                      </span>
                      <select
                        value={row.match?.trackId || ""}
                        onChange={(event) =>
                          updateManualMatch(row.block.id, event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-violet-300/35"
                      >
                        <option value="">Select a song</option>
                        {catalog.map((track) => (
                          <option key={track.trackId} value={track.trackId}>
                            {track.trackTitle} — {track.artistName}
                          </option>
                        ))}
                      </select>
                    </label>

                    {row.status === "possible" && row.match ? (
                      <button
                        type="button"
                        onClick={() => confirmPossibleMatch(row.block.id)}
                        className="mt-3 w-full rounded-2xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-yellow-100"
                      >
                        Confirm possible match
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : isLoading ? (
        <div className="mt-5 h-40 animate-pulse rounded-[2rem] bg-white/[0.05]" />
      ) : null}
    </AdminShell>
  );
}
