import { APP_BRAND_NAME } from "../../constants/testerExperience";

const URL_PATTERN = /https?:\/\//i;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const TECHNICAL_LABEL_PATTERN =
  /\b(audius|jamendo|internet archive|archive\.org|free music archive|musopen|supabase|cloudflare|r2\.cloudflarestorage|render\.com|provider|backend|catalog api|stream url|diagnostic|playback engine|smart session|search session|artist-uploaded|reference stream)\b/i;

type DisplaySongLike = {
  id?: string | number | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  genre?: string | null;
  mood?: string | null;
  duration?: number | string | null;
  source?: string | null;
  sourceName?: string | null;
  type?: string | null;
  videoId?: string | null;
  license?: string | null;
  streamUrl?: string | null;
  url?: string | null;
  user?: { name?: string | null } | null;
  raw?: { source?: string | null; license?: string | null } | null;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

export function isDiagnosticsUiEnabled() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export function isTechnicalDisplayText(value: unknown) {
  const text = cleanText(value);
  if (!text) return false;
  if (URL_PATTERN.test(text)) return true;
  if (UUID_PATTERN.test(text)) return true;
  if (text.length > 72) return true;
  if (TECHNICAL_LABEL_PATTERN.test(text)) return true;
  if (/\b(source|provider|catalog|backend|api|r2|supabase|diagnostic)\b/i.test(text)) {
    return true;
  }
  return false;
}

export function isYouTubeDisplayItem(item: DisplaySongLike | null | undefined) {
  if (!item) return false;
  return (
    item.type === "youtube_video" ||
    item.source === "youtube" ||
    item.sourceName === "YouTube" ||
    Boolean(item.videoId)
  );
}

export function isExternalFallbackSong(item: DisplaySongLike | null | undefined) {
  if (!item) return false;
  const source = cleanText(item.source || item.raw?.source).toLowerCase();
  return (
    source === "audius" ||
    source === "archive" ||
    source === "jamendo" ||
    source === "fma" ||
    source === "musopen" ||
    source === "youtube_reference"
  );
}

export function getUserFacingArtist(item: DisplaySongLike | null | undefined) {
  const artist = cleanText(item?.artist || item?.user?.name);
  if (artist && !isTechnicalDisplayText(artist)) return artist;
  if (isExternalFallbackSong(item)) return "Independent Artist";
  return APP_BRAND_NAME;
}

export function formatDurationLabel(durationSeconds: unknown) {
  const seconds = Number(durationSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder < 10 ? "0" : ""}${remainder}`;
}

export function getUserFacingSongSubtitle(item: DisplaySongLike | null | undefined) {
  if (!item) return "";

  const candidates = [
    cleanText(item.album),
    cleanText(item.genre),
    cleanText(item.mood),
    formatDurationLabel(item.duration),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!isTechnicalDisplayText(candidate)) return candidate;
  }

  if (isExternalFallbackSong(item)) return "Free & legal source";
  return "";
}

export function getUserFacingSourceBadge(item: DisplaySongLike | null | undefined) {
  if (isYouTubeDisplayItem(item)) return "Hidden Tunes TV";
  return APP_BRAND_NAME;
}

export function getUserFacingTrackRowSubtitle(item: DisplaySongLike | null | undefined) {
  const subtitle = getUserFacingSongSubtitle(item);
  if (subtitle) return subtitle;
  return APP_BRAND_NAME;
}

export function getUserFacingQueueSessionEyebrow(source: unknown) {
  switch (cleanText(source).toLowerCase()) {
    case "album":
      return "ALBUM";
    case "radio":
      return "RADIO";
    case "genre":
      return "GENRE";
    case "mood":
      return "MOOD";
    case "search":
      return "SEARCH";
    case "playlist":
      return "PLAYLIST";
    case "smart_queue":
      return "SMART MIX";
    default:
      return "QUEUE";
  }
}

export function getUserFacingQueueModeLabel(input: {
  activeQueueMode?: string | null;
  radioMode?: boolean;
  youtubeQueueLength?: number;
  activeQueueLength?: number;
}) {
  if (input.activeQueueMode === "smart") return "Smart mix";
  if (input.radioMode) return "Radio";
  if ((input.youtubeQueueLength || 0) > 0) return `${input.youtubeQueueLength} in queue`;
  if ((input.activeQueueLength || 0) > 0) return `${input.activeQueueLength} in queue`;
  return "Now playing";
}

export function getUserFacingMatchReason(_reason: unknown) {
  return isDiagnosticsUiEnabled() ? cleanText(_reason) : "";
}

export function getFriendlyPlaybackError(error: unknown) {
  const message = cleanText((error as Error)?.message || error);
  if (!message || isTechnicalDisplayText(message)) {
    return "This song is unavailable right now.";
  }
  if (/network|fetch|timeout|offline/i.test(message)) {
    return "Try again in a moment.";
  }
  return "This song is unavailable right now.";
}

export function getFriendlySectionError() {
  return "We couldn\u2019t load this section.";
}

export function getFriendlyEmptyTitle(kind: "library" | "search" | "section" = "section") {
  if (kind === "search") return "Nothing here yet.";
  if (kind === "library") return "Nothing here yet.";
  return "Nothing here yet.";
}

export function getFriendlyEmptyHint(kind: "search" | "section" = "section") {
  if (kind === "search") return "Try another search.";
  return "More music is coming soon.";
}
