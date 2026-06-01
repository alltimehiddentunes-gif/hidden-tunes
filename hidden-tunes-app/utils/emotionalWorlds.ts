import type { QueryContext } from "../types/music";

export type WorldPreset = {
  moodTags: string[];
  world: string;
};

export const WORLD_PRESETS: Record<string, WorldPreset> = {
  rain_world: {
    world: "rain_world",
    moodTags: ["rainy", "melancholy", "reflective", "calm", "intimate", "soft"],
  },
  future_nostalgia: {
    world: "future_nostalgia",
    moodTags: [
      "nostalgia",
      "electronic",
      "ethereal",
      "cinematic",
      "dreamy",
      "urban",
    ],
  },
  human_fragility: {
    world: "human_fragility",
    moodTags: [
      "fragile",
      "vulnerability",
      "intimate",
      "soft",
      "breathy",
      "emotional",
    ],
  },
  rooftop_night: {
    world: "rooftop_night",
    moodTags: [
      "late-night",
      "urban",
      "intimate",
      "reflective",
      "night-drive",
      "calm",
    ],
  },
  digital_loneliness: {
    world: "digital_loneliness",
    moodTags: [
      "loneliness",
      "dark",
      "electronic",
      "ambient",
      "distant",
      "melancholy",
    ],
  },
};

export const WORLD_PRESET_IDS = Object.keys(WORLD_PRESETS);

export function isWorldPresetId(worldId: string | undefined | null): boolean {
  const normalized = String(worldId ?? "").trim();
  return Boolean(normalized && WORLD_PRESETS[normalized]);
}

export function getWorldPreset(
  worldId: string | undefined | null
): WorldPreset | null {
  const normalized = String(worldId ?? "").trim();
  if (!normalized) return null;
  return WORLD_PRESETS[normalized] ?? null;
}

export type WorldPresetQueryContext = Pick<QueryContext, "moodTags" | "world">;

export function toWorldPresetContext(
  worldId: string
): WorldPresetQueryContext | null {
  const preset = getWorldPreset(worldId);
  if (!preset) return null;

  return {
    world: preset.world,
    moodTags: [...preset.moodTags],
  };
}
