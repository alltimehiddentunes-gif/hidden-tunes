"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import { canUploadMusic } from "@/lib/adminPermissions";
import {
  TV_PLAYBACK_STATUSES,
  TV_SOURCE_TYPES,
  TV_VIDEO_STATUSES,
  type TvVideoRow,
} from "@/lib/tvCatalog";

type VideosResponse = {
  success: boolean;
  videos?: TvVideoRow[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  error?: string;
};

type VideoMutationResponse = {
  success: boolean;
  video?: TvVideoRow;
  error?: string;
};

type BulkActionResponse = {
  success: boolean;
  action?: string;
  requested_count?: number;
  updated_count?: number;
  error?: string;
};

type BulkAction =
  | "approve"
  | "reject"
  | "deactivate"
  | "mark_playable"
  | "mark_blocked"
  | "feature"
  | "unfeature";

type VideoDraft = {
  status: string;
  playback_status: string;
  is_active: boolean;
  is_featured: boolean;
  category: string;
  genre: string;
  mood: string;
  format: string;
  tags: string;
};

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-100 border-emerald-400/25",
  pending: "bg-yellow-300/12 text-yellow-100 border-yellow-300/25",
  rejected: "bg-red-500/12 text-red-100 border-red-400/25",
  blocked: "bg-red-500/20 text-red-100 border-red-400/35",
  inactive: "bg-white/10 text-white/55 border-white/15",
};

const PLAYBACK_TONE: Record<string, string> = {
  playable: "bg-emerald-500/15 text-emerald-100 border-emerald-400/25",
  unchecked: "bg-white/10 text-white/60 border-white/15",
  failed: "bg-red-500/15 text-red-100 border-red-400/25",
  blocked: "bg-red-500/20 text-red-100 border-red-400/35",
  private: "bg-orange-500/15 text-orange-100 border-orange-400/25",
  deleted: "bg-white/10 text-white/45 border-white/15",
  region_blocked: "bg-orange-500/15 text-orange-100 border-orange-400/25",
  embed_blocked: "bg-orange-500/15 text-orange-100 border-orange-400/25",
};

function formatDate(value: string | null) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function statusBadgeClass(value: string, map: Record<string, string>) {
  return map[value] || "bg-white/10 text-white/55 border-white/15";
}

