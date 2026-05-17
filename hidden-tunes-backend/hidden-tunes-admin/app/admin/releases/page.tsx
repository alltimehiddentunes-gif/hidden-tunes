"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

    if (!token) {
      throw new Error("Your admin session expired. Sign in again.");
    }

    const response = await fetch("/api/admin/releases", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
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

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#050508] px-5 py-8 text-white">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-yellow-300">
            Hidden Tunes Admin
          </p>
          <h1 className="mt-4 text-3xl font-black">Loading releases...</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050508] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.2),transparent_34%),linear-gradient(135deg,#191922,#08080d_62%,#000)] p-6 shadow-2xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-yellow-300">
                Hidden Tunes Admin
              </p>
              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
                Releases
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Review uploaded releases, open premium release detail pages, and
                manage track assets with safe replacement controls.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-3xl border border-white/10 bg-white/[0.05] p-3 text-center">
              <Stat label="Releases" value={String(totals.releases)} />
              <Stat label="Tracks" value={String(totals.tracks)} />
              <Stat label="Ready" value={String(totals.ready)} />
            </div>
          </div>
        </header>

        {pageError ? (
          <section className="rounded-[2rem] border border-red-400/20 bg-red-500/10 p-5 text-red-100">
            {pageError}
          </section>
        ) : null}

        {releases.length === 0 ? (
          <section className="rounded-[2rem] border border-white/10 bg-[#101017] p-8 text-center shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-white/35">
              No releases yet
            </p>
            <h2 className="mt-3 text-3xl font-black">Upload a release first</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/50">
              Once songs are uploaded into albums, they will appear here as
              release dashboards.
            </p>
            <button
              onClick={() => router.push("/admin/upload")}
              className="mt-6 rounded-2xl bg-yellow-300 px-5 py-4 text-sm font-black text-black"
            >
              Open Upload Studio
            </button>
          </section>
        ) : (
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {releases.map((release) => (
              <article
                key={release.id}
                className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#101017] shadow-xl transition hover:-translate-y-0.5 hover:border-yellow-300/30"
              >
                <div
                  className="aspect-square bg-[#14141c] bg-cover bg-center"
                  style={{
                    backgroundImage: release.artworkUrl
                      ? `url("${release.artworkUrl}")`
                      : "linear-gradient(135deg,rgba(250,204,21,0.22),rgba(255,255,255,0.05))",
                  }}
                />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300">
                        {releaseStatus(release)}
                      </p>
                      <h2 className="mt-2 line-clamp-2 text-2xl font-black">
                        {release.title}
                      </h2>
                      <p className="mt-1 text-sm font-bold text-white/55">
                        {release.artist}
                      </p>
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

                  <button
                    onClick={() => router.push(`/admin/releases/${release.id}`)}
                    className="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-sm font-black text-black transition hover:scale-[1.01]"
                  >
                    Open Release Detail
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-20">
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs text-white/45">{label}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="text-sm font-black">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">
        {label}
      </p>
    </div>
  );
}
