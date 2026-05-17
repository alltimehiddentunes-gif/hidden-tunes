"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { getActiveUploaderSession, supabase } from "@/lib/auth";

type ReleaseTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string | null;
  mood: string | null;
  duration: number;
  audioUrl: string | null;
  artworkUrl: string | null;
  audioKey: string | null;
  artworkKey: string | null;
  lyricsUrl: string | null;
  hasLyrics: boolean;
  lyricsType: string | null;
  sourceName: string | null;
  sourceType: string | null;
  isOnline: boolean;
  createdAt: string | null;
};

type ReleaseDetail = {
  id: string;
  title: string;
  slug: string | null;
  artist: string;
  artistId: string | null;
  artworkUrl: string | null;
  releaseYear: string | number | null;
  createdAt: string | null;
  tracks: ReleaseTrack[];
};

type ReleaseResponse = {
  success: boolean;
  release?: ReleaseDetail;
  error?: string;
};

type UploadResponse = {
  success: boolean;
  key?: string;
  publicUrl?: string;
  error?: string;
};

type UpdateResponse = {
  success: boolean;
  message?: string;
  track?: Partial<ReleaseTrack>;
  error?: string;
};

type SwapKind = "audio" | "artwork";

type PendingSwap = {
  track: ReleaseTrack;
  kind: SwapKind;
  file: File;
};

type TrackUploadState = {
  status: "idle" | "uploading" | "success" | "error";
  progress: number;
  message: string;
};

function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getParamId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function assetStatusLabel(track: ReleaseTrack) {
  const parts = [
    track.audioUrl ? "Audio live" : "Audio missing",
    track.artworkUrl ? "Artwork live" : "Artwork missing",
    track.hasLyrics ? "Lyrics ready" : "No lyrics",
  ];

  return parts.join(" / ");
}

function statusTone(track: ReleaseTrack) {
  if (!track.audioUrl) return "Needs audio";
  if (!track.artworkUrl) return "Needs artwork";
  if (!track.hasLyrics) return "Lyrics optional";
  return "Ready";
}

