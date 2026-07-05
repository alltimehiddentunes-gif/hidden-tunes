import { isPlayableAudiobookAudioUrl } from "@/lib/audiobookCatalog";
import { cleanText } from "@/lib/tvCatalog";

const SUSPICIOUS_TITLE_PATTERN =
  /^(untitled|test audiobook|sample audiobook|placeholder|fake audiobook|lorem ipsum)/i;

export type AudiobookAutoApprovalEvaluation = {
  status: "approved" | "pending";
  playback_status: "playable" | "failed" | "unchecked";
  is_active: boolean;
  is_verified: boolean;
  reasons: string[];
};

export function evaluateLibriVoxAudiobook(options: {
  title: string;
  description?: string | null;
  playableSectionCount: number;
  primaryAudioUrl?: string | null;
}): AudiobookAutoApprovalEvaluation {
  const reasons: string[] = [];
  const title = cleanText(options.title, 300);

  if (!title || title.length < 3 || SUSPICIOUS_TITLE_PATTERN.test(title)) {
    reasons.push("suspicious_title");
  }

  if (options.playableSectionCount < 1) {
    reasons.push("no_playable_sections");
  }

  const audioUrl = isPlayableAudiobookAudioUrl(options.primaryAudioUrl);
  if (!audioUrl) {
    reasons.push("missing_https_audio");
  }

  const eligible = reasons.length === 0;

  return {
    status: eligible ? "approved" : "pending",
    playback_status: eligible ? "playable" : "failed",
    is_active: eligible,
    is_verified: false,
    reasons,
  };
}

export function evaluateLibriVoxChapterAudio(audioUrl: unknown) {
  const playable = isPlayableAudiobookAudioUrl(audioUrl);
  return {
    playback_status: playable ? ("playable" as const) : ("failed" as const),
    is_active: Boolean(playable),
  };
}
