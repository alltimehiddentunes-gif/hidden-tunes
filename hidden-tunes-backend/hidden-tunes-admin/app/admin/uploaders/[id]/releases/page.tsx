"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { UploaderAnalyticsPanel } from "@/components/UploaderAnalyticsPanel";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import { formatRightsValue } from "@/lib/rightsReview";
import type { UploaderAnalyticsSummary } from "@/lib/uploaderAnalytics";

type ReleaseSummary = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  trackCount: number;
  primaryGenre: string | null;
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

type UploaderProfile = {
  id: string;
  email: string | null;
  role: string | null;
  status: string | null;
};

type UploaderAnalyticsApiResponse = {
  success: boolean;
  analytics?: UploaderAnalyticsSummary;
  error?: string;
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

function getParamId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

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

function badgeTone(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();

  if (normalized === "approved" || normalized === "published") {
    return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  }
  if (normalized.includes("flagged") || normalized === "rejected") {
    return "border-red-300/20 bg-red-500/10 text-red-100";
  }
  if (normalized === "pending_review" || normalized === "draft") {
    return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
  }
  return "border-white/10 bg-white/[0.06] text-white/62";
}

export default function UploaderReleasesPage() {
  const router = useRouter();
  const params = useParams<{ id?: string | string[] }>();
  const uploaderId = getParamId(params.id);
  const [uploader, setUploader] = useState<UploaderProfile | null>(null);
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [pagination, setPagination] =
    useState<PaginationState>(DEFAULT_PAGINATION);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [analytics, setAnalytics] = useState<UploaderAnalyticsSummary | null>(null);

  const summary = useMemo(
    () => ({
      tracks: releases.reduce((total, release) => total + release.trackCount, 0),
      flagged: releases.filter((release) =>
        String(release.reviewStatus || "").includes("flagged")
      ).length,
    }),
    [releases]
  );

  const loadData = useCallback(async () => {
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

    const [
      { data: uploaderData, error: uploaderError },
      releasesResponse,
      analyticsResponse,
    ] = await Promise.all([
      supabase
        .from("uploader_profiles")
        .select("id, email, role, status")
        .eq("id", uploaderId)
        .maybeSingle(),
      fetch(
        `/api/admin/releases?uploaderId=${encodeURIComponent(
          uploaderId
        )}&page=${page}&pageSize=50`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      ),
      fetch(`/api/admin/uploaders/${encodeURIComponent(uploaderId)}/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    if (uploaderError) throw uploaderError;

    const releasesData = (await releasesResponse.json().catch(() => null)) as
      | ReleasesResponse
      | null;

    if (!releasesResponse.ok || !releasesData?.success) {
      throw new Error(releasesData?.error || "Could not load uploader releases.");
    }

    const analyticsData = (await analyticsResponse.json().catch(() => null)) as
      | UploaderAnalyticsApiResponse
      | null;

    setUploader((uploaderData || null) as UploaderProfile | null);
    setReleases(releasesData.releases || []);
    setAnalytics(
      analyticsResponse.ok && analyticsData?.success && analyticsData.analytics
        ? analyticsData.analytics
        : null
    );
    setPagination({
      ...DEFAULT_PAGINATION,
      ...releasesData.pagination,
      page: releasesData.pagination?.page || page,
      pageSize: releasesData.pagination?.pageSize || 50,
    });
  }, [page, router, uploaderId]);

  useEffect(() => {
    let ignore = false;

    async function boot() {
      setIsLoading(true);
      setPageError("");

      try {
        await loadData();
      } catch (error: unknown) {
        if (ignore) return;
        setPageError(
          error instanceof Error ? error.message : "Uploader releases could not load."
        );
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    if (uploaderId) boot();

    return () => {
      ignore = true;
    };
  }, [loadData, uploaderId]);

  return (
    <AdminShell
      eyebrow="Uploader Uploads"
      title={uploader?.email || "Uploader releases"}
      description={`${uploader?.role || "Unknown role"} / ${
        uploader?.status || "unknown status"
      }`}
      actions={
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => router.push("/admin/uploaders")}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75 transition hover:border-white/25"
          >
            All Uploaders
          </button>
          <button
            onClick={() => router.push("/admin/releases")}
            className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black transition hover:-translate-y-0.5"
          >
            All Releases
          </button>
        </div>
      }
    >
      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric
          label="Releases"
          value={String(analytics?.totalReleases ?? pagination.total)}
        />
        <Metric
          label="Tracks"
          value={String(analytics?.totalTracks ?? summary.tracks)}
        />
        <Metric label="Flagged" value={String(summary.flagged)} />
      </section>

      {analytics ? <UploaderAnalyticsPanel analytics={analytics} /> : null}

      {pageError ? (
        <section className="mb-4 rounded-[1.7rem] border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
          {pageError}
        </section>
      ) : null}

      {isLoading ? (
        <section className="rounded-[1.7rem] border border-white/10 bg-[#101017]/92 p-5 text-sm font-bold text-white/50">
          Loading uploader releases...
        </section>
      ) : releases.length === 0 ? (
        <section className="rounded-[2rem] border border-white/10 bg-[#101017]/92 p-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
            No uploads found
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
            This uploader has no tracked releases yet.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/50">
            Existing legacy rows may not have uploader ownership until they are
            backfilled or recreated under the new tracking flow.
          </p>
        </section>
      ) : (
        <section className="min-w-0 overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#101017]/92 shadow-2xl">
          <div className="hidden grid-cols-[minmax(260px,1.4fr)_0.5fr_0.7fr_0.8fr_0.8fr_0.8fr_120px] gap-3 border-b border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/35 xl:grid">
            <span>Release</span>
            <span>Tracks</span>
            <span>Genre</span>
            <span>Review</span>
            <span>License</span>
            <span>Date</span>
            <span>Action</span>
          </div>
          <div className="divide-y divide-white/8">
            {releases.map((release) => (
              <article
                key={release.id}
              className="grid min-w-0 gap-3 px-4 py-3 transition hover:bg-white/[0.035] xl:grid-cols-[minmax(0,1.4fr)_minmax(80px,0.5fr)_minmax(100px,0.7fr)_minmax(110px,0.8fr)_minmax(110px,0.8fr)_minmax(110px,0.8fr)_minmax(88px,120px)] xl:items-center"
              >
                <ReleaseIdentity release={release} />
                <InfoCell label="Tracks" value={String(release.trackCount)} />
                <InfoCell label="Genre" value={release.primaryGenre || "Unknown"} />
                <StatusBadge
                  label="Review"
                  value={release.reviewStatus}
                  fallback="Not reviewed"
                />
                <StatusBadge
                  label="License"
                  value={release.licenseDeclaration}
                  fallback="Unknown"
                />
                <InfoCell
                  label="Date"
                  value={formatDate(release.updatedAt || release.createdAt)}
                />
                <button
                  onClick={() => router.push(`/admin/releases/${release.id}`)}
                  className="w-fit rounded-full bg-yellow-300 px-4 py-2 text-xs font-black uppercase tracking-widest text-black transition hover:-translate-y-0.5"
                >
                  Open
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {!isLoading && releases.length > 0 ? (
        <section className="mt-4 flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-[#101017]/80 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-white/50">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={!pagination.hasPreviousPage}
              className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/70 disabled:opacity-35"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((value) => value + 1)}
              disabled={!pagination.hasNextPage}
              className="rounded-2xl bg-yellow-300 px-4 py-2 text-xs font-black uppercase tracking-widest text-black disabled:opacity-35"
            >
              Next
            </button>
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}

function ReleaseIdentity({ release }: { release: ReleaseSummary }) {
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
        <h2 className="break-words text-base font-black tracking-[-0.02em]">
          {release.title}
        </h2>
        <p className="break-words text-sm font-bold text-white/50">
          {release.artist}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({
  label,
  value,
  fallback,
}: {
  label: string;
  value: string | null | undefined;
  fallback: string;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/30 xl:hidden">
        {label}
      </p>
      <span
        className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.13em] ${badgeTone(
          value
        )}`}
      >
        <span className="break-words">{formatRightsValue(value, fallback)}</span>
      </span>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/30 xl:hidden">
        {label}
      </p>
      <p className="break-words text-sm font-bold text-white/66">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4">
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/38">
        {label}
      </p>
    </div>
  );
}
