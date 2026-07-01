import {
  PODCAST_EPISODE_PLAYBACK_STATUSES,
  PODCAST_FEED_STATUSES,
  PODCAST_SHOW_STATUSES,
  PodcastEpisodePlaybackStatus,
  PodcastFeedStatus,
  PodcastShowStatus,
  isPlayablePodcastAudioUrl,
  normalizePodcastCategories,
} from "@/lib/podcastCatalog";
import { cleanText, isAllowedValue } from "@/lib/tvCatalog";

export const PODCAST_ADMIN_SHOW_SELECT =
  "id, slug, title, description, artwork_url, host_name, primary_category, categories, language, publisher, feed_url, status, feed_status, is_verified, is_active, is_featured, is_exclusive, is_mature, episode_count, last_checked_at, created_at, updated_at";

export const PODCAST_ADMIN_EPISODE_LIST_SELECT =
  "id, show_id, title, description, artwork_url, audio_url, duration_seconds, published_at, episode_number, season_number, status, playback_status, is_verified, is_active, last_checked_at, created_at, updated_at";

export const PODCAST_MAX_INGEST_EPISODES = 200;

export type PodcastAdminShow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  host_name: string | null;
  primary_category: string | null;
  categories: string[];
  language: string | null;
  publisher: string | null;
  feed_url: string | null;
  status: PodcastShowStatus;
  feed_status: PodcastFeedStatus;
  is_verified: boolean;
  is_active: boolean;
  is_featured: boolean;
  is_exclusive: boolean;
  is_mature: boolean;
  episode_count: number;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PodcastAdminEpisode = {
  id: string;
  show_id: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  episode_number: number | null;
  season_number: number | null;
  status: PodcastShowStatus;
  playback_status: PodcastEpisodePlaybackStatus;
  is_verified: boolean;
  is_active: boolean;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export function slugifyPodcast(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "podcast-show"
  );
}