export default function AdminTvVideosPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [videos, setVideos] = useState<TvVideoRow[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  const [filters, setFilters] = useState({
    status: "all",
    playback_status: "all",
    category: "",
    genre: "",
    mood: "",
    source_type: "all",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savingVideoId, setSavingVideoId] = useState<string | null>(null);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, VideoDraft>>({});

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const summary = useMemo(
    () => ({
      visible: videos.length,
      approved: videos.filter((video) => video.status === "approved").length,
      playable: videos.filter((video) => video.playback_status === "playable").length,
      featured: videos.filter((video) => video.is_featured).length,
    }),
    [videos]
  );

  const allVisibleSelected =
    videos.length > 0 && videos.every((video) => selectedSet.has(video.id));

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || "";
  }

  const loadVideos = useCallback(
    async (page = 1) => {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setErrorMessage("Missing authenticated admin session.");
        setVideos([]);
        return;
      }

      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });

      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.playback_status !== "all") {
        params.set("playback_status", filters.playback_status);
      }
      if (filters.category.trim()) params.set("category", filters.category.trim());
      if (filters.genre.trim()) params.set("genre", filters.genre.trim());
      if (filters.mood.trim()) params.set("mood", filters.mood.trim());
      if (filters.source_type !== "all") {
        params.set("source_type", filters.source_type);
      }

      const response = await fetch(`/api/admin/tv/videos?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      const result = (await response.json()) as VideosResponse;

      if (!response.ok || !result.success) {
        setErrorMessage(result.error || "Failed to load TV videos.");
        setVideos([]);
        return;
      }

      setErrorMessage(null);
      const rows = result.videos || [];
      setVideos(rows);
      setPagination(
        result.pagination || {
          page,
          limit: 20,
          total: rows.length,
          totalPages: 1,
          hasMore: false,
        }
      );
      setEdits(
        Object.fromEntries(
          rows.map((video) => [
            video.id,
            {
              status: video.status,
              playback_status: video.playback_status,
              is_active: Boolean(video.is_active),
              is_featured: Boolean(video.is_featured),
              category: video.category || "",
              genre: video.genre || "",
              mood: video.mood || "",
              format: video.format || "",
              tags: (video.tags || []).join(", "),
            },
          ])
        )
      );
      setSelectedIds((current) =>
        current.filter((id) => rows.some((video) => video.id === id))
      );
    },
    [filters]
  );

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

      await loadVideos(1);
      setIsLoading(false);
    }

    bootstrap();
  }, [loadVideos, router]);

  function toggleSelectVideo(videoId: string) {
    setSelectedIds((current) =>
      current.includes(videoId)
        ? current.filter((id) => id !== videoId)
        : [...current, videoId]
    );
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !videos.some((video) => video.id === id))
      );
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      for (const video of videos) {
        next.add(video.id);
      }
      return Array.from(next);
    });
  }

  async function handleBulkAction(action: BulkAction) {
    if (selectedIds.length === 0) {
      setErrorMessage("Select at least one video for bulk actions.");
      return;
    }

    setBulkWorking(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setErrorMessage("Missing authenticated admin session.");
        return;
      }

      const response = await fetch("/api/admin/tv/videos/bulk", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: selectedIds,
          action,
        }),
      });

      const result = (await response.json()) as BulkActionResponse;

      if (!response.ok || !result.success) {
        setErrorMessage(result.error || "Bulk action failed.");
        return;
      }

      setStatusMessage(
        `Bulk ${action} applied to ${result.updated_count || 0} of ${result.requested_count || selectedIds.length} selected videos.`
      );
      await loadVideos(pagination.page);
    } catch {
      setErrorMessage("Network error while running bulk action.");
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleSaveVideo(videoId: string) {
    const edit = edits[videoId];
    if (!edit) return;

    setSavingVideoId(videoId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setErrorMessage("Missing authenticated admin session.");
        return;
      }

      const response = await fetch("/api/admin/tv/videos", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: videoId,
          status: edit.status,
          playback_status: edit.playback_status,
          is_active: edit.is_active,
          is_featured: edit.is_featured,
          category: edit.category || null,
          genre: edit.genre || null,
          mood: edit.mood || null,
          format: edit.format || null,
          tags: edit.tags,
        }),
      });

      const result = (await response.json()) as VideoMutationResponse;

      if (!response.ok || !result.success) {
        setErrorMessage(result.error || "Could not update TV video.");
        return;
      }

      setStatusMessage("TV video moderation saved.");
      await loadVideos(pagination.page);
    } catch {
      setErrorMessage("Network error while updating TV video.");
    } finally {
      setSavingVideoId(null);
    }
  }

  function updateEdit(videoId: string, patch: Partial<VideoDraft>) {
    setEdits((current) => ({
      ...current,
      [videoId]: {
        ...current[videoId],
        ...patch,
      },
    }));
  }

  const bulkButtons: Array<{ action: BulkAction; label: string; tone: string }> = [
    { action: "approve", label: "Bulk approve", tone: "border-emerald-400/30 bg-emerald-500/12 text-emerald-100" },
    { action: "reject", label: "Bulk reject", tone: "border-red-400/25 bg-red-500/10 text-red-100" },
    { action: "deactivate", label: "Bulk deactivate", tone: "border-white/15 bg-white/[0.06] text-white/75" },
    { action: "mark_playable", label: "Mark playable", tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" },
    { action: "mark_blocked", label: "Mark blocked", tone: "border-red-400/30 bg-red-500/12 text-red-100" },
    { action: "feature", label: "Feature", tone: "border-yellow-300/30 bg-yellow-300/12 text-yellow-100" },
    { action: "unfeature", label: "Unfeature", tone: "border-white/15 bg-white/[0.06] text-white/75" },
  ];

  return (
    <AdminShell
      eyebrow="TV Ultra Premium v2"
      title="TV Videos"
      description="Moderate imported TV metadata with playability checks. Public catalog only exposes approved, active, playable videos."
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "On page", value: summary.visible },
            { label: "Approved (page)", value: summary.approved },
            { label: "Playable (page)", value: summary.playable },
            { label: "Featured (page)", value: summary.featured },
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

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <h2 className="text-xl font-black tracking-[-0.04em]">Filters</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-2 text-xs font-bold text-white/55">
              Status
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, status: event.target.value }))
                }
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="all">All</option>
                {TV_VIDEO_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-xs font-bold text-white/55">
              Playback status
              <select
                value={filters.playback_status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    playback_status: event.target.value,
                  }))
                }
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="all">All</option>
                {TV_PLAYBACK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-xs font-bold text-white/55">
              Source type
              <select
                value={filters.source_type}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    source_type: event.target.value,
                  }))
                }
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="all">All</option>
                {TV_SOURCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-xs font-bold text-white/55">
              Category
              <input
                value={filters.category}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, category: event.target.value }))
                }
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="grid gap-2 text-xs font-bold text-white/55">
              Genre
              <input
                value={filters.genre}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, genre: event.target.value }))
                }
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="grid gap-2 text-xs font-bold text-white/55">
              Mood
              <input
                value={filters.mood}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, mood: event.target.value }))
                }
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => loadVideos(1)}
            className="mt-4 rounded-2xl border border-yellow-300/30 bg-yellow-300/12 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/20"
          >
            Apply filters
          </button>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-[-0.04em]">Catalog videos</h2>
              <p className="mt-1 text-sm text-white/45">
                Page {pagination.page} of {Math.max(pagination.totalPages, 1)} · {pagination.total}{" "}
                total · {selectedIds.length} selected
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs font-bold text-white/60">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
              />
              Select all visible
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {bulkButtons.map((button) => (
              <button
                key={button.action}
                type="button"
                disabled={bulkWorking || selectedIds.length === 0}
                onClick={() => handleBulkAction(button.action)}
                className={`rounded-2xl border px-3 py-2 text-xs font-black transition disabled:opacity-50 ${button.tone}`}
              >
                {button.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <p className="mt-4 text-sm text-white/50">Loading TV videos...</p>
          ) : videos.length === 0 ? (
            <p className="mt-4 text-sm text-white/50">No TV videos match these filters.</p>
          ) : (
            <div className="mt-5 space-y-4">
              {videos.map((video) => {
                const edit = edits[video.id];
                if (!edit) return null;

                return (
                  <article
                    key={video.id}
                    className={`rounded-[1.75rem] border p-4 sm:p-5 ${
                      selectedSet.has(video.id)
                        ? "border-yellow-300/35 bg-yellow-300/[0.04]"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(video.id)}
                        onChange={() => toggleSelectVideo(video.id)}
                        className="mt-1"
                      />

                      {video.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={video.thumbnail_url}
                          alt=""
                          className="h-20 w-36 rounded-xl border border-white/10 object-cover"
                        />
                      ) : null}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${statusBadgeClass(
                              String(video.status),
                              STATUS_TONE
                            )}`}
                          >
                            {video.status}
                          </span>
                          <span
                            className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${statusBadgeClass(
                              String(video.playback_status),
                              PLAYBACK_TONE
                            )}`}
                          >
                            {video.playback_status}
                          </span>
                          {video.is_active ? (
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-emerald-100">
                              active
                            </span>
                          ) : null}
                          {video.is_featured ? (
                            <span className="rounded-full border border-yellow-300/25 bg-yellow-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-yellow-100">
                              featured
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-2 text-xs font-black uppercase tracking-widest text-white/35">
                          {video.source_type} · {video.source_id}
                        </p>
                        <p className="mt-1 break-words text-lg font-black">{video.title}</p>
                        {video.channel_name ? (
                          <p className="mt-1 text-sm text-white/55">{video.channel_name}</p>
                        ) : null}
                        <p className="mt-1 break-all text-xs text-white/45">{video.source_url}</p>
                        <p className="mt-2 text-xs text-white/40">
                          Imported {formatDate(video.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Status
                        <select
                          value={edit.status}
                          onChange={(event) =>
                            updateEdit(video.id, { status: event.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        >
                          {TV_VIDEO_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Playback status
                        <select
                          value={edit.playback_status}
                          onChange={(event) =>
                            updateEdit(video.id, {
                              playback_status: event.target.value,
                            })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        >
                          {TV_PLAYBACK_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Format
                        <input
                          value={edit.format}
                          onChange={(event) =>
                            updateEdit(video.id, { format: event.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Category
                        <input
                          value={edit.category}
                          onChange={(event) =>
                            updateEdit(video.id, { category: event.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Genre
                        <input
                          value={edit.genre}
                          onChange={(event) =>
                            updateEdit(video.id, { genre: event.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55">
                        Mood
                        <input
                          value={edit.mood}
                          onChange={(event) =>
                            updateEdit(video.id, { mood: event.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <label className="grid gap-2 text-xs font-bold text-white/55 md:col-span-2">
                        Tags (comma-separated)
                        <input
                          value={edit.tags}
                          onChange={(event) =>
                            updateEdit(video.id, { tags: event.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <label className="flex items-center gap-2 text-xs font-bold text-white/55">
                        <input
                          type="checkbox"
                          checked={edit.is_active}
                          onChange={(event) =>
                            updateEdit(video.id, { is_active: event.target.checked })
                          }
                        />
                        Active
                      </label>

                      <label className="flex items-center gap-2 text-xs font-bold text-white/55">
                        <input
                          type="checkbox"
                          checked={edit.is_featured}
                          onChange={(event) =>
                            updateEdit(video.id, { is_featured: event.target.checked })
                          }
                        />
                        Featured
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveVideo(video.id)}
                      disabled={savingVideoId === video.id}
                      className="mt-4 rounded-2xl border border-yellow-300/30 bg-yellow-300/12 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/20 disabled:opacity-50"
                    >
                      {savingVideoId === video.id ? "Saving..." : "Save moderation"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || isLoading}
              onClick={() => loadVideos(pagination.page - 1)}
              className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/80 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!pagination.hasMore || isLoading}
              onClick={() => loadVideos(pagination.page + 1)}
              className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/80 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
