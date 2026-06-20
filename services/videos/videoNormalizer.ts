import type { HiddenTunesTvVideo } from "../tvCatalogApi";
import { FALLBACK_ARTWORK } from "../../utils/artwork";

export type VideoSource =
  | "youtube"
  | "archive"
  | "vimeo"
  | "dailymotion"
  | "twitch"
  | "direct"
  | "backend";

export type VideoItem = {
  id: string;
  title: string;
  description?: string;
  creatorName?: string;
  channelTitle?: string;
  videoSource: VideoSource;
  externalVideoId?: string;
  playbackUrl?: string;
  embedUrl?: string;
  thumbnailUrl?: string;
  duration?: string | number;
  publishedAt?: string;
  category?: string;
  genre?: string;
  mood?: string;
  format?: string;
  tags?: string[];
  sourceMetadata?: Record<string, unknown>;
};

function cleanText(value: unknown, maxLength = 2000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function optionalText(value: unknown, maxLength = 2000) {
  const text = cleanText(value, maxLength);
  return text || undefined;
}

function normalizeVideoSource(value: unknown): VideoSource {
  const source = cleanText(value, 80).toLowerCase().replace(/[\s-]+/g, "_");

  if (source.includes("youtube") || source === "yt") return "youtube";
  if (source.includes("archive")) return "archive";
  if (source.includes("vimeo")) return "vimeo";
  if (source.includes("dailymotion")) return "dailymotion";
  if (source.includes("twitch")) return "twitch";
  if (source.includes("direct") || source.includes("hosted") || source.includes("file")) {
    return "direct";
  }

  return "backend";
}

function extractYouTubeId(value: unknown) {
  const raw = cleanText(value, 2000).replace("youtube-", "");

  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const watchId = url.searchParams.get("v") || "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;

    const pathMatch = url.pathname.match(/\/(?:shorts|embed)\/([a-zA-Z0-9_-]{11})/);
    if (pathMatch?.[1]) return pathMatch[1];

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {}

  const match = raw.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanText(entry, 80)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 24);
  }

  return [];
}

function resolveThumbnailUrl(videoSource: VideoSource, thumbnailUrl: string, externalVideoId: string) {
  if (thumbnailUrl) return thumbnailUrl;
  if (videoSource === "youtube" && externalVideoId) {
    return `https://img.youtube.com/vi/${externalVideoId}/hqdefault.jpg`;
  }
  return FALLBACK_ARTWORK;
}

export function normalizeVideoItem(video: HiddenTunesTvVideo): VideoItem {
  const raw = video as HiddenTunesTvVideo & Record<string, unknown>;
  const videoSource = normalizeVideoSource(raw.source_type);
  const sourceId = cleanText(raw.source_id, 500);
  const externalVideoId =
    videoSource === "youtube" ? extractYouTubeId(sourceId || raw.source_url || raw.embed_url) : sourceId;
  const creatorName =
    optionalText(raw.channel_name, 200) ||
    optionalText(raw.creator_name, 200) ||
    optionalText(raw.creatorName, 200);
  const thumbnailUrl = resolveThumbnailUrl(
    videoSource,
    cleanText(raw.thumbnail_url, 2000),
    externalVideoId
  );

  return {
    id: cleanText(raw.id, 500) || externalVideoId || sourceId,
    title: cleanText(raw.title, 500) || "Hidden Tunes TV",
    description: optionalText(raw.description, 2000),
    creatorName,
    channelTitle: creatorName,
    videoSource,
    externalVideoId: externalVideoId || undefined,
    playbackUrl: optionalText(raw.source_url, 2000),
    embedUrl: optionalText(raw.embed_url, 2000),
    thumbnailUrl,
    duration:
      typeof raw.duration === "number" || typeof raw.duration === "string"
        ? raw.duration
        : undefined,
    publishedAt: optionalText(raw.published_at || raw.publishedAt, 120),
    category: optionalText(raw.category, 120),
    genre: optionalText(raw.genre, 120),
    mood: optionalText(raw.mood, 120),
    format: optionalText(raw.format, 120),
    tags: normalizeTags(raw.tags),
    sourceMetadata: {
      sourceType: raw.source_type,
      hasSourceUrl: Boolean(cleanText(raw.source_url, 2000)),
      hasEmbedUrl: Boolean(cleanText(raw.embed_url, 2000)),
    },
  };
}

export function getVideoDisplayCreator(video: VideoItem) {
  return video.creatorName || video.channelTitle || "Hidden Tunes TV";
}

export function getVideoDisplayCategory(video: VideoItem) {
  return video.category || video.format || video.genre || "";
}

export function isVideoItemPlayableInCurrentRoute(video: VideoItem) {
  return video.videoSource === "youtube" && Boolean(video.externalVideoId);
}
