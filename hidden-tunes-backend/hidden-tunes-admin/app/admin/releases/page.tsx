"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import {
  formatRightsValue,
  LICENSE_DECLARATIONS,
  RELEASE_REVIEW_STATUSES,
} from "@/lib/rightsReview";

type ViewMode = "compact" | "grid";
type SortMode = "newest" | "oldest" | "title_asc" | "title_desc";

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

type PaginationState = {
  page: number;
  pageSize: number;
  returned: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type ReleasesResponse = {
  success: boolean;
  releases?: ReleaseSummary[];
  error?: string;
  pagination?: Partial<PaginationState>;
};

const DEFAULT_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 50,
  returned: 0,
  total: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const SCAN_FILTERS = [
  { value: "all", label: "All scans" },
  { value: "copyright_flagged", label: "Copyright flagged" },
  { value: "duplicate_flagged", label: "Duplicate flagged" },
  { value: "copyright_not_scanned", label: "Copyright not scanned" },
  { value: "duplicate_not_scanned", label: "Duplicate not scanned" },
] as const;

function formatDate(value: string | null) {
  if (!value) return "Recent";

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Recent";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(time));
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function releaseAssetStatus(release: ReleaseSummary) {
  if (!release.trackCount) return "No tracks";
  if (release.audioReadyCount < release.trackCount) return "Needs audio";
  if (release.artworkReadyCount < release.trackCount) return "Needs artwork";
  return "Ready";
}

function badgeTone(value: string | null | undefined, kind: "asset" | "review" | "scan") {
  const normalized = String(value || "").toLowerCase();

  if (
    normalized === "ready" ||
    normalized === "approved" ||
    normalized === "published" ||
    normalized === "clear"
  ) {
    return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  }

  if (
    normalized.includes("flagged") ||
    normalized === "rejected" ||
    normalized === "takedown_requested"
  ) {
    return "border-red-300/20 bg-red-500/10 text-red-100";
  }

  if (
    normalized === "needs audio" ||
    normalized === "needs artwork" ||
    normalized === "pending_review" ||
    normalized === "draft"
  ) {
    return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
  }

  if (kind === "scan" && (normalized === "not_scanned" || !normalized)) {
    return "border-white/10 bg-white/[0.045] text-white/45";
  }

  return "border-white/10 bg-white/[0.06] text-white/62";
}

function optionLabel(value: string) {
  return formatRightsValue(value, "Unknown");
}

export default function AdminReleasesPage() {
  const router = useRouter();
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [pagination, setPagination] =
    useState<PaginationState>(DEFAULT_PAGINATION);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [licenseFilter, setLicenseFilter] = useState("all");
  const [scanFilter, setScanFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const totals = useMemo(
    () => ({
      loaded: releases.length,
      tracks: releases.reduce((total, release) => total + release.trackCount, 0),
      ready: releases.filter((release) => releaseAssetStatus(release) === "Ready")
        .length,
      rights: releases.filter((release) => release.reviewStatus).length,
    }),
    [releases]
  );

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

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(DEFAULT_PAGINATION.pageSize),
      sort: sortMode,
    });

    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (reviewStatus !== "all") params.set("status", reviewStatus);
    if (licenseFilter !== "all") params.set("license", licenseFilter);
    if (scanFilter !== "all") params.set("scan", scanFilter);

    const response = await fetch(`/api/admin/releases?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json().catch(() => null)) as
      | ReleasesResponse
      | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error || "Could not load releases.");
    }

    setReleases(data.releases || []);
    setPagination({
      ...DEFAULT_PAGINATION,
      ...data.pagination,
      page: data.pagination?.page || page,
      pageSize: data.pagination?.pageSize || DEFAULT_PAGINATION.pageSize,
    });
  }, [licenseFilter, page, reviewStatus, router, scanFilter, searchQuery, sortMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearchQuery(searchInput.trim());
    }, 280);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let ignore = false;

    async function boot() {
      setIsLoading(true);
      setPageError("");

      try {
        await loadReleases();
      } catch (error: unknown) {
        if (ignore) return;
        setPageError(
          error instanceof Error
            ? error.message
            : "Releases could not load. Please refresh and try again."
        );
        setReleases([]);
        setPagination(DEFAULT_PAGINATION);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    boot();

    return () => {
      ignore = true;
    };
  }, [loadReleases, refreshKey]);

  function resetPagedFilter(update: () => void) {
    setPage(1);
    update();
  }

  function openLyrics(release: ReleaseSummary) {
    if (!release.primaryTrackId) return;
    router.push(`/admin/releases/${release.id}/tracks/${release.primaryTrackId}/lyrics`);
  }

  return (
    <AdminShell
      title="Releases"
      description="A compact music operations dashboard for managing a growing catalog without gallery-style overload."
      actions={
        <button
          onClick={() => router.push("/admin/upload")}
          className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black shadow-[0_18px_45px_rgba(250,204,21,0.14)] transition hover:-translate-y-0.5"
        >
          Upload Music
        </button>
      }
    >
      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Results" value={compactNumber(pagination.total)} />
        <MetricCard label="Loaded Page" value={String(totals.loaded)} />
        <MetricCard label="Tracks Loaded" value={compactNumber(totals.tracks)} />
        <MetricCard label="Rights Rows" value={String(totals.rights)} />
      </section>

      <section className="mb-4 rounded-[1.7rem] border border-white/10 bg-[#101017]/92 p-3 shadow-2xl">
        <div className="grid gap-2 xl:grid-cols-[1.4fr_0.75fr_0.75fr_0.85fr_0.7fr_auto_auto]">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search release title or artist..."
            className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm outline-none transition placeholder:text-white/30 focus:border-yellow-300/50"
          />

          <select
            value={reviewStatus}
            onChange={(event) =>
              resetPagedFilter(() => setReviewStatus(event.target.value))
            }
            className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm outline-none transition focus:border-yellow-300/50"
          >
            <option value="all">All statuses</option>
            {RELEASE_REVIEW_STATUSES.map((status) => (
              <option key={status} value={status}>
                {optionLabel(status)}
              </option>
            ))}
          </select>

          <select
            value={licenseFilter}
            onChange={(event) =>
              resetPagedFilter(() => setLicenseFilter(event.target.value))
            }
            className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm outline-none transition focus:border-yellow-300/50"
          >
            <option value="all">All licenses</option>
            {LICENSE_DECLARATIONS.map((license) => (
              <option key={license} value={license}>
                {optionLabel(license)}
              </option>
            ))}
          </select>

          <select
            value={scanFilter}
            onChange={(event) =>
              resetPagedFilter(() => setScanFilter(event.target.value))
            }
            className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm outline-none transition focus:border-yellow-300/50"
          >
            {SCAN_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>

          <select
            value={sortMode}
            onChange={(event) =>
              resetPagedFilter(() => setSortMode(event.target.value as SortMode))
            }
            className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm outline-none transition focus:border-yellow-300/50"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title_asc">Title A-Z</option>
            <option value="title_desc">Title Z-A</option>
          </select>

          <div className="grid h-11 grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/25 p-1">
            {(["compact", "grid"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`rounded-xl px-3 text-xs font-black uppercase tracking-widest transition ${
                  viewMode === mode
                    ? "bg-yellow-300 text-black"
                    : "text-white/55 hover:text-white"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={() => setRefreshKey((value) => value + 1)}
            className="h-11 rounded-2xl border border-white/10 bg-white/[0.055] px-4 text-xs font-black uppercase tracking-widest text-white/75 transition hover:border-white/25"
          >
            Refresh
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-2 text-xs text-white/38 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Page {pagination.page} of {pagination.totalPages} / showing{" "}
            {pagination.returned} releases at {pagination.pageSize} per page.
          </p>
          <p>Rights badges are display-only. Scanning remains a later phase.</p>
        </div>
      </section>

      {pageError ? (
        <section className="mb-4 rounded-[1.7rem] border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
          {pageError}
        </section>
      ) : null}

      {isLoading ? (
        <LoadingRows />
      ) : releases.length === 0 ? (
        searchQuery || reviewStatus !== "all" || licenseFilter !== "all" || scanFilter !== "all" ? (
          <NoMatchesState />
        ) : (
          <EmptyState onUpload={() => router.push("/admin/upload")} />
        )
      ) : viewMode === "compact" ? (
        <CompactReleaseTable
          releases={releases}
          onOpen={(release) => router.push(`/admin/releases/${release.id}`)}
          onLyrics={openLyrics}
        />
      ) : (
        <CompactGrid
          releases={releases}
          onOpen={(release) => router.push(`/admin/releases/${release.id}`)}
          onLyrics={openLyrics}
        />
      )}

      {!isLoading && releases.length > 0 ? (
        <PaginationControls
          pagination={pagination}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => value + 1)}
        />
      ) : null}
    </AdminShell>
  );
}

