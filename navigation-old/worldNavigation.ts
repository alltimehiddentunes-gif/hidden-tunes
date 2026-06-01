import { router } from "expo-router";

import { setActiveWorldId } from "../state/emotionalFlowSettings";

export const WORLD_GALLERY_HREF = "/worlds" as const;

export function worldDetailHref(worldId: string) {
  return `/worlds/${encodeURIComponent(worldId)}` as const;
}

let pendingWorldNavigation = false;

export function navigateToWorldGalleryWithMerge() {
  if (pendingWorldNavigation) return;

  pendingWorldNavigation = true;

  requestAnimationFrame(() => {
    pendingWorldNavigation = false;
    setActiveWorldId(null);
    router.navigate(WORLD_GALLERY_HREF);
  });
}

export function navigateToWorldDetailWithMerge(worldId: string) {
  const safeId = String(worldId || "").trim();
  if (!safeId) return;

  if (pendingWorldNavigation) return;

  pendingWorldNavigation = true;

  requestAnimationFrame(() => {
    pendingWorldNavigation = false;
    setActiveWorldId(safeId);
    router.navigate(worldDetailHref(safeId));
  });
}
