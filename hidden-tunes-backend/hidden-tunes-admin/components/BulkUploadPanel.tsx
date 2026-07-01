"use client";

import { useMemo, useRef, useState } from "react";

import ControlledGenreFields from "@/components/ControlledGenreFields";
import { supabase } from "@/lib/auth";
import { resolveGenreFields } from "@/lib/controlledGenreState";
import {
  buildEmotionalRequestBody,
  emptyEmotionalDraft,
  hasEmotionalDraftValues,
  validateEmotionalDraft,
  type EmotionalMetadataDraft,
} from "@/lib/emotionalMetadata";
import {
  buildNormalizedGenrePayload,
  getDefaultMainGenreId,
  getDefaultSubgenreId,
} from "@/lib/uploadGenreTaxonomy";

type UploadStatus = "idle" | "ready" | "uploading" | "success" | "error";

type TrackUploadItem = {
  id: string;
  file: File;
  title: string;
  artist: string;
  album: string;
  mainGenreId: string;
  subgenreId: string;
  genre: string;
  mood: string;
  emotional: EmotionalMetadataDraft;
  duration: number;
  artworkFile?: File | null;
  lyricsFile?: File | null;
  lrcFile?: File | null;
  status: UploadStatus;
  progress: number;
  error?: string;
  warning?: string;
};

type SignedUploadResponse = {
  success: boolean;
  signedUrl: string;
  key: string;
  publicUrl: string;
  bucket?: string;
  contentType?: string;
  error?: string;
};

type ServerUploadResponse = {
  success: boolean;
  key: string;
  publicUrl: string;
  bucket?: string;
  contentType?: string;
  error?: string;
};

const FALLBACK_ARTIST = "Hidden Tunes";
const FALLBACK_ALBUM = "Singles";

const emotionalFieldClass =
  "w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none transition placeholder:text-white/25 focus:border-violet-300/40";

function EmotionalUploadFields({
  draft,
  disabled,
  onChange,
}: {
  draft: EmotionalMetadataDraft;
  disabled?: boolean;
  onChange: (patch: Partial<EmotionalMetadataDraft>) => void;
}) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <label className="space-y-1 text-xs text-white/45">
        Energy (0–100)
        <input
          type="number"
          min={0}
          max={100}
          disabled={disabled}
          value={draft.energy}
          onChange={(event) => onChange({ energy: event.target.value })}
          placeholder="Optional"
          className={emotionalFieldClass}
        />
      </label>

      <label className="space-y-1 text-xs text-white/45">
        Tempo (BPM)
        <input
          type="number"
          min={1}
          disabled={disabled}
          value={draft.tempoBpm}
          onChange={(event) => onChange({ tempoBpm: event.target.value })}
          placeholder="Optional"
          className={emotionalFieldClass}
        />
      </label>

      <label className="space-y-1 text-xs text-white/45">
        Emotion
        <input
          disabled={disabled}
          value={draft.emotion}
          onChange={(event) => onChange({ emotion: event.target.value })}
          placeholder="Optional"
          className={emotionalFieldClass}
        />
      </label>

      <label className="space-y-1 text-xs text-white/45">
        Atmosphere
        <input
          disabled={disabled}
          value={draft.atmosphere}
          onChange={(event) => onChange({ atmosphere: event.target.value })}
          placeholder="Optional"
          className={emotionalFieldClass}
        />
      </label>

      <label className="space-y-1 text-xs text-white/45">
        Texture
        <input
          disabled={disabled}
          value={draft.texture}
          onChange={(event) => onChange({ texture: event.target.value })}
          placeholder="Optional"
          className={emotionalFieldClass}
        />
      </label>

      <label className="space-y-1 text-xs text-white/45">
        Time of day
        <input
          disabled={disabled}
          value={draft.timeOfDay}
          onChange={(event) => onChange({ timeOfDay: event.target.value })}
          placeholder="Optional"
          className={emotionalFieldClass}
        />
      </label>

      <label className="space-y-1 text-xs text-white/45">
        Vocal feel
        <input
          disabled={disabled}
          value={draft.vocalFeel}
          onChange={(event) => onChange({ vocalFeel: event.target.value })}
          placeholder="Optional"
          className={emotionalFieldClass}
        />
      </label>

      <label className="space-y-1 text-xs text-white/45">
        Instrumentation
        <input
          disabled={disabled}
          value={draft.instrumentation}
          onChange={(event) => onChange({ instrumentation: event.target.value })}
          placeholder="Optional"
          className={emotionalFieldClass}
        />
      </label>

      <label className="space-y-1 text-xs text-white/45">
        Analysis status
        <input
          disabled={disabled}
          value={draft.analysisStatus}
          onChange={(event) => onChange({ analysisStatus: event.target.value })}
          placeholder="e.g. manual"
          className={emotionalFieldClass}
        />
      </label>

      <label className="space-y-1 text-xs text-white/45 sm:col-span-2 lg:col-span-3">
        Analysis source
        <input
          disabled={disabled}
          value={draft.analysisSource}
          onChange={(event) => onChange({ analysisSource: event.target.value })}
          placeholder="e.g. admin_upload"
          className={emotionalFieldClass}
        />
      </label>
    </div>
  );
}