function CompactReleaseTable({
  releases,
  onOpen,
  onLyrics,
}: {
  releases: ReleaseSummary[];
  onOpen: (release: ReleaseSummary) => void;
  onLyrics: (release: ReleaseSummary) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#101017]/92 shadow-2xl">
      <div className="hidden grid-cols-[minmax(260px,1.45fr)_0.45fr_0.65fr_0.82fr_0.82fr_0.82fr_0.82fr_0.72fr_128px] gap-3 border-b border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/35 2xl:grid">
        <span>Release</span>
        <span>Tracks</span>
        <span>Genre</span>
        <span>Review</span>
        <span>License</span>
        <span>Copyright</span>
        <span>Duplicate</span>
        <span>Date</span>
        <span>Action</span>
      </div>

      <div className="divide-y divide-white/8">
        {releases.map((release) => (
          <ReleaseRow
            key={release.id}
            release={release}
            onOpen={() => onOpen(release)}
            onLyrics={() => onLyrics(release)}
          />
        ))}
      </div>
    </section>
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
  return (
    <article className="grid gap-3 px-4 py-3 transition hover:bg-white/[0.035] 2xl:grid-cols-[minmax(260px,1.45fr)_0.45fr_0.65fr_0.82fr_0.82fr_0.82fr_0.82fr_0.72fr_128px] 2xl:items-center">
      <ReleaseIdentity release={release} />
      <InfoCell label="Tracks" value={String(release.trackCount)} />
      <InfoCell label="Genre" value={release.primaryGenre || "Unknown"} />
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
      <InfoCell label="Date" value={formatDate(release.updatedAt || release.createdAt)} />
      <QuickActions
        canEditLyrics={Boolean(release.primaryTrackId)}
        onOpen={onOpen}
        onLyrics={onLyrics}
      />
    </article>
  );
}

function CompactGrid({
  releases,
  onOpen,
  onLyrics,
}: {
  releases: ReleaseSummary[];
  onOpen: (release: ReleaseSummary) => void;
  onLyrics: (release: ReleaseSummary) => void;
}) {
  return (
    <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {releases.map((release) => (
        <article
          key={release.id}
          className="rounded-[1.5rem] border border-white/10 bg-[#101017]/92 p-4 shadow-xl transition hover:-translate-y-0.5 hover:border-yellow-300/20"
        >
          <ReleaseIdentity release={release} />

          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniStat label="Tracks" value={String(release.trackCount)} />
            <MiniStat label="Genre" value={release.primaryGenre || "Unknown"} />
            <MiniStat label="Date" value={formatDate(release.updatedAt || release.createdAt)} />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
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

          <div className="mt-4">
            <QuickActions
              canEditLyrics={Boolean(release.primaryTrackId)}
              onOpen={() => onOpen(release)}
              onLyrics={() => onLyrics(release)}
            />
          </div>
        </article>
      ))}
    </section>
  );
}

function ReleaseIdentity({ release }: { release: ReleaseSummary }) {
  const assetStatus = releaseAssetStatus(release);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="h-14 w-14 shrink-0 rounded-2xl border border-white/10 bg-[#14141c] bg-cover bg-center"
        style={{
          backgroundImage: release.artworkUrl
            ? `url("${release.artworkUrl}")`
            : "linear-gradient(135deg,rgba(250,204,21,0.22),rgba(168,85,247,0.1),rgba(255,255,255,0.04))",
        }}
      />
      <div className="min-w-0">
        <h2 className="truncate text-base font-black tracking-[-0.02em]">
          {release.title}
        </h2>
        <p className="truncate text-sm font-bold text-white/50">{release.artist}</p>
        <span
          className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${badgeTone(
            assetStatus,
            "asset"
          )}`}
        >
          {assetStatus}
        </span>
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
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/30 2xl:hidden">
        {label}
      </p>
      <span
        className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.13em] ${badgeTone(
          value,
          kind
        )}`}
        title={`${label}: ${formatRightsValue(value, fallback)}`}
      >
        <span className="truncate">{formatRightsValue(value, fallback)}</span>
      </span>
    </div>
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
        Open
      </button>
      <button
        onClick={onLyrics}
        disabled={!canEditLyrics}
        className="rounded-full border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/65 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-35"
      >
        Lyrics
      </button>
    </div>
  );
}

