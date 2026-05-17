"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import { formatRightsValue } from "@/lib/rightsReview";

type ViewMode = "compact" | "grid";
type StatusFilter = "all" | "ready" | "needs_audio" | "needs_artwork" | "no_tracks";
type SortMode = "updated_desc" | "title_asc" | "artist_asc" | "tracks_desc";

type ReleaseSummary = {
  id: string;
  title: string;
  slug: string | null;
  artist: string;
  artworkUrl: string | null;
  releaseYear: string | number | null;
  createdAt: string | null;
  updatedAt: string | null;
  trackCount: number;
  totalDuration: number;
  primaryGenre: string | null;
  primaryTrackId: string | null;
  audioReadyCount: number;
  artworkReadyCount: number;
  lyricsReadyCount: number;
  reviewStatus?: string | null;
  licenseDeclaration?: string | null;
  copyrightScanStatus?: string | null;
  duplicateScanStatus?: string | null;
};

type ReleasesResponse = {
  success: boolean;
  releases?: ReleaseSummary[];
  error?: string;
  pagination?: {
    pageSize: number;
    returned: number;
    nextCursor: string | null;
  };
};

function formatDate(value: string | null) {
  if (!value) return "Recent";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function releaseStatus(release: ReleaseSummary) {
  if (!release.trackCount) return "No tracks";
  if (release.audioReadyCount < release.trackCount) return "Needs audio";
  if (release.artworkReadyCount < release.trackCount) return "Needs artwork";
  return "Ready";
}

function statusFilterKey(status: string): StatusFilter {
  if (status === "Ready") return "ready";
  if (status === "Needs audio") return "needs_audio";
  if (status === "Needs artwork") return "needs_artwork";
  if (status === "No tracks") return "no_tracks";
  return "all";
}

function statusClass(status: string) {
  if (status === "Ready") {
    return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  }
  if (status === "Needs audio" || status === "Needs artwork") {
    return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
  }
  return "border-white/10 bg-white/[0.06] text-white/60";
}

function rightsBadgeClass(value: string | null | undefined, kind: "review" | "scan") {
  const normalized = String(value || "").toLowerCase();

  if (normalized === "approved" || normalized === "published" || normalized === "clear") {
    return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  }
  if (
    normalized.includes("flagged") ||
    normalized === "rejected" ||
    normalized === "takedown_requested"
  ) {
    return "border-red-300/20 bg-red-500/10 text-red-100";
  }
  if (normalized === "pending_review" || normalized === "draft") {
    return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
  }
  if (kind === "scan" && (normalized === "not_scanned" || !normalized)) {
    return "border-white/10 bg-white/[0.045] text-white/45";
  }
  return "border-white/10 bg-white/[0.06] text-white/62";
}

function sortDate(value: string | null) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export default function AdminReleasesPage() {
  const router = useRouter();
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [genreFilter, setGenreFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");

  const totals = useMemo(
    () => ({
      releases: releases.length,
      tracks: releases.reduce((total, release) => total + release.trackCount, 0),
      ready: releases.filter((release) => releaseStatus(release) === "Ready")
        .length,
      review: releases.filter((release) => releaseStatus(release) !== "Ready")
        .length,
    }),
    [releases]
  );

  const genreOptions = useMemo(
    () =>
      Array.from(
        new Set(
          releases
            .map((release) => release.primaryGenre)
            .filter((genre): genre is string => Boolean(genre))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [releases]
  );

  const filteredReleases = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return releases
      .filter((release) => {
        const status = releaseStatus(release);
        const searchable = [
          release.title,
          release.artist,
          release.primaryGenre || "",
          release.reviewStatus || "",
          release.licenseDeclaration || "",
          release.copyrightScanStatus || "",
          release.duplicateScanStatus || "",
        ]
          .join(" ")
          .toLowerCase();

        if (query && !searchable.includes(query)) return false;
        if (statusFilter !== "all" && statusFilterKey(status) !== statusFilter) {
          return false;
        }
        if (genreFilter !== "all" && release.primaryGenre !== genreFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortMode === "title_asc") return a.title.localeCompare(b.title);
        if (sortMode === "artist_asc") return a.artist.localeCompare(b.artist);
        if (sortMode === "tracks_desc") return b.trackCount - a.trackCount;
        return (
          sortDate(b.updatedAt || b.createdAt) -
          sortDate(a.updatedAt || a.createdAt)
        );
      });
  }, [genreFilter, releases, searchQuery, sortMode, statusFilter]);

  const loadReleases = useCallback(async () => {
    const { profile } = await getActiveUploaderSession();
    if (!profile) {
      router.replace("/admin/login");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) throw new Error("Your admin session expired. Sign in again.");

    const response = await fetch("/api/admin/releases", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json().catch(() => null)) as
      | ReleasesResponse
      | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error || "Could not load releases.");
    }

    setReleases(data.releases || []);
  }, [router]);

  useEffect(() => {
    async function boot() {
      try {
        await loadReleases();
      } catch (error: unknown) {
        setPageError(
          error instanceof Error ? error.message : "Releases could not load."
        );
      } finally {
        setIsLoading(false);
      }
    }

    boot();
  }, [loadReleases]);

  function openLyrics(release: ReleaseSummary) {
    if (!release.primaryTrackId) return;
    router.push(`/admin/releases/${release.id}/tracks/${release.primaryTrackId}/lyrics`);
  }

  return (
    <AdminShell
      title="Releases"
      description="Scan, search, filter, and operate releases from a compact dashboard designed for a large catalog."
      actions={
        <button
          onClick={() => router.push("/admin/upload")}
          className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black shadow-[0_18px_45px_rgba(250,204,21,0.14)] transition hover:-translate-y-0.5"
        >
          Upload Music
        </button>
      }
    >
      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Releases" value={String(totals.releases)} />
        <MetricCard label="Tracks" value={String(totals.tracks)} />
        <MetricCard label="Ready" value={String(totals.ready)} />
        <MetricCard label="Review" value={String(totals.review)} />
      </section>

      <section className="mb-5 rounded-[2rem] border border-white/10 bg-[#101017]/92 p-4 shadow-2xl">
        <div className="grid gap-3 xl:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_auto]">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search releases, artists, genres, or rights states..."
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition placeholder:text-white/30 focus:border-yellow-300/50"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-yellow-300/50"
          >
            <option value="all">All statuses</option>
            <option value="ready">Ready</option>
            <option value="needs_audio">Needs audio</option>
            <option value="needs_artwork">Needs artwork</option>
            <option value="no_tracks">No tracks</option>
          </select>

          <select
            value={genreFilter}
            onChange={(event) => setGenreFilter(event.target.value)}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-yellow-300/50"
          >
            <option value="all">All genres</option>
            {genreOptions.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>

          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-yellow-300/50"
          >
            <option value="updated_desc">Recently updated</option>
            <option value="title_asc">Title A-Z</option>
            <option value="artist_asc">Artist A-Z</option>
            <option value="tracks_desc">Most tracks</option>
          </select>

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/25 p-1">
            {(["compact", "grid"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition ${
                  viewMode === mode
                    ? "bg-yellow-300 text-black"
                    : "text-white/55 hover:text-white"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-3 text-xs leading-5 text-white/35">
          Showing {filteredReleases.length} of {releases.length} loaded releases.
          Rights badges are display-only while copyright and duplicate scanning are
          prepared for a later phase.
        </p>
      </section>

      {pageError ? (
        <section className="mb-5 rounded-[2rem] border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
          {pageError}
        </section>
      ) : null}

      {isLoading ? (
        <section className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="h-24 rounded-[1.6rem] border border-white/10 bg-white/[0.035]"
            />
          ))}
        </section>
      ) : releases.length === 0 ? (
        <EmptyState onUpload={() => router.push("/admin/upload")} />
      ) : filteredReleases.length === 0 ? (
        <section className="rounded-[2rem] border border-white/10 bg-[#101017]/92 p-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
            No matches
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
            Try a different search or filter
          </h2>
        </section>
      ) : viewMode === "compact" ? (
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#101017]/92 shadow-2xl">
          <div className="hidden grid-cols-[minmax(260px,1.35fr)_0.55fr_0.7fr_1.1fr_0.75fr_230px] gap-4 border-b border-white/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-white/35 xl:grid">
            <span>Release</span>
            <span>Tracks</span>
            <span>Status</span>
            <span>Rights</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>

          <div className="divide-y divide-white/8">
            {filteredReleases.map((release) => (
              <ReleaseRow
                key={release.id}
                release={release}
                onOpen={() => router.push(`/admin/releases/${release.id}`)}
                onLyrics={() => openLyrics(release)}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {filteredReleases.map((release) => (
            <ReleaseGridCard
              key={release.id}
              release={release}
              onOpen={() => router.push(`/admin/releases/${release.id}`)}
              onLyrics={() => openLyrics(release)}
            />
          ))}
        </section>
      )}
    </AdminShell>
  );
}

function ReleaseArtwork({ release }: { release: ReleaseSummary }) {
  return (
    <div
      className="h-16 w-16 shrink-0 rounded-2xl border border-white/10 bg-[#14141c] bg-cover bg-center shadow-xl"
      style={{
        backgroundImage: release.artworkUrl
          ? `url("${release.artworkUrl}")`
          : "linear-gradient(135deg,rgba(250,204,21,0.22),rgba(168,85,247,0.1),rgba(255,255,255,0.04))",
      }}
    />
  );
}

function ReleaseRow({
  release,
  onOpen,
  onLyrics,
}: {
  release: ReleaseSummary;
  onOpen: () => void;
  onLyrics: () => void;
}) {
  const status = releaseStatus(release);

  return (
    <article className="grid gap-4 px-4 py-4 transition hover:bg-white/[0.035] xl:grid-cols-[minmax(260px,1.35fr)_0.55fr_0.7fr_1.1fr_0.75fr_230px] xl:items-center">
      <div className="flex min-w-0 items-center gap-4">
        <ReleaseArtwork release={release} />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-black tracking-[-0.025em]">
            {release.title}
          </h2>
          <p className="truncate text-sm font-bold text-white/50">
            {release.artist}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-white/35">
            {release.primaryGenre || "Unassigned genre"}
          </p>
        </div>
      </div>

      <InfoCell label="Tracks" value={String(release.trackCount)} />
      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/30 xl:hidden">
          Status
        </p>
        <StatusBadge status={status} />
      </div>
      <RightsBadgeGroup release={release} />
      <InfoCell label="Updated" value={formatDate(release.updatedAt || release.createdAt)} />

      <QuickActions
        canEditLyrics={Boolean(release.primaryTrackId)}
        onOpen={onOpen}
        onLyrics={onLyrics}
      />
    </article>
  );
}

function ReleaseGridCard({
  release,
  onOpen,
  onLyrics,
}: {
  release: ReleaseSummary;
  onOpen: () => void;
  onLyrics: () => void;
}) {
  const status = releaseStatus(release);

  return (
    <article className="rounded-[1.6rem] border border-white/10 bg-[#101017]/92 p-4 shadow-xl transition hover:-translate-y-0.5 hover:border-yellow-300/20">
      <div className="flex items-start gap-4">
        <ReleaseArtwork release={release} />
        <div className="min-w-0 flex-1">
          <StatusBadge status={status} />
          <h2 className="mt-3 line-clamp-2 text-xl font-black tracking-[-0.035em]">
            {release.title}
          </h2>
          <p className="mt-1 truncate text-sm font-bold text-white/50">
            {release.artist}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniStat label="Tracks" value={String(release.trackCount)} />
        <MiniStat label="Genre" value={release.primaryGenre || "None"} />
        <MiniStat label="Updated" value={formatDate(release.updatedAt || release.createdAt)} />
      </div>

      <div className="mt-4">
        <RightsBadgeGroup release={release} />
      </div>

      <div className="mt-4">
        <QuickActions
          canEditLyrics={Boolean(release.primaryTrackId)}
          onOpen={onOpen}
          onLyrics={onLyrics}
        />
      </div>
    </article>
  );
}

function RightsBadgeGroup({ release }: { release: ReleaseSummary }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/30 xl:hidden">
        Rights
      </p>
      <div className="flex flex-wrap gap-1.5">
        <RightsBadge
          label="Review"
          value={release.reviewStatus}
          fallback="Not reviewed"
          kind="review"
        />
        <RightsBadge
          label="License"
          value={release.licenseDeclaration}
          fallback="Unknown"
          kind="review"
        />
        <RightsBadge
          label="Copyright"
          value={release.copyrightScanStatus}
          fallback="Unknown"
          kind="scan"
        />
        <RightsBadge
          label="Duplicate"
          value={release.duplicateScanStatus}
          fallback="Unknown"
          kind="scan"
        />
      </div>
    </div>
  );
}

function RightsBadge({
  label,
  value,
  fallback,
  kind,
}: {
  label: string;
  value: string | null | undefined;
  fallback: string;
  kind: "review" | "scan";
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.13em] ${rightsBadgeClass(
        value,
        kind
      )}`}
      title={`${label}: ${formatRightsValue(value, fallback)}`}
    >
      {label}: {formatRightsValue(value, fallback)}
    </span>
  );
}

function QuickActions({
  canEditLyrics,
  onOpen,
  onLyrics,
}: {
  canEditLyrics: boolean;
  onOpen: () => void;
  onLyrics: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={onOpen}
        className="rounded-full bg-yellow-300 px-4 py-2 text-xs font-black uppercase tracking-widest text-black transition hover:-translate-y-0.5"
      >
        Open Release
      </button>
      <button
        onClick={onLyrics}
        disabled={!canEditLyrics}
        className="rounded-full border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/75 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-35"
      >
        Edit Lyrics
      </button>
      <button
        type="button"
        className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/45"
        title="More release operations will be added in a later phase."
      >
        More
      </button>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/30 xl:hidden">
        {label}
      </p>
      <p className="truncate text-sm font-bold text-white/66">{value}</p>
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <section className="rounded-[2.25rem] border border-white/10 bg-[#101017]/90 p-8 text-center shadow-2xl sm:p-12">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] border border-yellow-300/20 bg-yellow-300/10 text-2xl">
        +
      </div>
      <p className="mt-6 text-xs font-black uppercase tracking-[0.32em] text-yellow-200">
        No releases yet
      </p>
      <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
        Build the first release row
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/55">
        Albums uploaded through the studio will appear here as compact release
        operations records.
      </p>
      <button
        onClick={onUpload}
        className="mt-7 rounded-2xl bg-yellow-300 px-6 py-4 text-sm font-black text-black transition hover:-translate-y-0.5"
      >
        Open Upload Studio
      </button>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4">
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/38">
        {label}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${statusClass(
        status
      )}`}
    >
      {status}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <p className="truncate text-sm font-black">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/35">
        {label}
      </p>
    </div>
  );
}
