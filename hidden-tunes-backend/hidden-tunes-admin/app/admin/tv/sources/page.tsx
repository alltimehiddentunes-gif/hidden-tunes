"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import { canUploadMusic } from "@/lib/adminPermissions";
import {
  TV_MAX_IMPORT_VIDEOS,
  TV_SCAN_FREQUENCIES,
  TV_SOURCE_TYPES,
  type TvSourceRow,
} from "@/lib/tvCatalog";

type SourcesResponse = {
  success: boolean;
  sources?: TvSourceRow[];
  error?: string;
};

type SourceMutationResponse = {
  success: boolean;
  source?: TvSourceRow;
  error?: string;
  message?: string;
};

type ImportRunResponse = {
  success: boolean;
  message?: string;
  note?: string;
  failed_video_ids?: string[];
  job?: {
    id: string;
    status: string;
    total_found: number;
    total_imported: number;
    total_skipped: number;
    failed_count?: number;
    invalid_line_count?: number;
    error_message?: string | null;
  };
  error?: string;
};

type SourceDraft = {
  source_type: string;
  source_url: string;
  title: string;
  default_category: string;
  default_genre: string;
  default_mood: string;
  scan_frequency: string;
  auto_approve: boolean;
  is_active: boolean;
};

const EMPTY_DRAFT: SourceDraft = {
  source_type: "youtube_video",
  source_url: "",
  title: "",
  default_category: "",
  default_genre: "",
  default_mood: "",
  scan_frequency: "weekly",
  auto_approve: false,
  is_active: true,
};

const BULK_IMPORT_SOURCE_TYPES = new Set([
  "youtube_playlist",
  "youtube_channel",
  "manual",
]);

function formatDate(value: string | null) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function needsBulkList(sourceType: string) {
  return BULK_IMPORT_SOURCE_TYPES.has(sourceType);
}

