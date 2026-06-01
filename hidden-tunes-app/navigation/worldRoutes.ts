import WorldDetailScreen from "../screens/WorldDetailScreen";
import WorldGalleryScreen from "../screens/WorldGalleryScreen";

export const WORLD_ROUTE_PATHS = {
  gallery: "/worlds",
  detail: "/worlds/[worldId]",
} as const;

export const WORLD_ROUTE_SCREENS = {
  [WORLD_ROUTE_PATHS.gallery]: WorldGalleryScreen,
  detail: WorldDetailScreen,
} as const;

export { WorldGalleryScreen, WorldDetailScreen };