class UploadStepError extends Error {
  step: string;

  constructor(step: string, message: string) {
    super(message);
    this.name = "UploadStepError";
    this.step = step;
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getUploadStep(error: unknown) {
  return error instanceof UploadStepError ? error.step : "upload";
}

const API_UPLOAD_URL = "/api/admin/upload-track";
const API_SIGNED_UPLOAD_URL = "/api/upload-url";
const API_SERVER_UPLOAD_URL = "/api/admin/upload-file";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanName(value: string) {
  return value
    .replace(/\.[^/.]+$/, "")
    .replace(/^\d+\s*[.\-_ ]+\s*/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchKey(value: string) {
  return cleanName(value).toLowerCase();
}

function buildMatchKeys(value: string) {
  const base = matchKey(value);
  const keys = new Set<string>();

  if (base) keys.add(base);

  const noBrackets = base
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (noBrackets) keys.add(noBrackets);

  const parts = base
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    keys.add(parts[parts.length - 1]);
  }

  return Array.from(keys);
}

function guessMetadata(file: File) {
  const name = cleanName(file.name);

  if (name.includes(" - ")) {
    const [artist, ...rest] = name.split(" - ");

    return {
      artist: artist?.trim() || "Unknown Artist",
      title: rest.join(" - ").trim() || name,
    };
  }

  return {
    artist: "",
    title: name || "Untitled Song",
  };
}

function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);

    audio.preload = "metadata";
    audio.src = url;

    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration)
        ? Math.round(audio.duration)
        : 0;

      URL.revokeObjectURL(url);
      resolve(duration);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}

function isAudioFile(file: File) {
  return (
    file.type.startsWith("audio/") ||
    file.name.toLowerCase().endsWith(".mp3") ||
    file.name.toLowerCase().endsWith(".wav") ||
    file.name.toLowerCase().endsWith(".m4a")
  );
}

function isArtworkFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    file.name.toLowerCase().endsWith(".jpg") ||
    file.name.toLowerCase().endsWith(".jpeg") ||
    file.name.toLowerCase().endsWith(".png") ||
    file.name.toLowerCase().endsWith(".webp")
  );
}

function isLyricsFile(file: File) {
  return (
    file.name.toLowerCase().endsWith(".txt") ||
    file.name.toLowerCase().endsWith(".lyrics")
  );
}

function isLrcFile(file: File) {
  return file.name.toLowerCase().endsWith(".lrc");
}

function buildFileMap(files: File[]) {
  const map = new Map<string, File>();

  files.forEach((file) => {
    buildMatchKeys(file.name).forEach((key) => {
      if (!map.has(key)) {
        map.set(key, file);
      }
    });
  });

  return map;
}

async function getUploadAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new UploadStepError(
      "admin auth",
      "Your admin session is missing or expired. Sign in again before uploading."
    );
  }

  return accessToken;
}

async function getSignedUploadUrl(
  file: File,
  folder: string,
  accessToken: string
) {
  const response = await fetch(API_SIGNED_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      folder,
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | SignedUploadResponse
    | null;

  if (!response.ok || !data?.success || !data.signedUrl) {
    console.error("Hidden Tunes upload sign-url failed", {
      folder,
      fileName: file.name,
      status: response.status,
      error: data?.error,
    });

    throw new Error(
      data?.error || `Failed to create upload URL. Status ${response.status}`
    );
  }

  return data;
}

function uploadFileDirectToR2(
  file: File,
  uploadInfo: SignedUploadResponse,
  onProgress?: (progress: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const uploadHost = new URL(uploadInfo.signedUrl).host;
    const contentType =
      uploadInfo.contentType || file.type || "application/octet-stream";

    xhr.open("PUT", uploadInfo.signedUrl);
    xhr.withCredentials = false;
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.timeout = 1000 * 60 * 30;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;

      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(percent);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.info("Hidden Tunes direct R2 upload succeeded", {
          key: uploadInfo.key,
          bucket: uploadInfo.bucket || "unknown",
          contentType,
          status: xhr.status,
          target: uploadHost,
        });
        resolve();
        return;
      }

      console.error("Hidden Tunes direct R2 upload failed", {
        key: uploadInfo.key,
        bucket: uploadInfo.bucket || "unknown",
        contentType,
        status: xhr.status,
        target: uploadHost,
        responseText: xhr.responseText?.slice(0, 500) || "",
      });

      reject(
        new Error(
          `R2 upload failed with status ${xhr.status}${
            xhr.responseText ? `: ${xhr.responseText.slice(0, 160)}` : ""
          }`
        )
      );
    };

    xhr.onerror = () => {
      console.error("Hidden Tunes direct R2 upload network/CORS error", {
        key: uploadInfo.key,
        bucket: uploadInfo.bucket || "unknown",
        contentType,
        target: uploadHost,
      });

      reject(
        new Error(
          `Browser could not complete the direct R2 upload to ${uploadHost}. This usually means the Cloudflare R2 bucket CORS policy is missing this admin origin, PUT, or Content-Type.`
        )
      );
    };

    xhr.ontimeout = () => {
      reject(new Error("R2 upload timed out before completion"));
    };

    xhr.onabort = () => {
      reject(new Error("R2 upload was cancelled"));
    };

    xhr.send(file);
  });
}

