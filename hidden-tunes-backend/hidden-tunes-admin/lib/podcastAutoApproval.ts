import type {
  ParsedPodcastEpisode,
  ParsedPodcastFeed,
} from "@/lib/podcastIngestTypes";
import { isPlayablePodcastAudioUrl } from "@/lib/podcastCatalog";
import { cleanText } from "@/lib/tvCatalog";

const SUSPICIOUS_TITLE_PATTERN =
  /^(untitled|test podcast|sample podcast|placeholder|fake podcast|lorem ipsum)/i;

export type PodcastEpisodeAutoApprovalEvaluation = {
  eligible: boolean;
  suspicious: boolean;
  playback_status: "playable" | "failed" | "unchecked";
  status: "approved" | "pending";
  is_active: boolean;
  reasons: string[];
};

export type PodcastShowAutoApprovalEvaluation = {
  eligible: boolean;
  suspicious: boolean;
  reasons: string[];
  https_episode_count: number;
};

export type PodcastFeedAutoApprovalEvaluation = {
  show: PodcastShowAutoApprovalEvaluation;
  episodes: Map<string, PodcastEpisodeAutoApprovalEvaluation>;
};

function isIpHostname(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

function isSuspiciousTitle(value: string | null | undefined) {
  const title = cleanText(value, 300);
  if (!title || title.length < 3) return true;
  return SUSPICIOUS_TITLE_PATTERN.test(title);
}

export function hasUsablePodcastShowMetadata(parsed: ParsedPodcastFeed) {
  if (cleanText(parsed.description, 1200) && parsed.description!.length >= 12) {
    return true;
  }
  if (cleanText(parsed.host_name, 120)) return true;
  if (cleanText(parsed.publisher, 160)) return true;
  if (cleanText(parsed.artwork_url, 2000)) return true;
  if (cleanText(parsed.language, 40)) return true;
  if (cleanText(parsed.primary_category, 120)) return true;
  if (parsed.categories.length > 0) return true;
  return false;
}

export function isSuspiciousPodcastEpisode(
  episode: ParsedPodcastEpisode,
  parsed: ParsedPodcastFeed
) {
  if (isSuspiciousTitle(episode.title)) return true;

  const audioUrl = cleanText(episode.audio_url, 2000);
  if (!audioUrl) return true;

  try {
    const url = new URL(audioUrl);
    if (isIpHostname(url.hostname)) return true;
    if (url.protocol !== "https:") return true;
    if (url.username || url.password) return true;
  } catch {
    return true;
  }

  const duplicateTitleCount = parsed.episodes.filter(
    (candidate) =>
      cleanText(candidate.title, 300)?.toLowerCase() ===
      cleanText(episode.title, 300)?.toLowerCase()
  ).length;

  if (duplicateTitleCount > 3) return true;

  return false;
}

export function isSuspiciousPodcastFeed(
  parsed: ParsedPodcastFeed,
  feedUrl: string
) {
  if (isSuspiciousTitle(parsed.title)) return true;

  try {
    const url = new URL(feedUrl);
    if (isIpHostname(url.hostname)) return true;
  } catch {
    return true;
  }

  const httpsEpisodes = parsed.episodes.filter((episode) =>
    Boolean(isPlayablePodcastAudioUrl(episode.audio_url))
  );

  if (httpsEpisodes.length === 0) return true;

  const uniqueAudioUrls = new Set(
    parsed.episodes.map((episode) => cleanText(episode.audio_url, 2000))
  );
  if (parsed.episodes.length > 1 && uniqueAudioUrls.size === 1) return true;

  const uniqueTitles = new Set(
    parsed.episodes.map((episode) =>
      cleanText(episode.title, 300)?.toLowerCase() || ""
    )
  );
  if (parsed.episodes.length > 3 && uniqueTitles.size <= 1) return true;

  if (!hasUsablePodcastShowMetadata(parsed)) return true;

  return false;
}

export function evaluatePodcastEpisodeAutoApproval(
  episode: ParsedPodcastEpisode,
  parsed: ParsedPodcastFeed,
  showApproved: boolean
): PodcastEpisodeAutoApprovalEvaluation {
  const reasons: string[] = [];
  const suspicious = isSuspiciousPodcastEpisode(episode, parsed);
  const hasHttpsAudio = Boolean(isPlayablePodcastAudioUrl(episode.audio_url));
  const hasTitle = Boolean(cleanText(episode.title, 300));

  if (!hasTitle) reasons.push("missing_title");
  if (!hasHttpsAudio) reasons.push("audio_url_not_https");
  if (suspicious) reasons.push("suspicious_episode");
  if (!showApproved) reasons.push("show_not_approved");

  const eligible =
    showApproved && hasTitle && hasHttpsAudio && !suspicious;

  if (eligible) {
    return {
      eligible: true,
      suspicious: false,
      playback_status: "playable",
      status: "approved",
      is_active: true,
      reasons: [],
    };
  }

  if (!hasHttpsAudio || suspicious) {
    return {
      eligible: false,
      suspicious,
      playback_status: "failed",
      status: "pending",
      is_active: false,
      reasons,
    };
  }

  return {
    eligible: false,
    suspicious,
    playback_status: "unchecked",
    status: "pending",
    is_active: false,
    reasons,
  };
}

export function evaluatePodcastShowAutoApproval(
  parsed: ParsedPodcastFeed,
  feedUrl: string
): PodcastShowAutoApprovalEvaluation {
  const reasons: string[] = [];
  const suspicious = isSuspiciousPodcastFeed(parsed, feedUrl);
  const hasTitle = Boolean(cleanText(parsed.title, 300));
  const httpsEpisodeCount = parsed.episodes.filter((episode) =>
    Boolean(isPlayablePodcastAudioUrl(episode.audio_url))
  ).length;

  if (!hasTitle) reasons.push("missing_title");
  if (!feedUrl) reasons.push("missing_feed_url");
  if (httpsEpisodeCount < 1) reasons.push("missing_https_episode");
  if (!hasUsablePodcastShowMetadata(parsed)) {
    reasons.push("missing_usable_metadata");
  }
  if (suspicious) reasons.push("suspicious_feed");

  const eligible =
    hasTitle &&
    Boolean(feedUrl) &&
    httpsEpisodeCount >= 1 &&
    hasUsablePodcastShowMetadata(parsed) &&
    !suspicious;

  return {
    eligible,
    suspicious,
    reasons,
    https_episode_count: httpsEpisodeCount,
  };
}

export function evaluatePodcastFeedAutoApproval(
  parsed: ParsedPodcastFeed,
  feedUrl: string
): PodcastFeedAutoApprovalEvaluation {
  const show = evaluatePodcastShowAutoApproval(parsed, feedUrl);
  const episodes = new Map<string, PodcastEpisodeAutoApprovalEvaluation>();

  for (const episode of parsed.episodes) {
    episodes.set(
      episode.audio_url,
      evaluatePodcastEpisodeAutoApproval(episode, parsed, show.eligible)
    );
  }

  return { show, episodes };
}

export function resolveEpisodeLifecycleFields(
  evaluation: PodcastEpisodeAutoApprovalEvaluation,
  autoApprove: boolean,
  preserveExistingModeration: boolean,
  existing?: {
    status?: string | null;
    playback_status?: string | null;
    is_active?: boolean | null;
  }
) {
  if (preserveExistingModeration && existing) {
    return {
      status: existing.status || "pending",
      playback_status: existing.playback_status || "unchecked",
      is_active: Boolean(existing.is_active),
    };
  }

  if (!autoApprove) {
    const hasHttpsAudio = evaluation.playback_status !== "failed";
    return {
      status: "pending" as const,
      playback_status: hasHttpsAudio ? ("unchecked" as const) : ("failed" as const),
      is_active: false,
    };
  }

  return {
    status: evaluation.status,
    playback_status: evaluation.playback_status,
    is_active: evaluation.is_active,
  };
}

export function resolveShowLifecycleFields(
  showEvaluation: PodcastShowAutoApprovalEvaluation,
  autoApprove: boolean,
  preserveExistingModeration: boolean,
  existing?: {
    status?: string | null;
    feed_status?: string | null;
    is_active?: boolean | null;
  }
) {
  if (preserveExistingModeration && existing) {
    return {
      status: existing.status || "pending",
      feed_status: existing.feed_status || "unchecked",
      is_active: Boolean(existing.is_active),
    };
  }

  if (!autoApprove) {
    return {
      status: "pending" as const,
      feed_status: "unchecked" as const,
      is_active: false,
    };
  }

  if (showEvaluation.eligible) {
    return {
      status: "approved" as const,
      feed_status: "active" as const,
      is_active: true,
    };
  }

  return {
    status: "pending" as const,
    feed_status: "unchecked" as const,
    is_active: false,
  };
}