function PaginationControls({
  pagination,
  onPrevious,
  onNext,
}: {
  pagination: PaginationState;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <section className="mt-4 flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-[#101017]/80 p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-white/50">
        Showing page {pagination.page} of {pagination.totalPages} for{" "}
        {compactNumber(pagination.total)} matching releases.
      </p>
      <div className="flex gap-2">
        <button
          onClick={onPrevious}
          disabled={!pagination.hasPreviousPage}
          className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/70 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-35"
        >
          Previous
        </button>
        <button
          onClick={onNext}
          disabled={!pagination.hasNextPage}
          className="rounded-2xl bg-yellow-300 px-4 py-2 text-xs font-black uppercase tracking-widest text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
        >
          Next
        </button>
      </div>
    </section>
  );
}

function LoadingRows() {
  return (
    <section className="overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#101017]/92">
      {[0, 1, 2, 3, 4, 5, 6].map((item) => (
        <div
          key={item}
          className="flex items-center gap-3 border-b border-white/8 px-4 py-3 last:border-b-0"
        >
          <div className="h-14 w-14 rounded-2xl bg-white/[0.06]" />
          <div className="flex-1">
            <div className="h-4 w-56 max-w-full rounded-full bg-white/[0.06]" />
            <div className="mt-2 h-3 w-36 max-w-full rounded-full bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </section>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#101017]/90 p-8 text-center shadow-2xl sm:p-12">
      <p className="text-xs font-black uppercase tracking-[0.32em] text-yellow-200">
        No releases yet
      </p>
      <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
        Uploads will appear as compact operations rows
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/55">
        Once music is uploaded, this dashboard will show release state, rights
        metadata, scan readiness, and quick navigation in one dense view.
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

function NoMatchesState() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#101017]/92 p-8 text-center">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
        No matches
      </p>
      <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
        No releases match your filters.
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/50">
        Adjust the search, status, license, scan, or sort controls and refresh
        the current operations view.
      </p>
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

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/30 2xl:hidden">
        {label}
      </p>
      <p className="truncate text-sm font-bold text-white/66">{value}</p>
    </div>
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