function uploadFileViaAdminRoute(
  file: File,
  folder: string,
  accessToken: string,
  uploadInfo: SignedUploadResponse,
  onProgress?: (progress: number) => void
) {
  return new Promise<{ key: string; publicUrl: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("file", file);
    formData.append("folder", folder);
    formData.append("key", uploadInfo.key);

    xhr.open("POST", API_SERVER_UPLOAD_URL);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.timeout = 1000 * 60 * 30;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;

      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(percent);
    };

    xhr.onload = () => {
      const data = (() => {
        try {
          return JSON.parse(xhr.responseText || "{}") as ServerUploadResponse;
        } catch {
          return null;
        }
      })();

      if (xhr.status >= 200 && xhr.status < 300 && data?.success) {
        console.info("Hidden Tunes server fallback R2 upload succeeded", {
          key: data.key,
          bucket: data.bucket || uploadInfo.bucket || "unknown",
          contentType:
            data.contentType ||
            uploadInfo.contentType ||
            file.type ||
            "application/octet-stream",
          status: xhr.status,
        });

        resolve({
          key: data.key,
          publicUrl: data.publicUrl,
        });
        return;
      }

      console.error("Hidden Tunes server fallback R2 upload failed", {
        key: uploadInfo.key,
        bucket: uploadInfo.bucket || "unknown",
        contentType:
          uploadInfo.contentType || file.type || "application/octet-stream",
        status: xhr.status,
        responseText: xhr.responseText?.slice(0, 500) || "",
        error: data?.error,
      });

      reject(
        new Error(
          data?.error ||
            `Server fallback upload failed with status ${xhr.status}`
        )
      );
    };

    xhr.onerror = () => {
      console.error("Hidden Tunes server fallback upload network error", {
        key: uploadInfo.key,
        bucket: uploadInfo.bucket || "unknown",
        contentType:
          uploadInfo.contentType || file.type || "application/octet-stream",
      });
      reject(new Error("Server fallback upload could not reach the admin API"));
    };

    xhr.ontimeout = () => {
      reject(new Error("Server fallback upload timed out before completion"));
    };

    xhr.onabort = () => {
      reject(new Error("Server fallback upload was cancelled"));
    };

    xhr.send(formData);
  });
}

async function uploadFileToR2(
  file: File,
  folder: string,
  accessToken: string,
  onProgress?: (progress: number) => void
) {
  let uploadInfo: SignedUploadResponse;

  try {
    uploadInfo = await getSignedUploadUrl(file, folder, accessToken);
  } catch (error: unknown) {
    throw new UploadStepError(
      `${folder} signed URL`,
      getErrorMessage(error, `Failed to prepare ${folder} upload`)
    );
  }

  try {
    await uploadFileDirectToR2(file, uploadInfo, onProgress);
  } catch (error: unknown) {
    console.warn("Hidden Tunes direct R2 upload failed; trying server fallback", {
      key: uploadInfo.key,
      bucket: uploadInfo.bucket || "unknown",
      contentType:
        uploadInfo.contentType || file.type || "application/octet-stream",
      directUploadStatus: getErrorMessage(error, "direct upload failed"),
    });

    try {
      return await uploadFileViaAdminRoute(
        file,
        folder,
        accessToken,
        uploadInfo,
        onProgress
      );
    } catch (fallbackError: unknown) {
      throw new UploadStepError(
        `${folder} R2 upload`,
        `${getErrorMessage(
          error,
          `Failed to upload ${file.name} directly to R2`
        )} Server fallback also failed: ${getErrorMessage(
          fallbackError,
          "admin upload API failed"
        )}`
      );
    }
  }

  return {
    key: uploadInfo.key,
    publicUrl: uploadInfo.publicUrl,
  };
}

async function readTextFile(file: File | null | undefined) {
  if (!file) return "";

  try {
    return await file.text();
  } catch {
    return "";
  }
}

