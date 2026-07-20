import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import { formatTvChannelTitle } from "@/utils/formatTvChannelDisplay";
import { isStationEligible, TV_VERIFIED_RELIABILITY_THRESHOLD } from "@/utils/tvPlayabilityGate";
import { isArtworkUrlFailed, isRemoteArtworkUrl, markArtworkUrlFailed } from "./artwork";

const PLACEHOLDER_URL_MARKERS = [
  "placeholder",
  "default-logo",
  "no-image",
  "1x1",
  "pixel.gif",
  "blank.png",
  "spacer.gif",
];

const MIN_ARTWORK_DIMENSION_HINT = 32;

export const TV_CARD_DECODE_WIDTH = 360;
export const TV_CARD_DECODE_HEIGHT = 203;

export const TV_PUBLIC_RELIABILITY_THRESHOLD = 60;

function cleanText(value: unknown, maxLength = 2000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function extractYouTubeVideoId(value: string) {
  const raw = cleanText(value, 500);
  if (!raw) return "";

  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const watchId = url.searchParams.get("v") || "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    const pathMatch = url.pathname.match(/\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/);
    if (pathMatch?.[1]) return pathMatch[1];
  } catch {
    const match = raw.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    return match?.[1] || "";
  }

  return "";
}

function isTinyTrackingPixel(url: string) {
  const lower = url.toLowerCase();
  if (/\b(1x1|2x2|16x16)\b/.test(lower)) return true;
  if (/(spacer|pixel|tracking|beacon|clear)\.(gif|png)/.test(lower)) return true;
  return false;
}

function isKnownPlaceholderUrl(url: string) {
  const lower = url.toLowerCase();
  return PLACEHOLDER_URL_MARKERS.some((marker) => lower.includes(marker));
}

export function isValidTvArtworkUrl(value: unknown) {
  const url = cleanText(value, 2000);
  if (!url) return false;
  if (!isRemoteArtworkUrl(url)) return false;
  if (isKnownPlaceholderUrl(url)) return false;
  if (isTinyTrackingPixel(url)) return false;
  if (isArtworkUrlFailed(url)) return false;

  const dimensionMatch = url.match(/(\d{1,4})x(\d{1,4})/i);
  if (dimensionMatch) {
    const width = Number(dimensionMatch[1]);
    const height = Number(dimensionMatch[2]);
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0 &&
      width <= MIN_ARTWORK_DIMENSION_HINT &&
      height <= MIN_ARTWORK_DIMENSION_HINT
    ) {
      return false;
    }
  }

  return true;
}

function readArtworkCandidates(raw: Record<string, unknown>) {
  return [
    raw.logo,
    raw.logo_url,
    raw.thumbnail_url,
    raw.thumbnailUrl,
    raw.artwork_url,
    raw.image_url,
    raw.icon_url,
    raw.favicon_url,
    raw.poster_url,
    raw.channel_logo,
    raw.source_logo,
  ];
}

function resolveYouTubeArtwork(sourceType: string, sourceId: string, sourceUrl: string) {
  const normalizedType = sourceType.toLowerCase();
  if (!normalizedType.includes("youtube")) return "";

  const videoId = extractYouTubeVideoId(sourceId || sourceUrl);
  if (!videoId) return "";

  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function resolveIptvOrgArtwork(sourceId: string) {
  const normalized = cleanText(sourceId, 200);
  if (!normalized.startsWith("iptv-org-")) return "";

  const channelId = normalized.slice("iptv-org-".length);
  if (!channelId) return "";

  // Lawful source-provided artwork from iptv-org channel metadata when ingested.
  // Mobile cannot reconstruct arbitrary search-engine images.
  return "";
}

export function resolveTvArtworkUrl(video: HiddenTunesTvVideo): string {
  const raw = video as HiddenTunesTvVideo & Record<string, unknown>;

  for (const candidate of readArtworkCandidates(raw)) {
    const url = cleanText(candidate, 2000);
    if (isValidTvArtworkUrl(url)) {
      return url;
    }
  }

  const sourceType = cleanText(raw.source_type, 80);
  const sourceId = cleanText(raw.source_id, 200);
  const sourceUrl = cleanText(raw.source_url, 2000);

  const youtubeArt = resolveYouTubeArtwork(sourceType, sourceId, sourceUrl);
  if (isValidTvArtworkUrl(youtubeArt)) {
    return youtubeArt;
  }

  const iptvArt = resolveIptvOrgArtwork(sourceId);
  if (isValidTvArtworkUrl(iptvArt)) {
    return iptvArt;
  }

  return "";
}

export function getTvDisplayChannelName(video: HiddenTunesTvVideo) {
  const name = cleanText(video.channel_name, 200);
  if (!name) return "";
  return formatTvChannelTitle(name) || name;
}

export function getTvDisplaySubtitle(video: HiddenTunesTvVideo) {
  const country = cleanText(video.country, 80);
  const category =
    cleanText(video.category, 80) ||
    cleanText(video.categories?.[0], 80) ||
    cleanText(video.genre, 80);

  if (country && category && country !== category) {
    return `${category} · ${country}`;
  }

  return country || category || "";
}

export function getTvChannelInitials(title: string) {
  const cleaned = cleanText(title, 120);
  if (!cleaned) return "TV";

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }

  return cleaned.slice(0, 2).toUpperCase();
}

export function shouldShowTvVerifiedBadge(video: HiddenTunesTvVideo) {
  if (!isStationEligible(video)) return false;

  const explicitVerified = video.verified;
  if (explicitVerified === false) return false;
  if (explicitVerified === true) return true;

  const score = Number(video.reliability_score ?? 0);
  return score >= TV_VERIFIED_RELIABILITY_THRESHOLD;
}

export function markTvArtworkLoadFailure(url: string) {
  markArtworkUrlFailed(url);
}
