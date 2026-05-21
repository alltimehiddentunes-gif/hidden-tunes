import {
  TV_PLAYBACK_STATUSES,
  TV_VIDEO_SOURCE_TYPE,
  TvPlaybackStatus,
  buildYouTubeEmbedUrl,
  buildYouTubeWatchUrl,
  cleanText,
} from "@/lib/tvCatalog";

export type TvVideoVerificationInput = {
  source_type: string;
  source_id?: string | null;
  title?: string | null;
  thumbnail_url?: string | null;
  source_url?: string | null;
  embed_url?: string | null;
  oEmbedSucceeded?: boolean;
};

export type TvPlaybackVerification = {
  passes: boolean;
  playback_status: TvPlaybackStatus;
  reason: string;
};

export type TvImportModeration = {
  playback_status: TvPlaybackStatus;
  status: "approved" | "pending" | "blocked";
  is_active: boolean;
  reason: string;
};

function isYouTubeSourceType(sourceType: string) {
  return (
    sourceType === TV_VIDEO_SOURCE_TYPE ||
    sourceType === "youtube" ||
    sourceType.startsWith("youtube_")
  );
}

export function verifyTvVideoRecord(
  video: TvVideoVerificationInput
): TvPlaybackVerification {
  const sourceType = String(video.source_type || "").trim();

  if (!sourceType) {
    return {
      passes: false,
      playback_status: "failed",
      reason: "Missing source_type.",
    };
  }

  if (isYouTubeSourceType(sourceType)) {
    const sourceId = cleanText(video.source_id, 80);
    const title = cleanText(video.title, 300);
    const thumbnailUrl = cleanText(video.thumbnail_url, 2000);
    const sourceUrl = cleanText(video.source_url, 2000);
    const embedUrl = cleanText(video.embed_url, 2000);
    const hasPlaybackUrl = Boolean(sourceUrl || embedUrl);

    if (!sourceId) {
      return {
        passes: false,
        playback_status: "failed",
        reason: "YouTube record is missing source_id.",
      };
    }

    if (!title) {
      return {
        passes: false,
        playback_status: "failed",
        reason: "YouTube record is missing title.",
      };
    }

    if (!thumbnailUrl) {
      return {
        passes: false,
        playback_status: "failed",
        reason: "YouTube record is missing thumbnail_url.",
      };
    }

    if (!hasPlaybackUrl) {
      return {
        passes: false,
        playback_status: "failed",
        reason: "YouTube record is missing source_url and embed_url.",
      };
    }

    if (video.oEmbedSucceeded) {
      return {
        passes: true,
        playback_status: "playable",
        reason: "oEmbed metadata verified for official YouTube embed playback.",
      };
    }

    if (sourceId && title && thumbnailUrl && hasPlaybackUrl) {
      return {
        passes: true,
        playback_status: "unchecked",
        reason:
          "Required YouTube fields are present, but oEmbed was not confirmed during import.",
      };
    }

    return {
      passes: false,
      playback_status: "failed",
      reason: "YouTube record failed required metadata checks.",
    };
  }

  const title = cleanText(video.title, 300);
  const hasPlaybackUrl = Boolean(
    cleanText(video.source_url, 2000) || cleanText(video.embed_url, 2000)
  );

  if (!title || !hasPlaybackUrl) {
    return {
      passes: false,
      playback_status: "failed",
      reason: "Non-YouTube record is missing title or playback URL.",
    };
  }

  return {
    passes: true,
    playback_status: "unchecked",
    reason: "Non-YouTube record has baseline metadata only.",
  };
}

export function resolveTvImportModeration(
  verification: TvPlaybackVerification,
  autoApprove: boolean
): TvImportModeration {
  if (!verification.passes || verification.playback_status === "failed") {
    return {
      playback_status: "failed",
      status: "blocked",
      is_active: false,
      reason: verification.reason,
    };
  }

  if (verification.playback_status !== "playable") {
    return {
      playback_status: verification.playback_status,
      status: "pending",
      is_active: false,
      reason: verification.reason,
    };
  }

  if (autoApprove) {
    return {
      playback_status: "playable",
      status: "approved",
      is_active: true,
      reason: "Auto-approved after playability verification.",
    };
  }

  return {
    playback_status: "playable",
    status: "pending",
    is_active: false,
    reason: "Verified playable; awaiting manual approval.",
  };
}

export function buildVerifiedYouTubeUrls(videoId: string, sourceUrl?: string | null) {
  const watchUrl = cleanText(sourceUrl, 2000) || buildYouTubeWatchUrl(videoId);
  const embedUrl = buildYouTubeEmbedUrl(videoId);

  return { source_url: watchUrl, embed_url: embedUrl };
}

export function isTvPlaybackStatus(value: string): value is TvPlaybackStatus {
  return (TV_PLAYBACK_STATUSES as readonly string[]).includes(value);
}
