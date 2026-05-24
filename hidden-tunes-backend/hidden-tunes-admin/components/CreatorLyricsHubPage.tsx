"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import { canEditAllTrackLyrics } from "@/lib/adminPermissions";

type CreatorTrack = {
  trackId: string;
  releaseId: string;
  trackTitle: string;
  releaseTitle: string;
  hasLyrics: boolean;
  lyricsType: string | null;
  artworkUrl: string | null;
  plainLyricsPath: string;
  syncedLyricsPath: string;
};

type CreatorTracksResponse = {
  success: boolean;
  error?: string;
  note?: string | null;
  scope?: "all" | "owned";
  role?: string | null;
  tracks?: CreatorTrack[];
};

export default function CreatorLyricsHubPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [tracks, setTracks] = useState<CreatorTrack[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "owned">("owned");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadTracks = useCallback(async (token: string) => {
    const response = await fetch("/api/admin/creator/lyrics-tracks", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json().catch(() => null)) as CreatorTracksResponse | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error || "Creator lyrics hub could not load.");
    }

    setTracks(data.tracks || []);
    setNote(data.note || null);
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
        await loadTracks(token);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : "Creator lyrics hub could not load."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void boot();
  }, [loadTracks, router]);

  const filteredTracks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tracks;

    return tracks.filter((track) => {
      const haystack = `${track.trackTitle} ${track.releaseTitle}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [search, tracks]);

  const isAdminScope = canEditAllTrackLyrics(role);

  return (
    <AdminShell
      title="Creator Lyrics"
      description="Edit plain and synced lyrics for songs you are allowed to manage."
      actions={
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push("/admin/creator/bulk-lyrics")}
            className="rounded-2xl bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 px-5 py-3 text-sm font-black text-black"
          >
            Bulk Lyrics Intake
          </button>
          {accessToken ? (
            <button
              type="button"
              onClick={() => void loadTracks(accessToken)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75"
            >
              Refresh
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
              {isAdminScope ? "Admin scope" : "Owned tracks"}
            </p>
            <h2 className="mt-2 text-2xl font-black">
              {scope === "all" ? "All catalog tracks" : "Your editable songs"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-white/58">
              Plain lyrics, assisted Auto Sync, and premium synced editing use the same
              save format as the admin tools. API permissions are enforced server-side.
            </p>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search track or release"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none focus:border-violet-300/35 lg:max-w-sm"
          />
        </div>

        {note ? (
          <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {note}
          </p>
        ) : null}

        {isLoading ? (
          <div className="mt-5 h-48 animate-pulse rounded-[1.5rem] bg-white/[0.05]" />
        ) : filteredTracks.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-white/10 bg-black/25 px-4 py-8 text-center text-sm text-white/60">
            No editable tracks found for this account yet.
          </p>
        ) : (
          <div className="mt-5 grid gap-3">
            {filteredTracks.map((track) => (
              <article
                key={track.trackId}
                className="rounded-[1.4rem] border border-white/10 bg-black/25 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
                      {track.releaseTitle}
                    </p>
                    <h3 className="mt-2 text-xl font-black text-white">{track.trackTitle}</h3>
                    <p className="mt-2 text-sm text-white/55">
                      {track.hasLyrics
                        ? `Lyrics ready (${track.lyricsType || "unknown"})`
                        : "No lyrics saved yet"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(track.plainLyricsPath)}
                      className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-black text-white/82"
                    >
                      Plain Lyrics
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(track.syncedLyricsPath)}
                      className="rounded-2xl bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 px-4 py-3 text-sm font-black text-black"
                    >
                      Synced Lyrics
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
