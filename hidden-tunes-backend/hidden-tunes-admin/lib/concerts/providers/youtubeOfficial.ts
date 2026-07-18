/**
 * YouTube official-channel helpers for Concerts.
 * Official embed/player URLs only — never extract progressive media URLs.
 */

const YOUTUBE_CHANNEL_ID_RE = /^UC[\w-]{22}$/;

export function isValidYouTubeChannelId(value: string | null | undefined): boolean {
  const cleaned = String(value || "").trim();
  return YOUTUBE_CHANNEL_ID_RE.test(cleaned);
}

export function normalizeYouTubeChannelUrl(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtu.be") {
      return null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "channel" && parts[1] && isValidYouTubeChannelId(parts[1])) {
      return `https://www.youtube.com/channel/${parts[1]}`;
    }
    if (parts[0]?.startsWith("@") && parts[0].length > 1) {
      return `https://www.youtube.com/${parts[0]}`;
    }
    if (parts[0] === "c" && parts[1]) {
      return `https://www.youtube.com/c/${parts[1]}`;
    }
    if (parts[0] === "user" && parts[1]) {
      return `https://www.youtube.com/user/${parts[1]}`;
    }
    return `https://www.youtube.com${url.pathname}`;
  } catch {
    return null;
  }
}

export function buildYouTubeOfficialEmbedUrl(videoId: string): string | null {
  const id = String(videoId || "").trim();
  if (!/^[\w-]{11}$/.test(id)) return null;
  return `https://www.youtube.com/embed/${id}`;
}

export function buildYouTubeOfficialWatchUrl(videoId: string): string | null {
  const id = String(videoId || "").trim();
  if (!/^[\w-]{11}$/.test(id)) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

export function rejectExtractedYouTubeMediaUrl(url: string | null | undefined): boolean {
  const value = String(url || "").toLowerCase();
  if (!value) return false;
  return (
    value.includes("googlevideo.com") ||
    value.includes("/videoplayback") ||
    value.includes("mime=video")
  );
}

export function youtubeChannelIdentityNote(): string {
  return "Channel identity and per-item embed/playback permission are separate checks. Not every video on an official channel is a concert, free, public, or embeddable.";
}