export default function BulkUploadPanel() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const artworkInputRef = useRef<HTMLInputElement | null>(null);
  const lyricsInputRef = useRef<HTMLInputElement | null>(null);
  const lrcInputRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<TrackUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [defaultArtist, setDefaultArtist] = useState("");
  const [defaultAlbum, setDefaultAlbum] = useState(FALLBACK_ALBUM);
  const [defaultMainGenreId, setDefaultMainGenreId] = useState(getDefaultMainGenreId);
  const [defaultSubgenreId, setDefaultSubgenreId] = useState(getDefaultSubgenreId);
  const [defaultMood, setDefaultMood] = useState("");
  const [defaultEmotional, setDefaultEmotional] = useState(emptyEmotionalDraft);
  const [globalArtwork, setGlobalArtwork] = useState<File | null>(null);
  const [globalLyrics, setGlobalLyrics] = useState<File | null>(null);
  const [globalLrc, setGlobalLrc] = useState<File | null>(null);

  const [bulkArtworkFiles, setBulkArtworkFiles] = useState<File[]>([]);
  const [bulkLyricsFiles, setBulkLyricsFiles] = useState<File[]>([]);
  const [bulkLrcFiles, setBulkLrcFiles] = useState<File[]>([]);

  const [isUploadingAll, setIsUploadingAll] = useState(false);

  const artworkMap = useMemo(
    () => buildFileMap(bulkArtworkFiles),
    [bulkArtworkFiles]
  );

  const lyricsMap = useMemo(
    () => buildFileMap(bulkLyricsFiles),
    [bulkLyricsFiles]
  );

  const lrcMap = useMemo(() => buildFileMap(bulkLrcFiles), [bulkLrcFiles]);

  const stats = useMemo(() => {
    const total = items.length;
    const success = items.filter((item) => item.status === "success").length;
    const error = items.filter((item) => item.status === "error").length;
    const uploading = items.filter((item) => item.status === "uploading").length;

    return { total, success, error, uploading };
  }, [items]);

  function findMatchingFile(file: File, map: Map<string, File>) {
    for (const key of buildMatchKeys(file.name)) {
      const match = map.get(key);
      if (match) return match;
    }

    return null;
  }

  function getFallbackArtist() {
    return defaultArtist.trim() || FALLBACK_ARTIST;
  }

  async function addFiles(files: FileList | File[]) {
    const allFiles = Array.from(files);

    const audioFiles = allFiles.filter(isAudioFile);
    const artworkFiles = allFiles.filter(isArtworkFile);
    const lyricsFiles = allFiles.filter(isLyricsFile);
    const lrcFiles = allFiles.filter(isLrcFile);

    const nextArtworkFiles = artworkFiles.length
      ? [...bulkArtworkFiles, ...artworkFiles]
      : bulkArtworkFiles;

    const nextLyricsFiles = lyricsFiles.length
      ? [...bulkLyricsFiles, ...lyricsFiles]
      : bulkLyricsFiles;

    const nextLrcFiles = lrcFiles.length
      ? [...bulkLrcFiles, ...lrcFiles]
      : bulkLrcFiles;

    const nextArtworkMap = buildFileMap(nextArtworkFiles);
    const nextLyricsMap = buildFileMap(nextLyricsFiles);
    const nextLrcMap = buildFileMap(nextLrcFiles);

    if (artworkFiles.length) setBulkArtworkFiles(nextArtworkFiles);
    if (lyricsFiles.length) setBulkLyricsFiles(nextLyricsFiles);
    if (lrcFiles.length) setBulkLrcFiles(nextLrcFiles);

    const prepared: TrackUploadItem[] = [];

    for (const file of audioFiles) {
      const guessed = guessMetadata(file);
      const duration = await getAudioDuration(file);
      const matchedArtwork = findMatchingFile(file, nextArtworkMap) || globalArtwork;
      const matchedLyrics = findMatchingFile(file, nextLyricsMap) || globalLyrics;
      const matchedLrc = findMatchingFile(file, nextLrcMap) || globalLrc;

      prepared.push({
        id: makeId(),
        file,
        title: guessed.title,
        artist: guessed.artist || getFallbackArtist(),
        album: defaultAlbum || FALLBACK_ALBUM,
        ...resolveGenreFields(defaultMainGenreId, defaultSubgenreId),
        mood: defaultMood,
        emotional: hasEmotionalDraftValues(defaultEmotional)
          ? { ...defaultEmotional }
          : emptyEmotionalDraft(),
        duration,
        artworkFile: matchedArtwork,
        lyricsFile: matchedLyrics,
        lrcFile: matchedLrc,
        status: "ready",
        progress: 0,
        warning: matchedArtwork
          ? undefined
          : "No matching artwork yet. Select matching artwork or apply album artwork before upload.",
      });
    }

    setItems((current) => {
      const existingAudioKeys = new Set(
        current.flatMap((item) => buildMatchKeys(item.file.name))
      );
      const newItems = prepared.filter(
        (item) =>
          !buildMatchKeys(item.file.name).some((key) => existingAudioKeys.has(key))
      );
      const updated = current.map((item) => ({
        ...item,
        artworkFile:
          item.artworkFile ||
          findMatchingFile(item.file, nextArtworkMap) ||
          globalArtwork,
        lyricsFile:
          item.lyricsFile ||
          findMatchingFile(item.file, nextLyricsMap) ||
          globalLyrics,
        lrcFile:
          item.lrcFile || findMatchingFile(item.file, nextLrcMap) || globalLrc,
      }));

      return [...newItems, ...updated];
    });
  }

  function updateItem(id: string, patch: Partial<TrackUploadItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function clearCompleted() {
    setItems((current) => current.filter((item) => item.status !== "success"));
  }

  function matchAssetsToExistingSongs() {
    setItems((current) =>
      current.map((item) => {
        const artworkFile =
          findMatchingFile(item.file, artworkMap) ||
          item.artworkFile ||
          globalArtwork;

        return {
          ...item,
          artworkFile,
          lyricsFile:
            findMatchingFile(item.file, lyricsMap) ||
            item.lyricsFile ||
            globalLyrics,
          lrcFile:
            findMatchingFile(item.file, lrcMap) || item.lrcFile || globalLrc,
          warning: artworkFile ? undefined : item.warning,
        };
      })
    );
  }

  async function uploadSingle(item: TrackUploadItem) {
    updateItem(item.id, {
      status: "uploading",
      progress: 5,
      error: undefined,
      warning: undefined,
    });

    try {
      const accessToken = await getUploadAccessToken();
      const artworkToUpload = item.artworkFile || globalArtwork || null;
      const plainLyricsToRead = item.lyricsFile || globalLyrics;
      const syncedLrcToRead = item.lrcFile || globalLrc;

      updateItem(item.id, { progress: 10 });

      const audioUpload = await uploadFileToR2(
        item.file,
        "songs",
        accessToken,
        (directProgress) => {
          updateItem(item.id, {
            progress: Math.min(65, 10 + Math.round(directProgress * 0.55)),
          });
        }
      );

      let artworkUpload: { key: string; publicUrl: string } | null = null;

      if (artworkToUpload) {
        updateItem(item.id, { progress: 70 });

        artworkUpload = await uploadFileToR2(
          artworkToUpload,
          "covers",
          accessToken,
          (directProgress) => {
            updateItem(item.id, {
              progress: Math.min(85, 70 + Math.round(directProgress * 0.15)),
            });
          }
        );
      }

      updateItem(item.id, { progress: 88 });

      let plainLyricsText = "";
      let syncedLrcText = "";

      try {
        plainLyricsText = await readTextFile(plainLyricsToRead);
        syncedLrcText = await readTextFile(syncedLrcToRead);
      } catch (error: unknown) {
        throw new UploadStepError(
          "lyrics read",
          getErrorMessage(error, "Failed to read TXT or LRC lyrics file")
        );
      }

      const genrePayload =
        buildNormalizedGenrePayload({
          mainGenreId: item.mainGenreId || defaultMainGenreId,
          subgenreId: item.subgenreId || defaultSubgenreId,
        }) ||
        buildNormalizedGenrePayload({
          mainGenreId: defaultMainGenreId,
          subgenreId: defaultSubgenreId,
        });

      const emotionalValidation = validateEmotionalDraft(item.emotional);

      if (!emotionalValidation.ok) {
        throw new UploadStepError(
          "emotional metadata",
          emotionalValidation.error
        );
      }

      const emotionalPayload = buildEmotionalRequestBody(item.emotional);

      let response: Response;

      try {
        response = await fetch(API_UPLOAD_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: item.title,
            artist: item.artist || getFallbackArtist(),
            album: item.album || defaultAlbum || FALLBACK_ALBUM,
            genre: genrePayload?.genre,
            mainGenreId: genrePayload?.mainGenreId,
            subgenreId: genrePayload?.subgenreId,
            mainGenre: genrePayload?.mainGenre,
            subGenre: genrePayload?.subGenre,
            genreSlug: genrePayload?.genreSlug,
            mood: item.mood || defaultMood,
            duration: item.duration,

            audioUrl: audioUpload.publicUrl,
            audioKey: audioUpload.key,

            artworkUrl: artworkUpload?.publicUrl || null,
            artworkKey: artworkUpload?.key || null,

            lyricsText: syncedLrcText || plainLyricsText,
            plainLyricsText,
            syncedLrcText,

            ...emotionalPayload,
          }),
        });
      } catch (error: unknown) {
        throw new UploadStepError(
          "Supabase catalog save",
          `Could not reach the admin upload API. Check that the admin dev server is running on the same origin. ${getErrorMessage(
            error,
            "Network request failed"
          )}`
        );
      }

      updateItem(item.id, { progress: 95 });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new UploadStepError(
          "Supabase catalog save",
          response.status === 409
            ? data?.error || "Duplicate song blocked by catalog safety check"
            : data?.error ||
            data?.message ||
            `Metadata save failed with status ${response.status}`
        );
      }

      updateItem(item.id, {
        status: "success",
        progress: 100,
        error: undefined,
        warning: data?.warning,
      });
    } catch (error: unknown) {
      const step = getUploadStep(error);
      const message = getErrorMessage(error, "Upload failed");

      updateItem(item.id, {
        status: "error",
        progress: 0,
        error: `${step}: ${message}`,
      });
    }
  }

  async function uploadAll() {
    const pending = items.filter(
      (item) => item.status === "ready" || item.status === "error"
    );

    if (!pending.length) return;

    setIsUploadingAll(true);

    try {
      for (const item of pending) {
        await uploadSingle(item);
      }
    } finally {
      setIsUploadingAll(false);
    }
  }

  function applyDefaultArtistToAll() {
    const artist = defaultArtist.trim();

    if (!artist) return;

    setItems((current) =>
      current.map((item) => ({
        ...item,
        artist,
      }))
    );
  }

  function applyAlbumDefaultsToAll() {
    const resolvedGenre = resolveGenreFields(defaultMainGenreId, defaultSubgenreId);

    setItems((current) =>
      current.map((item) => ({
        ...item,
        album: defaultAlbum.trim() || item.album || FALLBACK_ALBUM,
        ...resolvedGenre,
        mood: defaultMood.trim() || item.mood,
        emotional: hasEmotionalDraftValues(defaultEmotional)
          ? { ...defaultEmotional }
          : item.emotional,
        lyricsFile:
          item.lyricsFile || findMatchingFile(item.file, lyricsMap) || globalLyrics,
        lrcFile: item.lrcFile || findMatchingFile(item.file, lrcMap) || globalLrc,
      }))
    );
  }

  function applyAlbumArtworkToAll() {
    if (!globalArtwork) return;

    setItems((current) =>
      current.map((item) => ({
        ...item,
        artworkFile: globalArtwork,
        warning: undefined,
      }))
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050508] text-white">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-8 px-3 py-5 sm:px-6 lg:px-8">
        <header className="min-w-0 rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#17171f] via-[#0b0b10] to-black p-5 shadow-2xl sm:p-6">
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400">
                Hidden Tunes Admin
              </p>

              <h1 className="break-words text-3xl font-black tracking-tight sm:text-5xl">
                Bulk Upload Studio
              </h1>

              <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-white/60 sm:text-base">
                Upload songs, matching artwork, lyrics, synced LRC files, create
                artists and albums, store tracks directly in Cloudflare R2, and
                insert catalog records into Supabase.
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-3 text-center sm:grid-cols-4">
              <div>
                <p className="text-2xl font-black">{stats.total}</p>
                <p className="text-xs text-white/45">Total</p>
              </div>

              <div>
                <p className="text-2xl font-black text-yellow-300">
                  {stats.uploading}
                </p>
                <p className="text-xs text-white/45">Uploading</p>
              </div>

              <div>
                <p className="text-2xl font-black text-emerald-300">
                  {stats.success}
                </p>
                <p className="text-xs text-white/45">Done</p>
              </div>

              <div>
                <p className="text-2xl font-black text-red-300">
                  {stats.error}
                </p>
                <p className="text-xs text-white/45">Errors</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
          <aside className="flex min-w-0 flex-col gap-5">
            <div className="min-w-0 rounded-[2rem] border border-white/10 bg-[#101017] p-5 shadow-xl">
              <h2 className="text-lg font-black">Default Metadata</h2>

              <div className="mt-5 flex flex-col gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/45">
                    Album / default artist
                  </span>
                  <input
                    value={defaultArtist}
                    onChange={(event) => setDefaultArtist(event.target.value)}
                    placeholder="Optional. Leave blank to preserve extracted artists."
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-400"
                  />
                  <span className="block text-xs leading-5 text-white/40">
                    Blank means existing song artists stay untouched. Unknown
                    songs fall back to Hidden Tunes only at upload time.
                  </span>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/45">
                    Album
                  </span>
                  <input
                    value={defaultAlbum}
                    onChange={(event) => setDefaultAlbum(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-400"
                  />
                </label>

                <ControlledGenreFields
                  mainGenreId={defaultMainGenreId}
                  subgenreId={defaultSubgenreId}
                  onMainGenreChange={(mainGenreId, subgenreId) => {
                    setDefaultMainGenreId(mainGenreId);
                    setDefaultSubgenreId(subgenreId);
                  }}
                  onSubgenreChange={setDefaultSubgenreId}
                />

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/45">
                    Mood
                  </span>
                  <input
                    value={defaultMood}
                    onChange={(event) => setDefaultMood(event.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-400"
                  />
                </label>

                <details className="rounded-2xl border border-violet-400/15 bg-violet-500/[0.04] px-4 py-3">
                  <summary className="cursor-pointer text-sm font-bold text-violet-200/90">
                    Emotional tags (optional)
                  </summary>
                  <p className="mt-2 text-xs leading-5 text-white/40">
                    Leave blank to skip. Applied to new songs and via Apply Album
                    defaults.
                  </p>
                  <EmotionalUploadFields
                    draft={defaultEmotional}
                    onChange={(patch) =>
                      setDefaultEmotional((current) => ({ ...current, ...patch }))
                    }
                  />
                </details>

                <button
                  onClick={applyDefaultArtistToAll}
                  disabled={!defaultArtist.trim()}
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Apply Default Artist To All
                </button>

                <button
                  onClick={applyAlbumDefaultsToAll}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white/80 transition hover:border-yellow-400"
                >
                  Apply Album, Genre & Mood To All
                </button>

                <p className="text-xs leading-5 text-white/45">
                  Artist is intentional: the button only applies the artist
                  currently typed above. It will never silently force Caasi
                  Wills or any genre.
                </p>
              </div>
            </div>

            <div className="min-w-0 rounded-[2rem] border border-white/10 bg-[#101017] p-5 shadow-xl">
              <h2 className="text-lg font-black">Assets</h2>

              <div className="mt-5 flex flex-col gap-3">
                <button
                  onClick={() => artworkInputRef.current?.click()}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold transition hover:border-yellow-400"
                >
                  Bulk Artwork:{" "}
                  <span className="text-white/50">
                    {bulkArtworkFiles.length
                      ? `${bulkArtworkFiles.length} images selected`
                      : globalArtwork?.name || "Choose one or many images"}
                  </span>
                </button>

                <button
                  onClick={applyAlbumArtworkToAll}
                  disabled={!globalArtwork || !items.length}
                  className="rounded-2xl border border-yellow-400/30 bg-yellow-300/10 px-4 py-3 text-left text-sm font-black text-yellow-200 transition hover:bg-yellow-300/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Use This Artwork For All Album Songs
                </button>

                <button
                  onClick={() => lyricsInputRef.current?.click()}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold transition hover:border-yellow-400"
                >
                  Lyrics:{" "}
                  <span className="text-white/50">
                    {bulkLyricsFiles.length
                      ? `${bulkLyricsFiles.length} TXT files selected`
                      : globalLyrics?.name || "Choose TXT"}
                  </span>
                </button>

                <button
                  onClick={() => lrcInputRef.current?.click()}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-bold transition hover:border-yellow-400"
                >
                  Synced LRC:{" "}
                  <span className="text-white/50">
                    {bulkLrcFiles.length
                      ? `${bulkLrcFiles.length} LRC files selected`
                      : globalLrc?.name || "Choose LRC"}
                  </span>
                </button>

                <button
                  onClick={matchAssetsToExistingSongs}
                  className="rounded-2xl border border-yellow-400/30 bg-yellow-300/10 px-4 py-3 text-left text-sm font-black text-yellow-200 transition hover:bg-yellow-300/15"
                >
                  Match Assets To Songs
                </button>

                <p className="text-xs leading-5 text-white/45">
                  Singles still match by filename: Lonely Road.mp3 + Lonely
                  Road.jpg. For albums, choose one image and press Use This
                  Artwork For All Album Songs.
                </p>

                <input
                  ref={artworkInputRef}
                  hidden
                  multiple
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []).filter(
                      isArtworkFile
                    );

                    if (!files.length) return;

                    if (files.length === 1) setGlobalArtwork(files[0]);

                    const nextFiles = [...bulkArtworkFiles, ...files];
                    const nextMap = buildFileMap(nextFiles);
                    const albumArtwork = files.length === 1 ? files[0] : globalArtwork;

                    setBulkArtworkFiles(nextFiles);
                    setItems((current) =>
                      current.map((item) => {
                        const artworkFile =
                          findMatchingFile(item.file, nextMap) ||
                          item.artworkFile ||
                          albumArtwork;

                        return {
                          ...item,
                          artworkFile,
                          warning: artworkFile ? undefined : item.warning,
                        };
                      })
                    );
                    event.target.value = "";
                  }}
                />

                <input
                  ref={lyricsInputRef}
                  hidden
                  multiple
                  type="file"
                  accept=".txt,.lyrics"
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []).filter(
                      isLyricsFile
                    );

                    if (!files.length) return;

                    if (files.length === 1) {
                      setGlobalLyrics(files[0]);
                    }

                    const nextFiles = [...bulkLyricsFiles, ...files];
                    const nextMap = buildFileMap(nextFiles);
                    const fallbackLyrics = files.length === 1 ? files[0] : globalLyrics;

                    setBulkLyricsFiles(nextFiles);
                    setItems((current) =>
                      current.map((item) => ({
                        ...item,
                        lyricsFile:
                          findMatchingFile(item.file, nextMap) ||
                          item.lyricsFile ||
                          fallbackLyrics,
                      }))
                    );
                    event.target.value = "";
                  }}
                />

                <input
                  ref={lrcInputRef}
                  hidden
                  multiple
                  type="file"
                  accept=".lrc"
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []).filter(
                      isLrcFile
                    );

                    if (!files.length) return;

                    if (files.length === 1) {
                      setGlobalLrc(files[0]);
                    }

                    const nextFiles = [...bulkLrcFiles, ...files];
                    const nextMap = buildFileMap(nextFiles);
                    const fallbackLrc = files.length === 1 ? files[0] : globalLrc;

                    setBulkLrcFiles(nextFiles);
                    setItems((current) =>
                      current.map((item) => ({
                        ...item,
                        lrcFile:
                          findMatchingFile(item.file, nextMap) ||
                          item.lrcFile ||
                          fallbackLrc,
                      }))
                    );
                    event.target.value = "";
                  }}
                />
              </div>
            </div>
          </aside>

          <section className="flex min-w-0 flex-col gap-5">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                addFiles(event.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={`min-w-0 cursor-pointer rounded-[2rem] border border-dashed p-6 text-center transition sm:p-8 ${
                isDragging
                  ? "border-yellow-300 bg-yellow-300/10"
                  : "border-white/15 bg-[#101017]"
              }`}
            >
              <input
                ref={inputRef}
                hidden
                multiple
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,image/*,.jpg,.jpeg,.png,.webp,.txt,.lyrics,.lrc"
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.target.value = "";
                }}
              />

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-yellow-300 text-3xl text-black">
                ↑
              </div>

              <h2 className="mt-5 break-words text-2xl font-black">
                Drag & drop songs and artwork here
              </h2>

              <p className="mt-2 break-words text-sm text-white/50">
                Supports MP3, WAV, M4A, JPG, PNG, WEBP, TXT, and LRC. Matching
                files by the same name are paired automatically.
              </p>
            </div>

            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                onClick={uploadAll}
                disabled={!items.length || isUploadingAll}
                className="min-w-0 flex-1 rounded-2xl bg-yellow-300 px-5 py-4 text-sm font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isUploadingAll ? "Uploading..." : "Upload All To Hidden Tunes"}
              </button>

              <button
                onClick={clearCompleted}
                className="min-w-0 rounded-2xl border border-white/10 px-5 py-4 text-sm font-black text-white/80 transition hover:border-white/30"
              >
                Clear Completed
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="min-w-0 rounded-[1.75rem] border border-white/10 bg-[#101017] p-4 shadow-xl"
                >
                  <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-all text-xs font-bold uppercase tracking-widest text-white/40">
                            {item.file.name}
                          </p>
                          <h3 className="mt-1 break-words text-xl font-black">
                            {item.title}
                          </h3>
                        </div>

                        <button
                          onClick={() => removeItem(item.id)}
                          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/50 hover:text-white"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <input
                          value={item.title}
                          onChange={(event) =>
                            updateItem(item.id, { title: event.target.value })
                          }
                          placeholder="Title"
                          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-yellow-400"
                        />

                        <input
                          value={item.artist}
                          onChange={(event) =>
                            updateItem(item.id, { artist: event.target.value })
                          }
                          placeholder="Artist"
                          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-yellow-400"
                        />

                        <input
                          value={item.album}
                          onChange={(event) =>
                            updateItem(item.id, { album: event.target.value })
                          }
                          placeholder="Album"
                          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-yellow-400"
                        />

                      </div>

                      <div className="mt-3">
                        <ControlledGenreFields
                          compact
                          mainGenreId={item.mainGenreId}
                          subgenreId={item.subgenreId}
                          disabled={item.status === "uploading"}
                          onMainGenreChange={(mainGenreId, subgenreId) =>
                            updateItem(
                              item.id,
                              resolveGenreFields(mainGenreId, subgenreId)
                            )
                          }
                          onSubgenreChange={(subgenreId) =>
                            updateItem(
                              item.id,
                              resolveGenreFields(item.mainGenreId, subgenreId)
                            )
                          }
                        />
                      </div>

                      <details className="mt-3 rounded-2xl border border-violet-400/15 bg-violet-500/[0.04] px-4 py-3">
                        <summary className="cursor-pointer text-sm font-bold text-violet-200/90">
                          Emotional tags (optional)
                          {hasEmotionalDraftValues(item.emotional) ? " · set" : ""}
                        </summary>
                        <EmotionalUploadFields
                          draft={item.emotional}
                          disabled={item.status === "uploading"}
                          onChange={(patch) =>
                            updateItem(item.id, {
                              emotional: { ...item.emotional, ...patch },
                            })
                          }
                        />
                      </details>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/50">
                        <span className="break-all rounded-full bg-white/[0.06] px-3 py-1">
                          Duration: {item.duration}s
                        </span>

                        <span className="break-all rounded-full bg-white/[0.06] px-3 py-1">
                          Genre: {item.genre || "—"}
                        </span>

                        <span className="break-all rounded-full bg-white/[0.06] px-3 py-1">
                          Mood: {item.mood}
                        </span>

                        <span className="break-all rounded-full bg-white/[0.06] px-3 py-1">
                          Artwork:{" "}
                          {item.artworkFile?.name || globalArtwork?.name || "No"}
                        </span>

                        <span className="break-all rounded-full bg-white/[0.06] px-3 py-1">
                          Lyrics:{" "}
                          {item.lyricsFile?.name || globalLyrics?.name || "No"}
                        </span>

                        <span className="break-all rounded-full bg-white/[0.06] px-3 py-1">
                          LRC: {item.lrcFile?.name || globalLrc?.name || "No"}
                        </span>
                      </div>

                      {item.status === "uploading" && (
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-yellow-300 transition-all"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}

                      {item.error && (
                        <p className="mt-3 break-words rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                          {item.error}
                        </p>
                      )}

                      {item.warning && (
                        <p className="mt-3 break-words rounded-2xl border border-yellow-400/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                          {item.warning}
                        </p>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-row gap-2 xl:w-[150px] xl:flex-col">
                      <button
                        onClick={() => uploadSingle(item)}
                        disabled={
                          item.status === "uploading" || item.status === "success"
                        }
                        className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-black text-black disabled:opacity-40"
                      >
                        {item.status === "success"
                          ? "Uploaded"
                          : item.status === "uploading"
                            ? "Uploading"
                            : "Upload"}
                      </button>

                      <div
                        className={`rounded-2xl px-4 py-3 text-center text-xs font-black uppercase tracking-widest ${
                          item.status === "success"
                            ? "bg-emerald-400/15 text-emerald-200"
                            : item.status === "error"
                              ? "bg-red-400/15 text-red-200"
                              : item.status === "uploading"
                                ? "bg-yellow-400/15 text-yellow-200"
                                : "bg-white/[0.06] text-white/50"
                        }`}
                      >
                        {item.status}
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              {!items.length && (
                <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-10 text-center">
                  <h3 className="text-xl font-black">No songs selected yet</h3>
                  <p className="mt-2 text-sm text-white/50">
                    Drop your Hidden Tunes catalog here and start building your
                    own premium streaming library.
                  </p>
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
