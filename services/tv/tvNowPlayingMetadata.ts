/**
 * Presentation-only mapping for TV lock-screen / remote Now Playing metadata.
 * Does not touch streams, PiP, or native player instances.
 * Keep free of react-native imports so Node contract tests can run.
 */

import type { HiddenTunesTvVideo } from "../tvCatalogApi";
import { formatTvChannelTitle } from "../../utils/formatTvChannelDisplay";

export type TvNowPlayingProgramme = {
  title?: string | null;
};

export type TvNowPlayingMetadata = {
  id: string;
  /** Content-type-safe media kind — never coerce TV to song/youtube. */
  mediaType: "tv";
  title: string;
  artist: string;
  album: string;
  artworkUri: string;
  isLive: true;
  canSeek: false;
  durationMillis: 0;
  positionMillis: 0;
};

const TRAILING_QUALITY_SUFFIX =
  /\s*[\(\[]?(?:4320|2160|1440|1080|720|576|480|360|240)p(?:\s*(?:HD|FHD|UHD|4K))?[\)\]]?\s*$/i;
const TRAILING_TECH_SUFFIX =
  /\s*[\(\[]?(?:HD|FHD|UHD|4K|HDR|HEVC|H\.?265|H\.?264|AAC|MP4|HLS|DASH)[\)\]]?\s*$/i;
const LOOKS_LIKE_URL = /^(https?:\/\/|www\.)/i;
const LOOKS_LIKE_RAW_ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z]{2,}:.+)$/i;

function cleanLabel(value: unknown, maxLength = 120): string {
  let text = String(value || "").trim();
  if (!text) return "";
  if (LOOKS_LIKE_URL.test(text) || LOOKS_LIKE_RAW_ID.test(text)) return "";

  text = formatTvChannelTitle(text);
  while (TRAILING_QUALITY_SUFFIX.test(text)) {
    text = text.replace(TRAILING_QUALITY_SUFFIX, "").trim();
  }
  while (TRAILING_TECH_SUFFIX.test(text)) {
    text = text.replace(TRAILING_TECH_SUFFIX, "").trim();
  }

  if (/^[A-Z0-9_]{8,}$/.test(text) && text.includes("_")) {
    text = text
      .split("_")
      .filter((part) => part && !/^(HD|FHD|UHD|4K)$/i.test(part))
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ");
  }

  return text.slice(0, maxLength).trim();
}

function firstUseful(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const cleaned = cleanLabel(candidate);
    if (cleaned) return cleaned;
  }
  return "";
}

function pickArtworkUri(video: HiddenTunesTvVideo): string {
  for (const candidate of [video.logo, video.thumbnail_url]) {
    const url = String(candidate || "").trim();
    if (/^https?:\/\//i.test(url)) return url;
  }
  return "";
}

/**
 * Best-effort TV Now Playing fields for lock screen / car transport.
 * Empty artworkUri means the publisher should apply Hidden Tunes TV fallback.
 */
export function buildTvNowPlayingMetadata(
  video: HiddenTunesTvVideo | null | undefined,
  programme?: TvNowPlayingProgramme | null
): TvNowPlayingMetadata | null {
  if (!video) return null;

  const channelTitle =
    firstUseful(video.title, video.channel_name) || "Live TV";
  const networkName = firstUseful(video.channel_name);
  const programmeTitle = firstUseful(programme?.title);
  const category = firstUseful(
    video.category,
    Array.isArray(video.categories) ? video.categories[0] : "",
    video.genre
  );
  const country = firstUseful(video.country);

  const title = programmeTitle || channelTitle || "Live TV";
  let artist = "";
  if (programmeTitle) {
    artist = networkName || channelTitle;
  } else if (networkName && networkName !== title) {
    artist = networkName;
  } else {
    artist = category || country || "Hidden Tunes TV";
  }

  return {
    id: String(video.id || "tv"),
    mediaType: "tv",
    title,
    artist,
    album: "Hidden Tunes TV",
    artworkUri: pickArtworkUri(video),
    isLive: true,
    canSeek: false,
    durationMillis: 0,
    positionMillis: 0,
  };
}

export function tvNowPlayingEquals(
  a: TvNowPlayingMetadata | null | undefined,
  b: TvNowPlayingMetadata | null | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.artist === b.artist &&
    a.artworkUri === b.artworkUri
  );
}
