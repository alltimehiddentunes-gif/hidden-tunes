"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
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

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function trackStatus(track: ReleaseTrack) {
  if (!track.audioUrl) return "Needs audio";
  if (!track.artworkUrl) return "Needs artwork";
  if (!track.hasLyrics) return "Lyrics optional";
  return "Ready";
}

function statusClass(status: string) {
  if (status === "Ready" || status === "Release ready") {
    return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  }
  if (status === "Needs audio" || status === "Needs artwork") {
    return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
  }
  return "border-white/10 bg-white/[0.06] text-white/62";
}

function assetSummary(track: ReleaseTrack) {
  return [
    track.audioUrl ? "Audio live" : "Audio missing",
    track.artworkUrl ? "Artwork live" : "Artwork missing",
    track.hasLyrics ? "Lyrics ready" : "Lyrics not attached",
  ].join(" / ");
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

  const assetHealth = useMemo(() => {
    const tracks = release?.tracks || [];
    const total = tracks.length || 1;
    const audio = tracks.filter((track) => track.audioUrl).length;
    const artwork = tracks.filter((track) => track.artworkUrl).length;

    return {
      audio,
      artwork,
      lyrics: tracks.filter((track) => track.hasLyrics).length,
      score: Math.round(((audio + artwork) / (total * 2)) * 100),
    };
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

        if (!token) throw new Error("Your admin session expired. Sign in again.");

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

    if (releaseId) boot();
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
          resolve({ key: data.key || "", publicUrl: data.publicUrl || "" });
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
      <AdminShell title="Release Detail" description="Loading release workspace...">
        <div className="h-[520px] rounded-[2rem] border border-white/10 bg-white/[0.04]" />
      </AdminShell>
    );
  }

  if (pageError || !release) {
    return (
      <AdminShell title="Release unavailable" description={pageError}>
        <button
          onClick={() => router.push("/admin/releases")}
          className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-black"
        >
          Back To Releases
        </button>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      eyebrow="Release Detail"
      title={release.title}
      description={`${release.artist} / ${release.tracks.length} tracks / ${formatDuration(
        totalDuration
      )}`}
      actions={
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => router.push("/admin/releases")}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white/75 transition hover:border-white/25"
          >
            All Releases
          </button>
          <button
            onClick={() => router.push("/admin/upload")}
            className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black transition hover:-translate-y-0.5"
          >
            Upload Music
          </button>
        </div>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <aside className="flex flex-col gap-5">
          <div className="overflow-hidden rounded-[2.1rem] border border-white/10 bg-[#101017]/92 shadow-2xl">
            <div
              className="aspect-square bg-[#111118] bg-cover bg-center"
              style={{
                backgroundImage: release.artworkUrl
                  ? `url("${release.artworkUrl}")`
                  : "linear-gradient(135deg,rgba(250,204,21,0.28),rgba(168,85,247,0.12),rgba(255,255,255,0.04))",
              }}
            />
            <div className="p-5">
              <div className="flex items-center justify-between gap-4">
                <StatusBadge status={releaseStatus} />
                <span className="text-sm font-black text-white/60">
                  {assetHealth.score}% ready
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-emerald-300"
                  style={{ width: `${assetHealth.score}%` }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
              Asset Health
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <HealthRow label="Audio" value={`${assetHealth.audio}/${release.tracks.length}`} />
              <HealthRow
                label="Artwork"
                value={`${assetHealth.artwork}/${release.tracks.length}`}
              />
              <HealthRow label="Lyrics" value={`${assetHealth.lyrics}/${release.tracks.length}`} />
            </div>
          </div>
        </aside>

        <section className="rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-4 shadow-2xl sm:p-5">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
                Track Workspace
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                Release assets
              </h2>
            </div>
            <p className="text-sm text-white/45">
              Replace files safely or edit lyrics without leaving the release.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-4">
            {release.tracks.map((track, index) => {
              const state = trackStates[track.id];
              const isBusy = state?.status === "uploading";

              return (
                <article
                  key={track.id}
                  className="rounded-[1.7rem] border border-white/10 bg-black/24 p-4 transition hover:border-yellow-300/20"
                >
                  <div className="grid gap-4 xl:grid-cols-[88px_1fr_300px]">
                    <div>
                      <div
                        className="h-16 w-16 rounded-2xl border border-white/10 bg-[#15151d] bg-cover bg-center shadow-xl"
                        style={{
                          backgroundImage: track.artworkUrl
                            ? `url("${track.artworkUrl}")`
                            : "linear-gradient(135deg,rgba(250,204,21,0.18),rgba(255,255,255,0.04))",
                        }}
                      />
                      <p className="mt-3 text-xs font-black uppercase tracking-widest text-white/35">
                        Track {String(index + 1).padStart(2, "0")}
                      </p>
                    </div>

                    <div>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="text-2xl font-black tracking-[-0.035em]">
                            {track.title}
                          </h3>
                          <p className="mt-1 text-sm font-semibold text-white/48">
                            {formatDuration(track.duration)} / {assetSummary(track)}
                          </p>
                        </div>
                        <StatusBadge status={trackStatus(track)} />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <AssetPill label="Audio" active={Boolean(track.audioUrl)} />
                        <AssetPill
                          label="Artwork"
                          active={Boolean(track.artworkUrl)}
                        />
                        <AssetPill label="Lyrics" active={track.hasLyrics} />
                        {track.genre ? <AssetPill label={track.genre} active /> : null}
                        {track.mood ? <AssetPill label={track.mood} active /> : null}
                      </div>

                      {state?.message ? (
                        <div
                          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                            state.status === "error"
                              ? "border-red-400/20 bg-red-500/10 text-red-100"
                              : state.status === "success"
                                ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                                : "border-yellow-400/20 bg-yellow-500/10 text-yellow-100"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <span>{state.message}</span>
                            {state.status === "uploading" ? (
                              <span className="font-black">{state.progress}%</span>
                            ) : null}
                          </div>
                          {state.status === "uploading" ? (
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-emerald-300 transition-all"
                                style={{ width: `${state.progress}%` }}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      <button
                        onClick={() =>
                          router.push(
                            `/admin/releases/${release.id}/tracks/${track.id}/lyrics`
                          )
                        }
                        className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-black text-white/82 transition hover:-translate-y-0.5 hover:border-white/25"
                      >
                        Edit Plain Lyrics
                      </button>
                      <button
                        onClick={() =>
                          router.push(
                            `/admin/releases/${release.id}/tracks/${track.id}/synced-lyrics`
                          )
                        }
                        className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-black text-white/82 transition hover:-translate-y-0.5 hover:border-white/25"
                      >
                        Edit Synced Lyrics
                      </button>
                      <label
                        className={`cursor-pointer rounded-2xl border px-4 py-3 text-center text-sm font-black transition ${
                          isBusy
                            ? "pointer-events-none border-white/10 bg-white/[0.03] text-white/30"
                            : "border-yellow-300/25 bg-yellow-300/10 text-yellow-100 hover:-translate-y-0.5"
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
                            : "border-white/10 bg-white/[0.055] text-white/82 hover:-translate-y-0.5 hover:border-white/25"
                        }`}
                      >
                        Swap Image
                        <input
                          hidden
                          type="file"
                          accept="image/*,.jpg,.jpeg,.png,.webp"
                          disabled={isBusy}
                          onChange={(event) => {
                            handleSelectedFile(track, "artwork", event.target.files);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      <a
                        href={track.audioUrl || undefined}
                        download
                        className={`rounded-2xl border px-4 py-3 text-center text-sm font-black transition ${
                          track.audioUrl
                            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100 hover:-translate-y-0.5"
                            : "pointer-events-none border-white/10 bg-white/[0.03] text-white/30"
                        }`}
                      >
                        Download Audio
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      {pendingSwap ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 px-4 backdrop-blur-xl">
          <div className="w-full max-w-xl rounded-[2.2rem] border border-white/10 bg-[#101017] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-300">
              Confirm Replacement
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
              Replace {pendingSwap.kind === "audio" ? "song file" : "artwork"}?
            </h2>
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/62">
              This uploads{" "}
              <span className="font-black text-white">{pendingSwap.file.name}</span>{" "}
              and updates only{" "}
              <span className="font-black text-white">
                {pendingSwap.track.title}
              </span>
              .
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={confirmSwap}
                className="flex-1 rounded-2xl bg-yellow-300 px-5 py-4 text-sm font-black text-black"
              >
                Confirm Replacement
              </button>
              <button
                onClick={() => setPendingSwap(null)}
                className="rounded-2xl border border-white/10 px-5 py-4 text-sm font-black text-white/75"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4">
      <p className="text-2xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/38">
        {label}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`w-fit rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${statusClass(
        status
      )}`}
    >
      {status}
    </span>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <span className="text-sm font-bold text-white/65">{label}</span>
      <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-white">
        {value}
      </span>
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