function authHeader(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export default function AdminReleaseDetailPage() {
  const router = useRouter();
  const params = useParams<{ id?: string | string[] }>();
  const releaseId = getParamId(params.id);

  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [pendingSwap, setPendingSwap] = useState<PendingSwap | null>(null);
  const [trackStates, setTrackStates] = useState<Record<string, TrackUploadState>>(
    {}
  );

  const totalDuration = useMemo(
    () =>
      release?.tracks.reduce((total, track) => total + (track.duration || 0), 0) ||
      0,
    [release]
  );

  const releaseStatus = useMemo(() => {
    if (!release) return "Loading";
    if (release.tracks.length === 0) return "No tracks";
    if (release.tracks.some((track) => !track.audioUrl)) return "Needs audio";
    if (release.tracks.some((track) => !track.artworkUrl)) return "Needs artwork";
    return "Release ready";
  }, [release]);

  const loadRelease = useCallback(
    async (token: string) => {
      const response = await fetch(`/api/admin/releases/${releaseId}`, {
        headers: authHeader(token),
      });
      const data = (await response.json().catch(() => null)) as
        | ReleaseResponse
        | null;

      if (!response.ok || !data?.success || !data.release) {
        throw new Error(data?.error || "Could not load release.");
      }

      setRelease(data.release);
    },
    [releaseId]
  );

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
          throw new Error("Your admin session expired. Sign in again.");
        }

        setAccessToken(token);
        await loadRelease(token);
      } catch (error: unknown) {
        setPageError(
          error instanceof Error ? error.message : "Release detail could not load."
        );
      } finally {
        setIsLoading(false);
      }
    }

    if (releaseId) {
      boot();
    }
  }, [loadRelease, releaseId, router]);

  function setTrackUploadState(trackId: string, patch: Partial<TrackUploadState>) {
    setTrackStates((current) => ({
      ...current,
      [trackId]: {
        ...current[trackId],
        status: "idle",
        progress: 0,
        message: "",
        ...patch,
      },
    }));
  }

  function handleSelectedFile(
    track: ReleaseTrack,
    kind: SwapKind,
    files: FileList | null
  ) {
    const file = files?.[0];
    if (!file) return;

    setPendingSwap({ track, kind, file });
  }

  async function uploadReplacementFile(
    track: ReleaseTrack,
    kind: SwapKind,
    file: File
  ) {
    return new Promise<{ key: string; publicUrl: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      const folder = kind === "audio" ? "songs" : "covers";

      formData.append("file", file);
      formData.append("folder", folder);

      xhr.open("POST", "/api/admin/upload-file");
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      xhr.timeout = 1000 * 60 * 30;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;

        setTrackUploadState(track.id, {
          status: "uploading",
          progress: Math.min(82, Math.round((event.loaded / event.total) * 82)),
          message: `Uploading ${kind === "audio" ? "song file" : "artwork"}...`,
        });
      };

      xhr.onload = () => {
        const data = (() => {
          try {
            return JSON.parse(xhr.responseText || "{}") as UploadResponse;
          } catch {
            return null;
          }
        })();

        if (xhr.status >= 200 && xhr.status < 300 && data?.success) {
          resolve({
            key: data.key || "",
            publicUrl: data.publicUrl || "",
          });
          return;
        }

        reject(
          new Error(data?.error || `Replacement upload failed (${xhr.status}).`)
        );
      };

      xhr.onerror = () => reject(new Error("Upload API could not be reached."));
      xhr.ontimeout = () => reject(new Error("Replacement upload timed out."));
      xhr.onabort = () => reject(new Error("Replacement upload was cancelled."));
      xhr.send(formData);
    });
  }

  async function confirmSwap() {
    if (!pendingSwap || !release || !accessToken) return;

    const { track, kind, file } = pendingSwap;
    setPendingSwap(null);

    try {
      setTrackUploadState(track.id, {
        status: "uploading",
        progress: 4,
        message: "Preparing safe replacement...",
      });

      const upload = await uploadReplacementFile(track, kind, file);

      setTrackUploadState(track.id, {
        status: "uploading",
        progress: 90,
        message: "Saving release update...",
      });

      const body =
        kind === "audio"
          ? { audioUrl: upload.publicUrl, audioKey: upload.key }
          : { artworkUrl: upload.publicUrl, artworkKey: upload.key };

      const response = await fetch(
        `/api/admin/releases/${release.id}/tracks/${track.id}/assets`,
        {
          method: "PATCH",
          headers: {
            ...authHeader(accessToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );
      const data = (await response.json().catch(() => null)) as
        | UpdateResponse
        | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Replacement could not be saved.");
      }

      setRelease((current) => {
        if (!current) return current;

        return {
          ...current,
          artworkUrl:
            kind === "artwork" && current.artworkUrl === track.artworkUrl
              ? upload.publicUrl
              : current.artworkUrl,
          tracks: current.tracks.map((currentTrack) =>
            currentTrack.id === track.id
              ? {
                  ...currentTrack,
                  audioUrl:
                    kind === "audio" ? upload.publicUrl : currentTrack.audioUrl,
                  audioKey: kind === "audio" ? upload.key : currentTrack.audioKey,
                  artworkUrl:
                    kind === "artwork"
                      ? upload.publicUrl
                      : currentTrack.artworkUrl,
                  artworkKey:
                    kind === "artwork" ? upload.key : currentTrack.artworkKey,
                }
              : currentTrack
          ),
        };
      });

      setTrackUploadState(track.id, {
        status: "success",
        progress: 100,
        message:
          data.message ||
          `${kind === "audio" ? "Song file" : "Artwork"} replaced successfully.`,
      });
    } catch (error: unknown) {
      setTrackUploadState(track.id, {
        status: "error",
        progress: 0,
        message:
          error instanceof Error
            ? error.message
            : "Replacement failed. No catalog update was completed.",
      });
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#050508] px-5 py-8 text-white">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-yellow-300">
            Hidden Tunes Admin
          </p>
          <h1 className="mt-4 text-3xl font-black">Loading release dashboard...</h1>
        </div>
      </main>
    );
  }

  if (pageError || !release) {
    return (
      <main className="min-h-screen bg-[#050508] px-5 py-8 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-red-400/20 bg-red-500/10 p-8">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-red-200">
            Release unavailable
          </p>
          <h1 className="mt-4 text-3xl font-black">Could not open release</h1>
          <p className="mt-3 text-sm leading-6 text-red-100/80">{pageError}</p>
          <button
            onClick={() => router.push("/admin/upload")}
            className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black"
          >
            Back To Upload Studio
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050508] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.22),transparent_34%),linear-gradient(135deg,#191922,#08080d_62%,#000)] shadow-2xl">
          <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[320px_1fr] lg:p-8">
            <div
              className="aspect-square rounded-[1.75rem] border border-white/10 bg-[#111118] bg-cover bg-center shadow-2xl"
              style={{
                backgroundImage: release.artworkUrl
                  ? `url("${release.artworkUrl}")`
                  : "linear-gradient(135deg,rgba(250,204,21,0.3),rgba(255,255,255,0.04))",
              }}
            />

            <div className="flex flex-col justify-between gap-8">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-yellow-300">
                  Hidden Tunes Release
                </p>
                <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">
                  {release.title}
                </h1>
                <p className="mt-3 text-lg font-bold text-white/70">
                  {release.artist}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatusCard label="Release Status" value={releaseStatus} />
                <StatusCard label="Tracks" value={String(release.tracks.length)} />
                <StatusCard label="Runtime" value={formatDuration(totalDuration)} />
                <StatusCard
                  label="Artwork"
                  value={release.artworkUrl ? "Live" : "Missing"}
                />
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <aside className="flex flex-col gap-5">
            <div className="rounded-[2rem] border border-white/10 bg-[#101017] p-5 shadow-xl">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/40">
                Release Control
              </p>
              <h2 className="mt-3 text-2xl font-black">Asset health</h2>
              <div className="mt-5 flex flex-col gap-3">
                <HealthRow
                  label="Audio files"
                  value={`${release.tracks.filter((track) => track.audioUrl).length}/${
                    release.tracks.length
                  } live`}
                />
                <HealthRow
                  label="Artwork"
                  value={`${
                    release.tracks.filter((track) => track.artworkUrl).length
                  }/${release.tracks.length} live`}
                />
                <HealthRow
                  label="Lyrics"
                  value={`${
                    release.tracks.filter((track) => track.hasLyrics).length
                  }/${release.tracks.length} ready`}
                />
              </div>
              <p className="mt-5 text-sm leading-6 text-white/50">
                Replacements are uploaded first, then saved to the catalog only
                after confirmation. Existing files remain untouched in R2.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/40">
                Safe Actions
              </p>
              <p className="mt-3 text-sm leading-6 text-white/55">
                Swap Song updates only the selected track audio URL and R2 key.
                Swap Image updates only the selected track artwork fields.
              </p>
            </div>
          </aside>

          <section className="rounded-[2rem] border border-white/10 bg-[#101017] p-4 shadow-2xl sm:p-5">
            <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300">
                  Track List
                </p>
                <h2 className="mt-2 text-2xl font-black">Release assets</h2>
              </div>
              <p className="text-sm text-white/45">
                Confirm each replacement before it changes the catalog.
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              {release.tracks.map((track, index) => {
                const state = trackStates[track.id];
                const isBusy = state?.status === "uploading";

                return (
                  <article
                    key={track.id}
                    className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4 transition hover:border-white/20"
                  >
                    <div className="grid gap-4 xl:grid-cols-[72px_1fr_260px] xl:items-center">
                      <div className="flex items-center gap-3 xl:block">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-lg font-black text-white/60">
                          {index + 1}
                        </div>
                        <div className="xl:hidden">
                          <p className="text-xs font-bold uppercase tracking-widest text-white/35">
                            Track {index + 1}
                          </p>
                        </div>
                      </div>

                      <div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="text-xl font-black">{track.title}</h3>
                            <p className="mt-1 text-sm font-semibold text-white/50">
                              {formatDuration(track.duration)} / {statusTone(track)}
                            </p>
                          </div>
                          <span className="w-fit rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-black uppercase tracking-widest text-white/55">
                            {track.sourceType || "r2"}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <AssetPill label="Audio" active={Boolean(track.audioUrl)} />
                          <AssetPill
                            label="Artwork"
                            active={Boolean(track.artworkUrl)}
                          />
                          <AssetPill label="Lyrics" active={track.hasLyrics} />
                          {track.genre && <AssetPill label={track.genre} active />}
                          {track.mood && <AssetPill label={track.mood} active />}
                        </div>

                        <p className="mt-3 text-xs leading-5 text-white/40">
                          {assetStatusLabel(track)}
                        </p>

                        {state?.message && (
                          <div
                            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                              state.status === "error"
                                ? "border-red-400/20 bg-red-500/10 text-red-100"
                                : state.status === "success"
                                  ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                                  : "border-yellow-400/20 bg-yellow-500/10 text-yellow-100"
                            }`}
                          >
                            {state.message}
                            {state.status === "uploading" && (
                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full rounded-full bg-yellow-300 transition-all"
                                  style={{ width: `${state.progress}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                        <label
                          className={`cursor-pointer rounded-2xl border px-4 py-3 text-center text-sm font-black transition ${
                            isBusy
                              ? "pointer-events-none border-white/10 bg-white/[0.03] text-white/30"
                              : "border-yellow-400/30 bg-yellow-300/10 text-yellow-100 hover:bg-yellow-300/15"
                          }`}
                        >
                          Swap Song
                          <input
                            hidden
                            type="file"
                            accept="audio/*,.mp3,.wav,.m4a"
                            disabled={isBusy}
                            onChange={(event) => {
                              handleSelectedFile(track, "audio", event.target.files);
                              event.target.value = "";
                            }}
                          />
                        </label>

                        <label
                          className={`cursor-pointer rounded-2xl border px-4 py-3 text-center text-sm font-black transition ${
                            isBusy
                              ? "pointer-events-none border-white/10 bg-white/[0.03] text-white/30"
                              : "border-white/10 bg-white/[0.05] text-white/80 hover:border-white/25"
                          }`}
                        >
                          Swap Image
                          <input
                            hidden
                            type="file"
                            accept="image/*,.jpg,.jpeg,.png,.webp"
                            disabled={isBusy}
                            onChange={(event) => {
                              handleSelectedFile(
                                track,
                                "artwork",
                                event.target.files
                              );
                              event.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      </div>

      {pendingSwap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#101017] p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-300">
              Confirm Replacement
            </p>
            <h2 className="mt-4 text-2xl font-black">
              Replace {pendingSwap.kind === "audio" ? "song file" : "artwork"}?
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/60">
              This will upload{" "}
              <span className="font-bold text-white">{pendingSwap.file.name}</span>{" "}
              and update only{" "}
              <span className="font-bold text-white">
                {pendingSwap.track.title}
              </span>
              . The previous catalog entry stays unchanged until this upload and
              save both succeed.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={confirmSwap}
                className="flex-1 rounded-2xl bg-yellow-300 px-5 py-4 text-sm font-black text-black transition hover:scale-[1.01]"
              >
                Confirm Replacement
              </button>
              <button
                onClick={() => setPendingSwap(null)}
                className="rounded-2xl border border-white/10 px-5 py-4 text-sm font-black text-white/75 transition hover:border-white/25"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-white/40">
        {label}
      </p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <span className="text-sm font-bold text-white/65">{label}</span>
      <span className="text-sm font-black text-white">{value}</span>
    </div>
  );
}

function AssetPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-black ${
        active
          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
          : "border-white/10 bg-white/[0.04] text-white/35"
      }`}
    >
      {label}
    </span>
  );
}
