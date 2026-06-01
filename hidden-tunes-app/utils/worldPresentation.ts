import {
  getWorldPreset,
  WORLD_PRESET_IDS,
  type WorldPreset,
} from "./emotionalWorlds";

export type WorldUiMeta = {
  id: string;
  title: string;
  tagline: string;
  gradient: readonly [string, string, string];
  accent: string;
  /** Query string passed to searchTracks (world display name). */
  searchQuery: string;
};

export const WORLD_UI_META: Record<string, WorldUiMeta> = {
  rain_world: {
    id: "rain_world",
    title: "Rain World",
    tagline: "Soft rain, reflective calm, intimate melancholy",
    gradient: ["#0B1B2A", "#14263A", "#050810"],
    accent: "#5EEAD4",
    searchQuery: "rain world",
  },
  future_nostalgia: {
    id: "future_nostalgia",
    title: "Future Nostalgia",
    tagline: "Neon memory, dreamy electronics, cinematic distance",
    gradient: ["#1A0B33", "#31145A", "#090212"],
    accent: "#C084FC",
    searchQuery: "future nostalgia",
  },
  human_fragility: {
    id: "human_fragility",
    title: "Human Fragility",
    tagline: "Breathy vulnerability, emotional softness, raw intimacy",
    gradient: ["#2A1420", "#3A1A28", "#12080C"],
    accent: "#F9A8D4",
    searchQuery: "human fragility",
  },
  rooftop_night: {
    id: "rooftop_night",
    title: "Rooftop Night",
    tagline: "Late-night city air, urban glow, quiet reflection",
    gradient: ["#101828", "#1E293B", "#020617"],
    accent: "#93C5FD",
    searchQuery: "rooftop night",
  },
  digital_loneliness: {
    id: "digital_loneliness",
    title: "Digital Loneliness",
    tagline: "Ambient isolation, distant electronics, dark calm",
    gradient: ["#111827", "#1F2937", "#030712"],
    accent: "#A78BFA",
    searchQuery: "digital loneliness",
  },
};

export type WorldGalleryItem = WorldUiMeta & {
  preset: WorldPreset;
  moodTags: string[];
};

export function getWorldGalleryItems(): WorldGalleryItem[] {
  return WORLD_PRESET_IDS.map((worldId) => {
    const meta = WORLD_UI_META[worldId];
    const preset = getWorldPreset(worldId);

    return {
      ...(meta ?? {
        id: worldId,
        title: worldId.replace(/_/g, " "),
        tagline: "Emotional world",
        gradient: ["#12071F", "#04010A", "#000000"] as const,
        accent: "#A855F7",
        searchQuery: worldId.replace(/_/g, " "),
      }),
      preset: preset ?? { world: worldId, moodTags: [] },
      moodTags: preset?.moodTags ?? [],
    };
  });
}

export function getWorldUiMeta(worldId: string | undefined | null) {
  const normalized = String(worldId ?? "").trim();
  if (!normalized) return null;

  const meta = WORLD_UI_META[normalized];
  const preset = getWorldPreset(normalized);

  if (!meta && !preset) return null;

  return {
    ...(meta ?? {
      id: normalized,
      title: normalized.replace(/_/g, " "),
      tagline: "Emotional world",
      gradient: ["#12071F", "#04010A", "#000000"] as const,
      accent: "#A855F7",
      searchQuery: normalized.replace(/_/g, " "),
    }),
    preset: preset ?? { world: normalized, moodTags: [] },
    moodTags: preset?.moodTags ?? [],
  };
}