export default function AdminTvSourcesPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [sources, setSources] = useState<TvSourceRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<SourceDraft>(EMPTY_DRAFT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingSourceId, setSavingSourceId] = useState<string | null>(null);
  const [importingSourceId, setImportingSourceId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, SourceDraft>>({});
  const [manualVideoLists, setManualVideoLists] = useState<Record<string, string>>({});

  const summary = useMemo(
    () => ({
      total: sources.length,
      active: sources.filter((source) => source.is_active).length,
      autoApprove: sources.filter((source) => source.auto_approve).length,
      bulkSources: sources.filter((source) =>
        needsBulkList(String(source.source_type || ""))
      ).length,
    }),
    [sources]
  );

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || "";
  }

  const loadSources = useCallback(async () => {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      setErrorMessage("Missing authenticated admin session.");
      setSources([]);
      return;
    }

    const response = await fetch("/api/admin/tv/sources", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const result = (await response.json()) as SourcesResponse;

    if (!response.ok || !result.success) {
      setErrorMessage(result.error || "Failed to load TV sources.");
      setSources([]);
      return;
    }

    setErrorMessage(null);
    const rows = result.sources || [];
    setSources(rows);
    setEdits(
      Object.fromEntries(
        rows.map((source) => [
          source.id,
          {
            source_type: source.source_type,
            source_url: source.source_url,
            title: source.title || "",
            default_category: source.default_category || "",
            default_genre: source.default_genre || "",
            default_mood: source.default_mood || "",
            scan_frequency: source.scan_frequency || "weekly",
            auto_approve: Boolean(source.auto_approve),
            is_active: Boolean(source.is_active),
          },
        ])
      )
    );
    setManualVideoLists((current) => {
      const next = { ...current };
      for (const source of rows) {
        if (next[source.id] === undefined) {
          next[source.id] = "";
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    async function bootstrap() {
      const { profile } = await getActiveUploaderSession();

      if (!profile) {
        router.replace("/admin/login");
        return;
      }

      if (!canUploadMusic(profile.role)) {
        router.replace("/admin/login");
        return;
      }

      await loadSources();
      setIsLoading(false);
    }

    bootstrap();
  }, [loadSources, router]);

  async function handleCreateSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setErrorMessage("Missing authenticated admin session.");
        return;
      }

      const response = await fetch("/api/admin/tv/sources", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });

      const result = (await response.json()) as SourceMutationResponse;

      if (!response.ok || !result.success) {
        setErrorMessage(result.error || "Could not create TV source.");
        return;
      }

      setDraft(EMPTY_DRAFT);
      setStatusMessage("TV source created.");
      await loadSources();
    } catch {
      setErrorMessage("Network error while creating TV source.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveSource(sourceId: string) {
    const edit = edits[sourceId];
    if (!edit) return;

    setSavingSourceId(sourceId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setErrorMessage("Missing authenticated admin session.");
        return;
      }

      const response = await fetch("/api/admin/tv/sources", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: sourceId,
          ...edit,
        }),
      });

      const result = (await response.json()) as SourceMutationResponse;

      if (!response.ok || !result.success) {
        setErrorMessage(result.error || "Could not update TV source.");
        return;
      }

      setStatusMessage("TV source updated.");
      await loadSources();
    } catch {
      setErrorMessage("Network error while updating TV source.");
    } finally {
      setSavingSourceId(null);
    }
  }

  async function handleDeactivateSource(sourceId: string) {
    setSavingSourceId(sourceId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setErrorMessage("Missing authenticated admin session.");
        return;
      }

      const response = await fetch(`/api/admin/tv/sources?id=${encodeURIComponent(sourceId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = (await response.json()) as SourceMutationResponse;

      if (!response.ok || !result.success) {
        setErrorMessage(result.error || "Could not deactivate TV source.");
        return;
      }

      setStatusMessage(result.message || "TV source deactivated.");
      await loadSources();
    } catch {
      setErrorMessage("Network error while deactivating TV source.");
    } finally {
      setSavingSourceId(null);
    }
  }

  async function handleRunImport(sourceId: string) {
    const edit = edits[sourceId];
    const manualVideoList = manualVideoLists[sourceId] || "";

    if (edit && needsBulkList(edit.source_type) && !manualVideoList.trim()) {
      setErrorMessage(
        "Paste at least one YouTube URL or video ID in the bulk list for playlist/channel/manual imports."
      );
      return;
    }

    setImportingSourceId(sourceId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setErrorMessage("Missing authenticated admin session.");
        return;
      }

      const response = await fetch("/api/admin/tv/import/run", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceId,
          manualVideoList,
        }),
      });

      const result = (await response.json()) as ImportRunResponse;

      if (!response.ok || !result.success) {
        setErrorMessage(result.error || "Import job failed.");
        return;
      }

      const counts = result.job;
      setStatusMessage(
        [
          result.message || "Import completed.",
          counts
            ? `Found ${counts.total_found}, imported ${counts.total_imported}, skipped ${counts.total_skipped}.`
            : null,
          counts?.failed_count
            ? `Failed metadata fetch: ${counts.failed_count}.`
            : null,
          counts?.invalid_line_count
            ? `Invalid lines ignored: ${counts.invalid_line_count}.`
            : null,
          counts?.error_message || null,
          result.note || null,
        ]
          .filter(Boolean)
          .join(" ")
      );
      await loadSources();
    } catch {
      setErrorMessage("Network error while running TV import.");
    } finally {
      setImportingSourceId(null);
    }
  }

  function updateEdit(sourceId: string, patch: Partial<SourceDraft>) {
    setEdits((current) => ({
      ...current,
      [sourceId]: {
        ...current[sourceId],
        ...patch,
      },
    }));
  }

  return (
    <AdminShell
      eyebrow="TV Ultra Premium v2"
      title="TV Sources"
      description="Manage metadata import sources. Bulk imports use YouTube oEmbed for title/channel/thumbnail only — never download or rehost video files."
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total sources", value: summary.total },
            { label: "Active", value: summary.active },
            { label: "Auto-approve", value: summary.autoApprove },
            { label: "Bulk-ready sources", value: summary.bulkSources },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4"
            >
              <p className="text-xs font-black uppercase tracking-widest text-white/35">
                {card.label}
              </p>
              <p className="mt-2 text-3xl font-black">{card.value}</p>
            </div>
          ))}
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

        <form
          onSubmit={handleCreateSource}
          className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6"
        >
          <h2 className="text-xl font-black tracking-[-0.04em]">Add source</h2>
          <p className="mt-2 text-sm text-white/50">
            <span className="font-bold text-white/72">youtube_video</span> imports one
            video (oEmbed metadata).{" "}
            <span className="font-bold text-white/72">youtube_playlist</span> and{" "}
            <span className="font-bold text-white/72">youtube_channel</span> require a
            pasted bulk URL/ID list (max {TV_MAX_IMPORT_VIDEOS} per run).
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-2 text-sm font-bold text-white/70">
              Source type
              <select
                value={draft.source_type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    source_type: event.target.value,
                  }))
                }
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              >
                {TV_SOURCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold text-white/70 md:col-span-2">
              Source URL
              <input
                value={draft.source_url}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    source_url: event.target.value,
                  }))
                }
                placeholder="https://www.youtube.com/watch?v=... or playlist/channel URL"
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
                required
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-white/70">
              Title
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-white/70">
              Default category
              <input
                value={draft.default_category}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    default_category: event.target.value,
                  }))
                }
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-white/70">
              Default genre
              <input
                value={draft.default_genre}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    default_genre: event.target.value,
                  }))
                }
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-white/70">
              Default mood
              <input
                value={draft.default_mood}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    default_mood: event.target.value,
                  }))
                }
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-white/70">
              Scan frequency
              <select
                value={draft.scan_frequency}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    scan_frequency: event.target.value,
                  }))
                }
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              >
                {TV_SCAN_FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {frequency}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white/70">
              <input
                type="checkbox"
                checked={draft.auto_approve}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    auto_approve: event.target.checked,
                  }))
                }
              />
              Auto-approve imports
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white/70">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    is_active: event.target.checked,
                  }))
                }
              />
              Active source
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-5 rounded-2xl border border-yellow-300/30 bg-yellow-300/15 px-5 py-3 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/25 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create source"}
          </button>
        </form>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <h2 className="text-xl font-black tracking-[-0.04em]">Registered sources</h2>

          {isLoading ? (
            <p className="mt-4 text-sm text-white/50">Loading TV sources...</p>
          ) : sources.length === 0 ? (
            <p className="mt-4 text-sm text-white/50">No TV sources yet.</p>
          ) : (
            <div className="mt-5 space-y-4">
              {sources.map((source) => {
                const edit = edits[source.id];
                if (!edit) return null;

                const bulkRequired = needsBulkList(edit.source_type);

                return (
                  <article
                    key={source.id}
                    className="rounded-[1.75rem] border border-white/10 bg-black/20 p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-white/35">
                          {source.source_type}
                        </p>
                        <p className="mt-1 text-lg font-black">
                          {edit.title || "Untitled source"}
                        </p>
                        <p className="mt-1 break-all text-xs text-white/45">{source.id}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-widest">
                        <span
                          className={`rounded-full px-3 py-1 ${
                            edit.is_active
                              ? "bg-emerald-500/15 text-emerald-100"
                              : "bg-white/10 text-white/45"
                          }`}
                        >
                          {edit.is_active ? "Active" : "Inactive"}
                        </span>
                        {edit.auto_approve ? (
                          <span className="rounded-full bg-yellow-300/15 px-3 py-1 text-yellow-100">
                            Auto-approve
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Source type
                        <select
                          value={edit.source_type}
                          onChange={(event) =>
                            updateEdit(source.id, { source_type: event.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        >
                          {TV_SOURCE_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55 md:col-span-2">
                        Source URL
                        <input
                          value={edit.source_url}
                          onChange={(event) =>
                            updateEdit(source.id, { source_url: event.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Title
                        <input
                          value={edit.title}
                          onChange={(event) =>
                            updateEdit(source.id, { title: event.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Default category
                        <input
                          value={edit.default_category}
                          onChange={(event) =>
                            updateEdit(source.id, {
                              default_category: event.target.value,
                            })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Default genre
                        <input
                          value={edit.default_genre}
                          onChange={(event) =>
                            updateEdit(source.id, { default_genre: event.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Default mood
                        <input
                          value={edit.default_mood}
                          onChange={(event) =>
                            updateEdit(source.id, { default_mood: event.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Scan frequency
                        <select
                          value={edit.scan_frequency}
                          onChange={(event) =>
                            updateEdit(source.id, {
                              scan_frequency: event.target.value,
                            })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        >
                          {TV_SCAN_FREQUENCIES.map((frequency) => (
                            <option key={frequency} value={frequency}>
                              {frequency}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex items-center gap-2 text-xs font-bold text-white/55">
                        <input
                          type="checkbox"
                          checked={edit.auto_approve}
                          onChange={(event) =>
                            updateEdit(source.id, { auto_approve: event.target.checked })
                          }
                        />
                        Auto-approve
                      </label>

                      <label className="flex items-center gap-2 text-xs font-bold text-white/55">
                        <input
                          type="checkbox"
                          checked={edit.is_active}
                          onChange={(event) =>
                            updateEdit(source.id, { is_active: event.target.checked })
                          }
                        />
                        Active
                      </label>
                    </div>

                    <div className="mt-4 grid gap-2 text-xs text-white/45 sm:grid-cols-2">
                      <p>Last scanned: {formatDate(source.last_scanned_at)}</p>
                      <p>Created: {formatDate(source.created_at)}</p>
                    </div>

                    <label className="mt-4 grid gap-2 text-xs font-bold text-white/55">
                      Bulk video URLs/IDs{" "}
                      {bulkRequired ? (
                        <span className="font-black text-yellow-200">(required)</span>
                      ) : (
                        <span className="text-white/35">(optional)</span>
                      )}
                      <textarea
                        value={manualVideoLists[source.id] || ""}
                        onChange={(event) =>
                          setManualVideoLists((current) => ({
                            ...current,
                            [source.id]: event.target.value,
                          }))
                        }
                        rows={6}
                        placeholder={
                          bulkRequired
                            ? "Paste one YouTube URL or 11-character video ID per line"
                            : "Optional: extra video URLs/IDs (one per line)"
                        }
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs leading-5 text-white"
                      />
                      <span className="text-[11px] font-semibold text-white/35">
                        Max {TV_MAX_IMPORT_VIDEOS} videos per run. Invalid lines are
                        ignored. Duplicates in the list and catalog are skipped.
                      </span>
                    </label>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveSource(source.id)}
                        disabled={savingSourceId === source.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/80 transition hover:border-white/20 disabled:opacity-50"
                      >
                        {savingSourceId === source.id ? "Saving..." : "Save changes"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRunImport(source.id)}
                        disabled={
                          importingSourceId === source.id || !edit.is_active
                        }
                        className="rounded-2xl border border-yellow-300/30 bg-yellow-300/12 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/20 disabled:opacity-50"
                      >
                        {importingSourceId === source.id
                          ? "Running import..."
                          : "Run import"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeactivateSource(source.id)}
                        disabled={savingSourceId === source.id}
                        className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-2 text-sm font-black text-red-100 transition hover:border-red-300/35 disabled:opacity-50"
                      >
                        Deactivate
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
