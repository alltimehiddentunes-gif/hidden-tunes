import type { Track } from "../types/music";
import { getWorldPreset } from "./emotionalWorlds";

const LATE_NIGHT_MOOD_TAGS = ["late-night", "calm", "intimate"] as const;

function normalizeMoodTag(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function getTrackMoodTags(track: Track) {
  return (track.emotionalTags ?? [])
    .map((tag) => normalizeMoodTag(String(tag)))
    .filter(Boolean);
}

export function trackMatchesAnyMoodTags(track: Track, moodTags: string[]) {
  if (!moodTags.length) {
    return true;
  }

  const trackTags = new Set(getTrackMoodTags(track));
  return moodTags.some((tag) => trackTags.has(normalizeMoodTag(tag)));
}

export function mergeLateNightMoodTags(moodTags: string[]) {
  const merged = new Set<string>();

  moodTags.forEach((tag) => merged.add(normalizeMoodTag(tag)));
  LATE_NIGHT_MOOD_TAGS.forEach((tag) => merged.add(tag));

  return Array.from(merged);
}

export function filterTracksForEmotionalFlow(
  pool: Track[],
  startTrack: Track,
  options: {
    lateNightModeEnabled: boolean;
    stayInWorldEnabled: boolean;
    activeWorldId: string | null;
  }
): Track[] {
  let requiredTags: string[] = [];

  if (options.lateNightModeEnabled) {
    requiredTags = mergeLateNightMoodTags(requiredTags);
  }

  if (options.stayInWorldEnabled && options.activeWorldId) {
    const preset = getWorldPreset(options.activeWorldId);
    if (preset?.moodTags.length) {
      requiredTags = Array.from(
        new Set([
          ...requiredTags,
          ...preset.moodTags.map((tag) => normalizeMoodTag(tag)),
        ])
      );
    }
  }

  if (!requiredTags.length) {
    return pool.length ? pool : [startTrack];
  }

  const filtered = pool.filter((track) =>
    trackMatchesAnyMoodTags(track, requiredTags)
  );

  const startId = String(startTrack.id);
  const includesStart = filtered.some(
    (track) => String(track.id) === startId
  );

  if (includesStart) {
    return filtered.length ? filtered : [startTrack];
  }

  return [startTrack, ...filtered];
}

export { LATE_NIGHT_MOOD_TAGS };
