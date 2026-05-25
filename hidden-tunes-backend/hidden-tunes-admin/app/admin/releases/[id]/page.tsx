"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AdminShell from "@/components/AdminShell";
import ControlledGenreFields from "@/components/ControlledGenreFields";
import EmotionalAnalysisReviewPanel from "@/components/EmotionalAnalysisReviewPanel";
import {
  ReleaseHealthPanel,
  type ReleaseHealthSummary,
} from "@/components/ReleaseHealthPanel";
import { getActiveUploaderSession, supabase } from "@/lib/auth";
import {
  buildGenreSavePayload,
  getGenreSelectionFromLegacyLabel,
  resolveGenreFields,
  type ControlledGenreDraft,
} from "@/lib/controlledGenreState";
import {
  ANALYSIS_SOURCE_OPTIONS,
  ANALYSIS_STATUS_OPTIONS,
  ATMOSPHERE_OPTIONS,
  buildTaxonomySelectOptions,
  EMOTION_OPTIONS,
  INSTRUMENTATION_OPTIONS,
  TEXTURE_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  VOCAL_FEEL_OPTIONS,
} from "@/lib/emotionalTaxonomy";
import {
  formatRightsValue,
  RIGHTS_REVIEW_LATER_PHASE_NOTE,
  type RightsReviewMetadata,
} from "@/lib/rightsReview";

type ReleaseUploader = {
  id: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
};

type EmotionalMetadata = {
  energy: number | null;
  tempoBpm: number | null;
  atmosphere: string | null;
  emotion: string | null;
  texture: string | null;
  timeOfDay: string | null;
  vocalFeel: string | null;
  instrumentation: string | null;
  analysisStatus: string | null;
  analysisSource: string | null;
};

type EmotionalMetadataDraft = {
  energy: string;
  tempoBpm: string;
  atmosphere: string;
  emotion: string;
  texture: string;
  timeOfDay: string;
  vocalFeel: string;
  instrumentation: string;
  analysisStatus: string;
  analysisSource: string;
};

type EmotionalSaveState = {
  status: "idle" | "saving" | "success" | "error";
  message: string;
};

type ReleaseTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string | null;
  mood: string | null;
  emotionalMetadata?: EmotionalMetadata | null;
  duration: number;
  audioUrl: string | null;
  artworkUrl: string | null;
  audioKey: string | null;
  artworkKey: string | null;
  lyricsUrl: string | null;
  hasLyrics: boolean;
  hasPlainLyrics?: boolean;
  hasSyncedLyrics?: boolean;
  metadataComplete?: boolean;
  lyricsType: string | null;
  sourceName: string | null;
  sourceType: string | null;
  isOnline: boolean;
  createdAt: string | null;
  uploadedByUserId?: string | null;
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
  uploader?: ReleaseUploader | null;
  rightsReview?: RightsReviewMetadata | null;
  health?: ReleaseHealthSummary;
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
  emotionalMetadata?: EmotionalMetadata | null;
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

type GenreDraftState = ControlledGenreDraft & {
  legacyOverride: string;
};

function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Unknown date";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(time));
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

function reviewTone(value: string | null | undefined) {
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
  return "border-white/10 bg-white/[0.06] text-white/62";
}

function assetSummary(track: ReleaseTrack) {
  const plainReady = track.hasPlainLyrics ?? track.hasLyrics;
  const syncedReady = track.hasSyncedLyrics;

  return [
    track.audioUrl ? "Audio live" : "Audio missing",
    track.artworkUrl ? "Artwork live" : "Artwork missing",
    plainReady ? "Plain lyrics" : "Plain lyrics missing",
    syncedReady ? "Synced lyrics" : "Synced lyrics missing",
    track.metadataComplete === false ? "Metadata incomplete" : "Metadata ok",
  ].join(" / ");
}

