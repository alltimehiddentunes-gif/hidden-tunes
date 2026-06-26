import { APP_BRAND_NAME } from "../../constants/testerExperience";

const URL_PATTERN = /https?:\/\//i;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const TECHNICAL_LABEL_PATTERN =
  /\b(audius|audius artist|jamendo|internet archive|archive\.org|free music archive|musopen|supabase|cloudflare|r2\.cloudflarestorage|render\.com|provider|backend|catalog api|catalog result|from catalog search|stream url|embed url|source url|diagnostic|playback engine|smart session|search session|artist-uploaded|reference stream)\b/i;

export type SearchDisplayKind =
  | "song"
  | "lyric"
  | "artist"
  | "album"
  | "playlist"
  | "genre"
  | "radio"
  | "video";

type DisplayVideoLike = {
  channel_name?: string | null;
  channelTitle?: string | null;
  category?: string | null;
  genre?: string | null;
  format?: string | null;
  mood?: string | null;
};

type DisplayRadioLike = {
  title?: string | null;
  country?: string | null;
  genre?: string | null;
  tags?: string[] | null;
  subtitle?: string | null;
};

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
  raw?: unknown;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function pickFriendlyText(...candidates: unknown[]) {
  for (const candidate of candidates) {
    const text = cleanText(candidate);
    if (text && !isTechnicalDisplayText(text)) return text;
  }
  return "";
}

function joinFriendlyParts(parts: string[], separator = " · ") {
  return parts.filter((part) => part && !isTechnicalDisplayText(part)).join(separator);
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
  const raw = item.raw as { source?: string | null; license?: string | null } | null | undefined;
  const source = cleanText(item.source || raw?.source).toLowerCase();
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

  return "";
}

export function getUserFacingSourceBadge(item: DisplaySongLike | null | undefined) {
  if (isYouTubeDisplayItem(item)) return "Hidden Tunes TV";
  return APP_BRAND_NAME;
}

export function getUserFacingMediaBadge(item: DisplaySongLike | null | undefined) {
  return getUserFacingSourceBadge(item);
}

export function getUserFacingVideoSubtitle(
  video: DisplayVideoLike | null | undefined,
  fallback?: string
) {
  const channel = pickFriendlyText(video?.channel_name, video?.channelTitle);
  const format = pickFriendlyText(video?.format, video?.category, video?.genre, video?.mood);
  const combined = joinFriendlyParts([channel, format]);
  if (combined) return combined;

  const safeFallback = pickFriendlyText(fallback);
  if (safeFallback) return safeFallback;
  return "Video";
}

export function getUserFacingRadioSubtitle(station: DisplayRadioLike | null | undefined) {
  const country = pickFriendlyText(station?.country);
  const genre = pickFriendlyText(station?.genre);
  const rawSubtitle = pickFriendlyText(station?.subtitle);

  if (rawSubtitle && !isTechnicalDisplayText(rawSubtitle)) {
    if (/live radio/i.test(rawSubtitle)) return rawSubtitle;
    if (country || genre) {
      return joinFriendlyParts(["Live Radio", country, genre]);
    }
    return rawSubtitle;
  }

  const joined = joinFriendlyParts(["Live Radio", country, genre]);
  return joined || "Live Radio";
}

export function getUserFacingSearchSubtitle(
  item: DisplaySongLike | null | undefined,
  options?: {
    kind?: SearchDisplayKind;
    fallback?: string;
    showName?: string;
  }
) {
  const kind = options?.kind || "song";
  const fallback = pickFriendlyText(options?.fallback);

  switch (kind) {
    case "video":
      return getUserFacingVideoSubtitle(item as DisplayVideoLike, fallback);
    case "radio":
      return getUserFacingRadioSubtitle(item as DisplayRadioLike);
    case "artist":
      return fallback || "Artist";
    case "album":
      return pickFriendlyText(item?.artist) || fallback || APP_BRAND_NAME;
    case "playlist":
      return fallback || "Collection";
    case "genre":
      return fallback || "Mood";
    case "lyric":
    case "song":
    default: {
      const artist = getUserFacingArtist(item);
      const meta = getUserFacingSongSubtitle(item);
      if (artist && meta) return `${artist} • ${meta}`;
      if (artist) return artist;
      if (meta) return meta;
      if (fallback) return fallback;
      return APP_BRAND_NAME;
    }
  }
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

export function getFriendlyRadioPlaybackError(error: unknown) {
  const message = cleanText((error as Error)?.message || error);
  if (!message || isTechnicalDisplayText(message)) {
    return "This station is unavailable right now.";
  }
  if (/network|fetch|timeout|offline/i.test(message)) {
    return "Try again in a moment.";
  }
  return "This station is unavailable right now.";
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
