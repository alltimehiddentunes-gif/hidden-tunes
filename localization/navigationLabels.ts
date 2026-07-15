import type { TranslationKey } from "./types";

const NAVIGATION_LABEL_KEYS: Record<string, TranslationKey> = {
  home: "navigation.home",
  search: "navigation.search",
  explore: "navigation.explore",
  player: "navigation.player",
  library: "navigation.library",
  tv: "navigation.tv",
  profile: "navigation.profile",
  queue: "navigation.queue",
  lyrics: "navigation.lyrics",
  radio: "navigation.radio",
  playlists: "navigation.playlists",
  downloads: "navigation.downloads",
  "recently-played": "navigation.recentlyPlayed",
  "cloud-playlists": "navigation.cloudPlaylists",
};

export function getNavigationLabelKey(itemId: string): TranslationKey {
  return NAVIGATION_LABEL_KEYS[itemId] ?? "navigation.home";
}
