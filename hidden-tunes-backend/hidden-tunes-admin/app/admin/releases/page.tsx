"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession, supabase } from "@/lib/auth";

type ReleaseSummary = {
  id: string;
  title: string;
  slug: string | null;
  artist: string;
  artworkUrl: string | null;
  releaseYear: string | number | null;
  createdAt: string | null;
  trackCount: number;
  totalDuration: number;
  audioReadyCount: number;
  artworkReadyCount: number;
  lyricsReadyCount: number;
};

type ReleasesResponse = {
  success: boolean;
  releases?: ReleaseSummary[];
  error?: string;
};

function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function releaseStatus(release: ReleaseSummary) {
  if (!release.trackCount) return "No tracks";
  if (release.audioReadyCount < release.trackCount) return "Needs audio";
  if (release.artworkReadyCount < release.trackCount) return "Needs artwork";
  return "Ready";
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

function formatDate(value: string | null) {
  if (!value) return "Recent";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function AdminReleasesPage() {
  const router = useRouter();
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

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

  return (
    <AdminShell
      title="Releases"
      description="Review releases, open artist-ready release dashboards, and manage track assets from one premium operations hub."
      actions={
        <button
          onClick={() => router.push("/admin/upload")}
          className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black shadow-[0_18px_45px_rgba(250,204,21,0.14)] transition hover:-translate-y-0.5"
        >
          Upload Music
        </button>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Releases" value={String(totals.releases)} />
        <MetricCard label="Tracks" value={String(totals.tracks)} />
        <MetricCard label="Ready" value={String(totals.ready)} />
        <MetricCard label="Review" value={String(totals.review)} />
      </div>

      {pageError ? (
        <section className="mb-5 rounded-[2rem] border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
          {pageError}
        </section>
      ) : null}

      {isLoading ? (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-[460px] rounded-[2rem] border border-white/10 bg-white/[0.035]"
            />
          ))}
        </section>
      ) : releases.length === 0 ? (
        <section className="rounded-[2.25rem] border border-white/10 bg-[#101017]/90 p-8 text-center shadow-2xl sm:p-12">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-yellow-300/20 bg-yellow-300/10 text-3xl">
            +
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.32em] text-yellow-200">
            No releases yet
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.04em]">
            Build the first release room
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/55">
            Once songs are uploaded into albums, they appear here as polished
            release dashboards for upload managers and artists.
          </p>
          <button
            onClick={() => router.push("/admin/upload")}
            className="mt-7 rounded-2xl bg-yellow-300 px-6 py-4 text-sm font-black text-black transition hover:-translate-y-0.5"
          >
            Open Upload Studio
          </button>
        </section>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {releases.map((release) => {
            const status = releaseStatus(release);
            const completion =
              release.trackCount > 0
                ? Math.round(
                    ((release.audioReadyCount + release.artworkReadyCount) /
                      (release.trackCount * 2)) *
                      100
                  )
                : 0;

            return (
              <article
                key={release.id}
                className="group overflow-hidden rounded-[2.15rem] border border-white/10 bg-[#101017]/92 shadow-[0_24px_70px_rgba(0,0,0,0.34)] transition duration-300 hover:-translate-y-1 hover:border-yellow-300/25"
              >
                <button
                  onClick={() => router.push(`/admin/releases/${release.id}`)}
                  className="block w-full text-left"
                >
                  <div className="relative overflow-hidden">
                    <div
                      className="aspect-square bg-[#14141c] bg-cover bg-center transition duration-500 group-hover:scale-[1.035]"
                      style={{
                        backgroundImage: release.artworkUrl
                          ? `url("${release.artworkUrl}")`
                          : "linear-gradient(135deg,rgba(250,204,21,0.24),rgba(168,85,247,0.12),rgba(255,255,255,0.04))",
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-transparent" />
                    <div className="absolute left-4 top-4">
                      <StatusBadge status={status} />
                    </div>
                  </div>

                  <div className="p-5">
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">
                      {formatDate(release.createdAt)}
                    </p>
                    <h2 className="mt-2 line-clamp-2 min-h-[64px] text-2xl font-black tracking-[-0.035em]">
                      {release.title}
                    </h2>
                    <p className="mt-1 text-sm font-bold text-white/55">
                      {release.artist}
                    </p>

                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-white/35">
                        <span>Asset readiness</span>
                        <span>{completion}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-emerald-300"
                          style={{ width: `${completion}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <MiniStat label="Tracks" value={String(release.trackCount)} />
                      <MiniStat
                        label="Runtime"
                        value={formatDuration(release.totalDuration)}
                      />
                      <MiniStat
                        label="Lyrics"
                        value={`${release.lyricsReadyCount}/${release.trackCount}`}
                      />
                    </div>

                    <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <span className="text-sm font-black text-white">
                        Open detail
                      </span>
                      <span className="text-lg text-yellow-200">{"->"}</span>
                    </div>
                  </div>
                </button>
              </article>
            );
          })}
        </section>
      )}
    </AdminShell>
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
      className={`rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] backdrop-blur-xl ${statusClass(
        status
      )}`}
    >
      {status}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <p className="text-sm font-black">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/35">
        {label}
      </p>
    </div>
  );
}
