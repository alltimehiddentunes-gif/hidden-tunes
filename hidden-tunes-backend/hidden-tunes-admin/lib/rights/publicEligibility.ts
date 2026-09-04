import { evaluateRights } from "@/lib/rights/effectivePolicy";
import type { RightsCatalogItem, RightsPlatform, RightsPolicy } from "@/lib/rights/types";

export const RIGHTS_ENFORCEMENT_SURFACES = [
  "home", "explore", "search", "track_details", "artists", "albums", "recommendations",
  "emotional_worlds", "mood_rooms", "playlists", "favorites", "history", "queue",
  "direct_ids", "deep_links", "playback_url", "tv", "radio", "podcasts", "audiobooks",
  "lectures", "motivationals",
] as const;

/**
 * Shared server contract for future route integration. Phase 4A deliberately
 * leaves public routes unchanged; callers cannot control the enforcement gate.
 */
export function publicEligibility(input: {
  item: RightsCatalogItem;
  policies: RightsPolicy[];
  platform: RightsPlatform;
  territory: string;
}) {
  return evaluateRights(input);
}

