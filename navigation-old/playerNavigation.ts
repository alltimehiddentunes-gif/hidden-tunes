import { router } from "expo-router";

export const PLAYER_SCREEN_HREF = "/(tabs)/player" as const;

let pendingPlayerNavigation = false;

/** Open the player tab without remounting when it is already active. */
export function navigateToPlayerWithMerge() {
  if (pendingPlayerNavigation) return;

  pendingPlayerNavigation = true;

  requestAnimationFrame(() => {
    pendingPlayerNavigation = false;
    router.navigate(PLAYER_SCREEN_HREF);
  });
}

export function navigateToTabsWithMerge() {
  router.navigate("/(tabs)");
}