function buildEmotionalMetadataEntries(metadata: EmotionalMetadata | null | undefined) {
  if (!metadata) return [] as Array<{ key: string; label: string; value: string }>;

  const entries: Array<{ key: string; label: string; value: string }> = [];

  if (metadata.energy !== null && metadata.energy !== undefined) {
    entries.push({ key: "energy", label: "Energy", value: String(metadata.energy) });
  }

  if (metadata.tempoBpm !== null && metadata.tempoBpm !== undefined) {
    entries.push({
      key: "tempoBpm",
      label: "Tempo",
      value: `${metadata.tempoBpm} BPM`,
    });
  }

  const textFields: Array<{
    key: keyof EmotionalMetadata;
    label: string;
  }> = [
    { key: "atmosphere", label: "Atmosphere" },
    { key: "emotion", label: "Emotion" },
    { key: "texture", label: "Texture" },
    { key: "timeOfDay", label: "Time of day" },
    { key: "vocalFeel", label: "Vocal feel" },
    { key: "instrumentation", label: "Instrumentation" },
    { key: "analysisStatus", label: "Analysis status" },
    { key: "analysisSource", label: "Analysis source" },
  ];

  for (const field of textFields) {
    const value = metadata[field.key];
    if (typeof value === "string" && value.trim()) {
      entries.push({
        key: field.key,
        label: field.label,
        value: value.trim(),
      });
    }
  }

  return entries;
}

function emotionalMetadataToDraft(
  metadata: EmotionalMetadata | null | undefined
): EmotionalMetadataDraft {
  return {
    energy: metadata?.energy != null ? String(metadata.energy) : "",
    tempoBpm: metadata?.tempoBpm != null ? String(metadata.tempoBpm) : "",
    atmosphere: metadata?.atmosphere || "",
    emotion: metadata?.emotion || "",
    texture: metadata?.texture || "",
    timeOfDay: metadata?.timeOfDay || "",
    vocalFeel: metadata?.vocalFeel || "",
    instrumentation: metadata?.instrumentation || "",
    analysisStatus: metadata?.analysisStatus || "",
    analysisSource: metadata?.analysisSource || "",
  };
}

function buildEmotionalSavePayload(draft: EmotionalMetadataDraft) {
  const energyText = draft.energy.trim();
  const tempoText = draft.tempoBpm.trim();

  return {
    energy: energyText === "" ? "" : Number(energyText),
    tempoBpm: tempoText === "" ? "" : Number(tempoText),
    atmosphere: draft.atmosphere,
    emotion: draft.emotion,
    texture: draft.texture,
    timeOfDay: draft.timeOfDay,
    vocalFeel: draft.vocalFeel,
    instrumentation: draft.instrumentation,
    analysisStatus: draft.analysisStatus,
    analysisSource: draft.analysisSource,
  };
}

