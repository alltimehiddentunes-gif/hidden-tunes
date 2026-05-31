import type { Track } from "../types/music";
import { getEmotionalFlowSettings } from "../state/emotionalFlowSettings";
import { getWorldUiMeta } from "./worldPresentation";

export type EmotionalTransitionContext = {
  moodTags?: string[];
  world?: string;
  activeWorldId?: string | null;
  lateNightModeEnabled?: boolean;
  stayInWorldEnabled?: boolean;
};

function normalizeMoodTag(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function formatMoodLabel(tag: string) {
  return normalizeMoodTag(tag).replace(/-/g, " ");
}

function getTrackMoodTags(track: Track | null | undefined) {
  return (track?.emotionalTags ?? [])
    .map((tag) => normalizeMoodTag(String(tag)))
    .filter(Boolean);
}

function pickSharedMoodTags(
  fromTrack: Track,
  toTrack: Track,
  limit = 2
): string[] {
  const fromTags = new Set(getTrackMoodTags(fromTrack));
  return getTrackMoodTags(toTrack)
    .filter((tag) => fromTags.has(tag))
    .slice(0, limit)
    .map(formatMoodLabel);
}

function formatWorldLabel(worldId: string) {
  const meta = getWorldUiMeta(worldId);
  return meta?.title ?? worldId.replace(/_/g, " ");
}

export function buildEmotionalTransitionContext(
  overrides: Partial<EmotionalTransitionContext> = {}
): EmotionalTransitionContext {
  const settings = getEmotionalFlowSettings();

  return {
    moodTags: overrides.moodTags,
    world: overrides.world ?? settings.activeWorldId ?? undefined,
    activeWorldId: overrides.activeWorldId ?? settings.activeWorldId,
    lateNightModeEnabled:
      overrides.lateNightModeEnabled ?? settings.lateNightModeEnabled,
    stayInWorldEnabled:
      overrides.stayInWorldEnabled ?? settings.stayInWorldEnabled,
  };
}

export function explainEmotionalTransition(
  fromTrack: Track,
  toTrack: Track,
  ctx: EmotionalTransitionContext = {}
): string {
  const resolved = buildEmotionalTransitionContext(ctx);

  if (resolved.lateNightModeEnabled) {
    return "Late-Night Mode";
  }

  const worldId = resolved.world || resolved.activeWorldId;
  if (worldId && resolved.stayInWorldEnabled) {
    return `World: ${formatWorldLabel(worldId)}`;
  }

  const shared = pickSharedMoodTags(fromTrack, toTrack);
  if (shared.length) {
    return `Matched: ${shared.join(" + ")}`;
  }

  if (worldId) {
    return `World: ${formatWorldLabel(worldId)}`;
  }

  const contextTags = (resolved.moodTags ?? [])
    .map(formatMoodLabel)
    .filter(Boolean)
    .slice(0, 2);
  if (contextTags.length) {
    return `Matched: ${contextTags.join(" + ")}`;
  }

  const leadingTag = formatMoodLabel(getTrackMoodTags(toTrack)[0] ?? "");
  if (leadingTag) {
    return `Matched: ${leadingTag}`;
  }

  return "Emotional Flow";
}

export function explainNowPlayingFlowHint(
  currentTrack: Track,
  ctx: EmotionalTransitionContext = {},
  previousTrack?: Track | null
): string | null {
  const resolved = buildEmotionalTransitionContext(ctx);
  const worldId = resolved.world || resolved.activeWorldId;

  if (worldId && resolved.stayInWorldEnabled) {
    return `World: ${formatWorldLabel(worldId)}`;
  }

  if (previousTrack) {
    const shared = pickSharedMoodTags(previousTrack, currentTrack, 1);
    if (shared[0]) {
      return `Flowing from: ${shared[0]}`;
    }

    const previousTag = formatMoodLabel(getTrackMoodTags(previousTrack)[0] ?? "");
    if (previousTag) {
      return `Flowing from: ${previousTag}`;
    }
  }

  if (worldId) {
    return `World: ${formatWorldLabel(worldId)}`;
  }

  const currentTag = formatMoodLabel(getTrackMoodTags(currentTrack)[0] ?? "");
  if (currentTag) {
    return `Flowing from: ${currentTag}`;
  }

  return null;
}
