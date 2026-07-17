import { createOlympicsAdapter } from "./olympics";
import { createScoreBatAdapter } from "./scorebat";
import { createPlaceholderAdapter } from "./types";
import type { SportsProviderAdapter } from "./types";

export const sportsProviderRegistry: Record<string, SportsProviderAdapter> = {
  fifa: createPlaceholderAdapter("fifa", "FIFA"),
  olympics: createOlympicsAdapter({
    enabled: false,
    killSwitch: true,
  }),
  scorebat: createScoreBatAdapter({
    enabled: false,
    killSwitch: true,
  }),
  federation: createPlaceholderAdapter("federation", "Federation"),
  clubTv: createPlaceholderAdapter("club_tv", "Club TV"),
  league: createPlaceholderAdapter("league", "League"),
  fast: createPlaceholderAdapter("fast", "FAST"),
  publicBroadcaster: createPlaceholderAdapter(
    "public_broadcaster",
    "Public Broadcaster"
  ),
  youtubeOfficial: createPlaceholderAdapter(
    "youtube_official",
    "YouTube Official"
  ),
  officialEmbed: createPlaceholderAdapter("official_embed", "Official Embed"),
  manualRightsPartner: createPlaceholderAdapter(
    "manual_rights_partner",
    "Manual Rights Partner"
  ),
};

export function getSportsProvider(slug: string): SportsProviderAdapter | null {
  return sportsProviderRegistry[slug] || null;
}

export function listSportsProviders(): SportsProviderAdapter[] {
  return Object.values(sportsProviderRegistry);
}

export { createOlympicsAdapter } from "./olympics";
export { createScoreBatAdapter } from "./scorebat";