const emotionalFieldClass =
  "w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-violet-300/40";

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
  const [genreDrafts, setGenreDrafts] = useState<Record<string, GenreDraftState>>(
    {}
  );
  const [savingGenreTrackId, setSavingGenreTrackId] = useState("");
  const [emotionalDrafts, setEmotionalDrafts] = useState<
    Record<string, EmotionalMetadataDraft>
  >({});
  const [savingEmotionalTrackId, setSavingEmotionalTrackId] = useState("");
  const [emotionalSaveStates, setEmotionalSaveStates] = useState<
    Record<string, EmotionalSaveState>
  >({});

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
      setGenreDrafts((current) => {
        const next = { ...current };

        data.release?.tracks.forEach((track) => {
          if (!next[track.id]) {
            const selection = getGenreSelectionFromLegacyLabel(track.genre);
            next[track.id] = {
              ...selection,
              legacyOverride: "",
            };
          }
        });

        return next;
      });

      setEmotionalDrafts(() => {
        const next: Record<string, EmotionalMetadataDraft> = {};

        data.release?.tracks.forEach((track) => {
          next[track.id] = emotionalMetadataToDraft(track.emotionalMetadata);
        });

        return next;
      });

      setEmotionalSaveStates({});
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

  function updateGenreDraft(trackId: string, patch: Partial<GenreDraftState>) {
    setGenreDrafts((current) => ({
      ...current,
      [trackId]: {
        ...getGenreSelectionFromLegacyLabel(null),
        ...current[trackId],
        legacyOverride: current[trackId]?.legacyOverride || "",
        ...patch,
      },
    }));
  }

  async function saveTrackGenre(track: ReleaseTrack) {
    if (!release || !accessToken) return;

    const draft = genreDrafts[track.id];
    if (!draft) return;

    setSavingGenreTrackId(track.id);
    setTrackUploadState(track.id, {
      status: "uploading",
      progress: 20,
      message: "Saving controlled genre...",
    });

    try {
      const payload = buildGenreSavePayload(draft);

      const response = await fetch(
        `/api/admin/releases/${release.id}/tracks/${track.id}/metadata`,
        {
          method: "PATCH",
          headers: {
            ...authHeader(accessToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...payload,
            legacyGenreOverride: draft.legacyOverride.trim() || undefined,
          }),
        }
      );
      const data = (await response.json().catch(() => null)) as UpdateResponse & {
        genre?: { genre?: string };
      } | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Genre could not be saved.");
      }

      const nextGenre = data.track?.genre || payload.genre;

      setRelease((current) => {
        if (!current) return current;

        return {
          ...current,
          tracks: current.tracks.map((currentTrack) =>
            currentTrack.id === track.id
              ? { ...currentTrack, genre: nextGenre }
              : currentTrack
          ),
        };
      });

      updateGenreDraft(track.id, {
        ...resolveGenreFields(payload.mainGenreId, payload.subgenreId),
        genre: nextGenre,
        legacyGenre: draft.legacyGenre,
        legacyOverride: "",
      });

      setTrackUploadState(track.id, {
        status: "success",
        progress: 100,
        message: data.message || "Genre saved with controlled taxonomy.",
      });
    } catch (error: unknown) {
      setTrackUploadState(track.id, {
        status: "error",
        progress: 0,
        message:
          error instanceof Error ? error.message : "Genre update failed.",
      });
    } finally {
      setSavingGenreTrackId("");
    }
  }

  function updateEmotionalDraft(
    trackId: string,
    patch: Partial<EmotionalMetadataDraft>
  ) {
    setEmotionalDrafts((current) => ({
      ...current,
      [trackId]: {
        ...emotionalMetadataToDraft(null),
        ...current[trackId],
        ...patch,
      },
    }));
  }

  function setEmotionalSaveState(trackId: string, patch: Partial<EmotionalSaveState>) {
    setEmotionalSaveStates((current) => ({
      ...current,
      [trackId]: {
        ...(current[trackId] ?? { status: "idle", message: "" }),
        ...patch,
      },
    }));
  }

  async function saveTrackEmotional(track: ReleaseTrack) {
    if (!release || !accessToken) return;

    const genreDraft =
      genreDrafts[track.id] ||
      ({
        ...getGenreSelectionFromLegacyLabel(track.genre),
        legacyOverride: "",
      } satisfies GenreDraftState);
    const emotionalDraft =
      emotionalDrafts[track.id] ?? emotionalMetadataToDraft(track.emotionalMetadata);

    setSavingEmotionalTrackId(track.id);
    setEmotionalSaveState(track.id, {
      status: "saving",
      message: "Saving emotional metadata...",
    });

    try {
      const genrePayload = buildGenreSavePayload(genreDraft);

      const response = await fetch(
        `/api/admin/releases/${release.id}/tracks/${track.id}/metadata`,
        {
          method: "PATCH",
          headers: {
            ...authHeader(accessToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...genrePayload,
            legacyGenreOverride: genreDraft.legacyOverride.trim() || undefined,
            ...buildEmotionalSavePayload(emotionalDraft),
          }),
        }
      );

      const data = (await response.json().catch(() => null)) as UpdateResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Emotional metadata could not be saved.");
      }

      const nextEmotional =
        data.track?.emotionalMetadata || data.emotionalMetadata || null;
      const nextGenre = data.track?.genre || track.genre;

      setRelease((current) => {
        if (!current) return current;

        return {
          ...current,
          tracks: current.tracks.map((currentTrack) =>
            currentTrack.id === track.id
              ? {
                  ...currentTrack,
                  genre: nextGenre,
                  emotionalMetadata: nextEmotional,
                }
              : currentTrack
          ),
        };
      });

      setEmotionalDrafts((current) => ({
        ...current,
        [track.id]: emotionalMetadataToDraft(nextEmotional),
      }));

      setEmotionalSaveState(track.id, {
        status: "success",
        message: "Emotional metadata saved.",
      });
    } catch (error: unknown) {
      setEmotionalSaveState(track.id, {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Emotional metadata update failed.",
      });
    } finally {
      setSavingEmotionalTrackId("");
    }
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
      <section className="flex w-full min-w-0 max-w-full flex-col gap-5 overflow-x-hidden">
        <aside className="grid w-full min-w-0 max-w-full gap-5 xl:grid-cols-2 2xl:grid-cols-4">
          <div className="min-w-0 rounded-[2.1rem] border border-white/10 bg-[#101017]/92 shadow-2xl">
            <div
              className="aspect-square rounded-t-[2.1rem] bg-[#111118] bg-cover bg-center"
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
                  {release.health?.score ?? 0}% ready
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-emerald-300"
                  style={{ width: `${release.health?.score ?? 0}%` }}
                />
              </div>
              {release.health ? (
                <p className="mt-3 text-xs font-bold text-white/40">
                  {release.health.readinessLabel}
                </p>
              ) : null}
            </div>
          </div>

          {release.health ? (
            <ReleaseHealthPanel
              health={release.health}
              trackCount={release.tracks.length}
            />
          ) : null}

          <UploaderInfoCard
            uploader={release.uploader}
            createdAt={release.createdAt}
            onViewUploads={() =>
              release.uploader?.id
                ? router.push(`/admin/uploaders/${release.uploader.id}/releases`)
                : undefined
            }
          />

          <RightsReviewPanel rightsReview={release.rightsReview} />
        </aside>

        <section className="w-full min-w-0 max-w-full overflow-x-hidden rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-4 shadow-2xl sm:p-5">
          <div className="flex min-w-0 flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
                Track Workspace
              </p>
              <h2 className="mt-2 break-words text-3xl font-black tracking-[-0.04em]">
                Release assets
              </h2>
            </div>
            <p className="max-w-xl break-words text-sm text-white/45">
              Replace files safely, edit controlled genres, or edit lyrics without
              leaving the release.
            </p>
          </div>

          <EmotionalAnalysisReviewPanel
            tracks={release.tracks.map((track) => ({
              id: track.id,
              title: track.title,
              artist: track.artist,
              mood: track.mood,
              genre: track.genre,
              audioUrl: track.audioUrl,
            }))}
            accessToken={accessToken}
            disabled={!accessToken}
            onApplied={async () => {
              if (!accessToken) return;
              await loadRelease(accessToken);
            }}
          />

          <div className="mt-5 flex w-full min-w-0 max-w-full flex-col gap-4">
            {release.tracks.map((track, index) => {
              const state = trackStates[track.id];
              const isBusy = state?.status === "uploading";
              const genreDraft =
                genreDrafts[track.id] ||
                ({
                  ...getGenreSelectionFromLegacyLabel(track.genre),
                  legacyOverride: "",
                } satisfies GenreDraftState);
              const isSavingGenre = savingGenreTrackId === track.id;
              const isSavingEmotional = savingEmotionalTrackId === track.id;
              const emotionalDraft =
                emotionalDrafts[track.id] ??
                emotionalMetadataToDraft(track.emotionalMetadata);
              const emotionalSaveState = emotionalSaveStates[track.id];
              const formDisabled = isBusy || isSavingGenre || isSavingEmotional;

              return (
                <article
                  key={track.id}
                  className="w-full min-w-0 max-w-full rounded-[1.7rem] border border-white/10 bg-black/24 p-4 transition hover:border-yellow-300/20"
                >
                  <div className="grid w-full min-w-0 max-w-full gap-4 sm:grid-cols-[72px_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <div
                        className="h-16 w-16 rounded-2xl border border-white/10 bg-[#15151d] bg-cover bg-center shadow-xl"
                        style={{
                          backgroundImage: track.artworkUrl
                            ? `url("${track.artworkUrl}")`
                            : "linear-gradient(135deg,rgba(250,204,21,0.18),rgba(255,255,255,0.04))",
                        }}
                      />
                      <p className="mt-3 break-words text-xs font-black uppercase tracking-widest text-white/35">
                        Track {String(index + 1).padStart(2, "0")}
                      </p>
                    </div>

                    <div className="min-w-0 max-w-full">
                      <div className="flex min-w-0 max-w-full flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <h3 className="break-words text-2xl font-black tracking-[-0.035em] [overflow-wrap:anywhere]">
                            {track.title}
                          </h3>
                          <p className="mt-1 break-words text-sm font-semibold text-white/48 [overflow-wrap:anywhere]">
                            {formatDuration(track.duration)} / {assetSummary(track)}
                          </p>
                        </div>
                        <StatusBadge status={trackStatus(track)} />
                      </div>

                      <div className="mt-4 flex min-w-0 max-w-full flex-wrap gap-2">
                        <AssetPill label="Audio" active={Boolean(track.audioUrl)} />
                        <AssetPill
                          label="Artwork"
                          active={Boolean(track.artworkUrl)}
                        />
                        <AssetPill label="Lyrics" active={track.hasLyrics} />
                        {track.genre ? <AssetPill label={track.genre} active /> : null}
                        {track.mood ? <AssetPill label={track.mood} active /> : null}
                      </div>

                      <EmotionalMetadataPanel
                        metadata={track.emotionalMetadata}
                      />

                      <EmotionalMetadataEditor
                        draft={emotionalDraft}
                        disabled={formDisabled}
                        saveState={emotionalSaveState}
                        onFieldChange={(field, value) =>
                          updateEmotionalDraft(track.id, { [field]: value })
                        }
                        onSave={() => saveTrackEmotional(track)}
                      />

                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                          Catalog Genre
                        </p>
                        <div className="mt-3">
                          <ControlledGenreFields
                            compact
                            disabled={formDisabled}
                            mainGenreId={genreDraft.mainGenreId}
                            subgenreId={genreDraft.subgenreId}
                            legacyGenreLabel={genreDraft.legacyGenre}
                            legacyOverride={genreDraft.legacyOverride}
                            onLegacyOverrideChange={(legacyOverride) =>
                              updateGenreDraft(track.id, { legacyOverride })
                            }
                            onMainGenreChange={(mainGenreId, subgenreId) =>
                              updateGenreDraft(track.id, {
                                ...resolveGenreFields(mainGenreId, subgenreId),
                              })
                            }
                            onSubgenreChange={(subgenreId) =>
                              updateGenreDraft(track.id, {
                                ...resolveGenreFields(
                                  genreDraft.mainGenreId,
                                  subgenreId
                                ),
                              })
                            }
                            helperText="Saved genre updates the catalog song row used by mobile navigation."
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => saveTrackGenre(track)}
                          disabled={formDisabled}
                          className="mt-4 rounded-2xl bg-yellow-300 px-4 py-3 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSavingGenre ? "Saving Genre..." : "Save Genre"}
                        </button>
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
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <span className="break-words">{state.message}</span>
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

                    <div className="grid w-full min-w-0 max-w-full grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 sm:col-span-2">
                      <button
                        onClick={() =>
                          router.push(
                            `/admin/releases/${release.id}/tracks/${track.id}/lyrics`
                          )
                        }
                        className="min-w-0 whitespace-normal rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-black leading-5 text-white/82 transition hover:-translate-y-0.5 hover:border-white/25 [overflow-wrap:anywhere]"
                      >
                        Edit Plain Lyrics
                      </button>
                      <button
                        onClick={() =>
                          router.push(
                            `/admin/releases/${release.id}/tracks/${track.id}/sync-lyrics`
                          )
                        }
                        disabled={!track.audioUrl}
                        className="min-w-0 whitespace-normal rounded-2xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-sm font-black leading-5 text-yellow-100 transition hover:-translate-y-0.5 hover:border-yellow-300/40 disabled:cursor-not-allowed disabled:opacity-45 [overflow-wrap:anywhere]"
                      >
                        Sync Lyrics
                      </button>
                      <button
                        onClick={() =>
                          router.push(
                            `/admin/releases/${release.id}/tracks/${track.id}/synced-lyrics`
                          )
                        }
                        className="min-w-0 whitespace-normal rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-black leading-5 text-white/82 transition hover:-translate-y-0.5 hover:border-white/25 [overflow-wrap:anywhere]"
                      >
                        Edit Synced Lyrics
                      </button>
                      <label
                        className={`min-w-0 cursor-pointer whitespace-normal rounded-2xl border px-4 py-3 text-center text-sm font-black leading-5 transition [overflow-wrap:anywhere] ${
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
                        className={`min-w-0 cursor-pointer whitespace-normal rounded-2xl border px-4 py-3 text-center text-sm font-black leading-5 transition [overflow-wrap:anywhere] ${
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
                        className={`min-w-0 whitespace-normal rounded-2xl border px-4 py-3 text-center text-sm font-black leading-5 transition [overflow-wrap:anywhere] ${
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

function UploaderInfoCard({
  uploader,
  createdAt,
  onViewUploads,
}: {
  uploader?: ReleaseUploader | null;
  createdAt: string | null;
  onViewUploads: () => void | undefined;
}) {
  const hasUploader = Boolean(uploader?.id);

  return (
    <div className="min-w-0 rounded-[2.1rem] border border-white/10 bg-[#101017]/92 p-5 shadow-2xl">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
        Uploaded By
      </p>
      <h2 className="mt-2 break-all text-2xl font-black tracking-[-0.04em]">
        {uploader?.email || "Unknown uploader"}
      </h2>
      <div className="mt-4 grid gap-3">
        <ReviewField label="Role" value={uploader?.role || "Unknown role"} />
        <ReviewField
          label="Uploader ID"
          value={uploader?.id || "No uploader id recorded"}
        />
        <ReviewField label="Upload date" value={formatDate(createdAt)} />
      </div>

      {!hasUploader ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/48">
          This release was created before uploader ownership tracking.
        </p>
      ) : (
        <button
          type="button"
          onClick={onViewUploads}
          className="mt-4 w-full min-w-0 whitespace-normal rounded-2xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-yellow-100 transition hover:-translate-y-0.5 [overflow-wrap:anywhere]"
        >
          View uploader uploads
        </button>
      )}
    </div>
  );
}

function RightsReviewPanel({
  rightsReview,
}: {
  rightsReview?: RightsReviewMetadata | null;
}) {
  return (
    <div className="min-w-0 rounded-[2.1rem] border border-yellow-300/15 bg-gradient-to-br from-yellow-300/[0.08] via-[#101017] to-[#101017] p-5 shadow-2xl">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
            Rights & Review
          </p>
          <h2 className="mt-2 break-words text-2xl font-black tracking-[-0.04em]">
            Display-only safety metadata
          </h2>
        </div>
        <span
          className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${reviewTone(
            rightsReview?.reviewStatus
          )}`}
        >
          {formatRightsValue(rightsReview?.reviewStatus, "Not reviewed")}
        </span>
      </div>

      <p className="mt-4 break-words rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/50 [overflow-wrap:anywhere]">
        {RIGHTS_REVIEW_LATER_PHASE_NOTE}
      </p>

      <div className="mt-5 grid gap-3">
        <ReviewField
          label="Review status"
          value={formatRightsValue(rightsReview?.reviewStatus, "Not reviewed")}
        />
        <ReviewField
          label="License declaration"
          value={formatRightsValue(rightsReview?.licenseDeclaration, "Unknown")}
        />
        <ReviewField
          label="License notes"
          value={rightsReview?.licenseNotes || "No notes provided"}
          multiline
        />
        <ReviewField
          label="Copyright scan status"
          value={formatRightsValue(rightsReview?.copyrightScanStatus, "Unknown")}
        />
        <ReviewField
          label="Copyright scan provider"
          value={rightsReview?.copyrightScanProvider || "Not connected"}
        />
        <ReviewField
          label="Duplicate scan status"
          value={formatRightsValue(rightsReview?.duplicateScanStatus, "Unknown")}
        />
        <ReviewField
          label="Duplicate match track id"
          value={rightsReview?.duplicateMatchTrackId || "No match recorded"}
        />
        <ReviewField
          label="Rejection reason"
          value={rightsReview?.rejectionReason || "No rejection reason"}
          multiline
        />
      </div>
    </div>
  );
}

function ReviewField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/22 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/34">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-bold text-white/76 ${
          multiline ? "whitespace-pre-wrap break-words leading-6" : "break-all"
        }`}
      >
        {value}
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

function AssetPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`max-w-full break-words rounded-full border px-3 py-1 text-xs font-black [overflow-wrap:anywhere] ${
        active
          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
          : "border-white/10 bg-white/[0.04] text-white/35"
      }`}
    >
      {label}
    </span>
  );
}

function EmotionalMetadataPanel({
  metadata,
}: {
  metadata: EmotionalMetadata | null | undefined;
}) {
  const entries = buildEmotionalMetadataEntries(metadata);

  if (!entries.length) {
    return null;
  }

  return (
    <div className="mt-4 rounded-2xl border border-violet-300/15 bg-violet-500/[0.06] p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">
        Saved Emotional Metadata
      </p>
      <div className="mt-3 flex min-w-0 max-w-full flex-wrap gap-2">
        {entries.map((entry) => (
          <span
            key={entry.key}
            className="max-w-full break-words rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-50 [overflow-wrap:anywhere]"
          >
            <span className="font-black text-violet-200/80">{entry.label}:</span>{" "}
            {entry.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function EmotionalMetadataEditor({
  draft,
  disabled,
  saveState,
  onFieldChange,
  onSave,
}: {
  draft: EmotionalMetadataDraft;
  disabled: boolean;
  saveState?: EmotionalSaveState;
  onFieldChange: (field: keyof EmotionalMetadataDraft, value: string) => void;
  onSave: () => void;
}) {
  const isSaving = saveState?.status === "saving";

  return (
    <div className="mt-4 rounded-2xl border border-violet-300/15 bg-black/30 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">
          Edit Emotional Metadata
        </p>
        <p className="text-xs font-semibold text-white/35">
          Manual tags only. Leave blank to clear.
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
            Energy (0-100)
          </span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={draft.energy}
            disabled={disabled}
            onChange={(event) => onFieldChange("energy", event.target.value)}
            className={`${emotionalFieldClass} mt-1`}
            placeholder="72"
          />
        </label>

        <label className="block min-w-0">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
            Tempo BPM
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={draft.tempoBpm}
            disabled={disabled}
            onChange={(event) => onFieldChange("tempoBpm", event.target.value)}
            className={`${emotionalFieldClass} mt-1`}
            placeholder="98"
          />
        </label>

        <EmotionalSelectField
          label="Atmosphere"
          value={draft.atmosphere}
          disabled={disabled}
          options={buildTaxonomySelectOptions(ATMOSPHERE_OPTIONS, draft.atmosphere)}
          onChange={(value) => onFieldChange("atmosphere", value)}
        />
        <EmotionalSelectField
          label="Emotion"
          value={draft.emotion}
          disabled={disabled}
          options={buildTaxonomySelectOptions(EMOTION_OPTIONS, draft.emotion)}
          onChange={(value) => onFieldChange("emotion", value)}
        />
        <EmotionalSelectField
          label="Texture"
          value={draft.texture}
          disabled={disabled}
          options={buildTaxonomySelectOptions(TEXTURE_OPTIONS, draft.texture)}
          onChange={(value) => onFieldChange("texture", value)}
        />
        <EmotionalSelectField
          label="Time of day"
          value={draft.timeOfDay}
          disabled={disabled}
          options={buildTaxonomySelectOptions(TIME_OF_DAY_OPTIONS, draft.timeOfDay)}
          onChange={(value) => onFieldChange("timeOfDay", value)}
        />
        <EmotionalSelectField
          label="Vocal feel"
          value={draft.vocalFeel}
          disabled={disabled}
          options={buildTaxonomySelectOptions(VOCAL_FEEL_OPTIONS, draft.vocalFeel)}
          onChange={(value) => onFieldChange("vocalFeel", value)}
        />
        <EmotionalSelectField
          label="Instrumentation"
          value={draft.instrumentation}
          disabled={disabled}
          options={buildTaxonomySelectOptions(
            INSTRUMENTATION_OPTIONS,
            draft.instrumentation
          )}
          onChange={(value) => onFieldChange("instrumentation", value)}
        />
        <EmotionalSelectField
          label="Analysis status"
          value={draft.analysisStatus}
          disabled={disabled}
          options={buildTaxonomySelectOptions(
            ANALYSIS_STATUS_OPTIONS,
            draft.analysisStatus
          )}
          onChange={(value) => onFieldChange("analysisStatus", value)}
        />
        <EmotionalSelectField
          label="Analysis source"
          value={draft.analysisSource}
          disabled={disabled}
          options={buildTaxonomySelectOptions(
            ANALYSIS_SOURCE_OPTIONS,
            draft.analysisSource
          )}
          onChange={(value) => onFieldChange("analysisSource", value)}
        />
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className="mt-4 rounded-2xl border border-violet-300/25 bg-violet-400/15 px-4 py-3 text-sm font-black text-violet-50 transition hover:-translate-y-0.5 hover:border-violet-300/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? "Saving Emotional Metadata..." : "Save Emotional Metadata"}
      </button>

      {saveState?.message ? (
        <p
          className={`mt-3 text-sm font-semibold ${
            saveState.status === "error"
              ? "text-red-200"
              : saveState.status === "success"
                ? "text-emerald-200"
                : "text-violet-100/80"
          }`}
        >
          {saveState.message}
        </p>
      ) : null}
    </div>
  );
}

function EmotionalSelectField({
  label,
  value,
  disabled,
  options,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${emotionalFieldClass} mt-1 appearance-none`}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value || "empty"}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