export function toPodcastAdminShow(row: Record<string, unknown>): PodcastAdminShow {
  return {
    id: String(row.id || ""),
    slug: String(row.slug || "").trim(),
    title: String(row.title || "Untitled"),
    description: cleanText(row.description, 1200),
    artwork_url: cleanText(row.artwork_url, 2000),
    host_name: cleanText(row.host_name, 120),
    primary_category: cleanText(row.primary_category, 120),
    categories: normalizePodcastCategories(row.categories),
    language: cleanText(row.language, 40),
    publisher: cleanText(row.publisher, 160),
    feed_url: cleanText(row.feed_url, 2000),
    status: isAllowedValue(row.status, PODCAST_SHOW_STATUSES)
      ? row.status
      : "pending",
    feed_status: isAllowedValue(row.feed_status, PODCAST_FEED_STATUSES)
      ? row.feed_status
      : "unchecked",
    is_verified: Boolean(row.is_verified),
    is_active: Boolean(row.is_active),
    is_featured: Boolean(row.is_featured),
    is_exclusive: Boolean(row.is_exclusive),
    is_mature: Boolean(row.is_mature),
    episode_count: Number.isFinite(Number(row.episode_count))
      ? Math.max(0, Number(row.episode_count))
      : 0,
    last_checked_at: cleanText(row.last_checked_at, 40),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

export function toPodcastAdminEpisode(
  row: Record<string, unknown>
): PodcastAdminEpisode {
  return {
    id: String(row.id || ""),
    show_id: String(row.show_id || ""),
    title: String(row.title || "Untitled"),
    description: cleanText(row.description, 1200),
    artwork_url: cleanText(row.artwork_url, 2000),
    audio_url: cleanText(row.audio_url, 2000),
    duration_seconds: Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : null,
    published_at: cleanText(row.published_at, 40),
    episode_number: Number.isFinite(Number(row.episode_number))
      ? Number(row.episode_number)
      : null,
    season_number: Number.isFinite(Number(row.season_number))
      ? Number(row.season_number)
      : null,
    status: isAllowedValue(row.status, PODCAST_SHOW_STATUSES)
      ? row.status
      : "pending",
    playback_status: isAllowedValue(
      row.playback_status,
      PODCAST_EPISODE_PLAYBACK_STATUSES
    )
      ? row.playback_status
      : "unchecked",
    is_verified: Boolean(row.is_verified),
    is_active: Boolean(row.is_active),
    last_checked_at: cleanText(row.last_checked_at, 40),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

export function isPodcastShowPubliclyVisible(show: {
  status: string;
  is_active: boolean;
  feed_status: string;
}) {
  return (
    show.status === "approved" &&
    show.is_active === true &&
    show.feed_status === "active"
  );
}

export function isPodcastEpisodePubliclyVisible(episode: {
  status: string;
  is_active: boolean;
  playback_status: string;
}) {
  return (
    episode.status === "approved" &&
    episode.is_active === true &&
    episode.playback_status === "playable"
  );
}

export function validatePodcastFeedUrl(value: unknown) {
  const raw = cleanText(value, 2000);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;

    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local")
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function normalizePodcastShowPatch(
  body: Record<string, unknown>,
  partial = true
) {
  const payload: Record<string, unknown> = {};

  if (!partial || body.title !== undefined) {
    const title = cleanText(body.title, 300);
    if (!title) throw new Error("title cannot be empty.");
    payload.title = title;
  }

  if (!partial || body.description !== undefined) {
    payload.description = cleanText(body.description, 1200);
  }

  if (!partial || body.artwork_url !== undefined) {
    payload.artwork_url = cleanText(body.artwork_url, 2000);
  }

  if (!partial || body.host_name !== undefined) {
    payload.host_name = cleanText(body.host_name, 120);
  }

  if (!partial || body.primary_category !== undefined) {
    payload.primary_category = cleanText(body.primary_category, 120);
  }

  if (!partial || body.categories !== undefined) {
    payload.categories = normalizePodcastCategories(body.categories);
  }

  if (!partial || body.language !== undefined) {
    payload.language = cleanText(body.language, 40);
  }

  if (!partial || body.publisher !== undefined) {
    payload.publisher = cleanText(body.publisher, 160);
  }

  if (!partial || body.status !== undefined) {
    const status = cleanText(body.status, 40);
    if (!status || !isAllowedValue(status, PODCAST_SHOW_STATUSES)) {
      throw new Error("Invalid status.");
    }
    payload.status = status;
  }

  if (!partial || body.feed_status !== undefined) {
    const feedStatus = cleanText(body.feed_status, 40);
    if (!feedStatus || !isAllowedValue(feedStatus, PODCAST_FEED_STATUSES)) {
      throw new Error("Invalid feed_status.");
    }
    payload.feed_status = feedStatus;
  }

  if (!partial || body.is_verified !== undefined) {
    payload.is_verified = Boolean(body.is_verified);
  }

  if (!partial || body.is_active !== undefined) {
    payload.is_active = Boolean(body.is_active);
  }

  if (!partial || body.is_featured !== undefined) {
    payload.is_featured = Boolean(body.is_featured);
  }

  if (!partial || body.is_exclusive !== undefined) {
    payload.is_exclusive = Boolean(body.is_exclusive);
  }

  if (!partial || body.is_mature !== undefined) {
    payload.is_mature = Boolean(body.is_mature);
  }

  return payload;
}

export function normalizePodcastEpisodePatch(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = cleanText(body.title, 300);
    if (!title) throw new Error("title cannot be empty.");
    payload.title = title;
  }

  if (body.description !== undefined) {
    payload.description = cleanText(body.description, 1200);
  }

  if (body.artwork_url !== undefined) {
    payload.artwork_url = cleanText(body.artwork_url, 2000);
  }

  if (body.duration_seconds !== undefined) {
    const duration = Number(body.duration_seconds);
    if (!Number.isFinite(duration) || duration < 0) {
      throw new Error("Invalid duration_seconds.");
    }
    payload.duration_seconds = Math.floor(duration);
  }

  if (body.status !== undefined) {
    const status = cleanText(body.status, 40);
    if (!status || !isAllowedValue(status, PODCAST_SHOW_STATUSES)) {
      throw new Error("Invalid status.");
    }
    payload.status = status;
  }

  if (body.playback_status !== undefined) {
    const playbackStatus = cleanText(body.playback_status, 40);
    if (
      !playbackStatus ||
      !isAllowedValue(playbackStatus, PODCAST_EPISODE_PLAYBACK_STATUSES)
    ) {
      throw new Error("Invalid playback_status.");
    }
    payload.playback_status = playbackStatus;
  }

  if (body.is_verified !== undefined) {
    payload.is_verified = Boolean(body.is_verified);
  }

  if (body.is_active !== undefined) {
    payload.is_active = Boolean(body.is_active);
  }

  return payload;
}

export function assertEpisodePlaybackGate(
  episode: { audio_url?: string | null },
  patch: Record<string, unknown>
) {
  const nextPlaybackStatus =
    typeof patch.playback_status === "string"
      ? patch.playback_status
      : undefined;
  const nextIsActive =
    typeof patch.is_active === "boolean" ? patch.is_active : undefined;
  const nextStatus =
    typeof patch.status === "string" ? patch.status : undefined;

  const wantsPublicPlayback =
    nextPlaybackStatus === "playable" ||
    nextIsActive === true ||
    nextStatus === "approved";

  if (!wantsPublicPlayback) return;

  if (!isPlayablePodcastAudioUrl(episode.audio_url)) {
    throw new Error(
      "Episode audio_url must be a valid HTTPS URL before approval or playable status."
    );
  }
}
