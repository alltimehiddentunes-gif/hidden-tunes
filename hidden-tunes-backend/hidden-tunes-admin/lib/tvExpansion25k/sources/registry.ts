import { communityTvAdapter } from "@/lib/tvExpansion25k/sources/communityTv";
import { curatedSeedsAdapter } from "@/lib/tvExpansion25k/sources/curatedSeedsAdapter";
import { educationTvAdapter } from "@/lib/tvExpansion25k/sources/educationTv";
import { freeTvLegalAdapter } from "@/lib/tvExpansion25k/sources/freeTvLegalAdapter";
import { governmentTvAdapter } from "@/lib/tvExpansion25k/sources/governmentTv";
import { iptvOrgAdapter } from "@/lib/tvExpansion25k/sources/iptvOrgAdapter";
import { musicTvAdapter } from "@/lib/tvExpansion25k/sources/musicTv";
import { newsBroadcastersAdapter } from "@/lib/tvExpansion25k/sources/newsBroadcasters";
import { officialBroadcastersAdapter } from "@/lib/tvExpansion25k/sources/officialBroadcasters";
import { officialFastProvidersAdapter } from "@/lib/tvExpansion25k/sources/officialFastProviders";
import { officialYouTubeLiveAdapter } from "@/lib/tvExpansion25k/sources/officialYouTubeLive";
import { parliamentaryTvAdapter } from "@/lib/tvExpansion25k/sources/parliamentaryTv";
import { publicBroadcastersAdapter } from "@/lib/tvExpansion25k/sources/publicBroadcasters";
import { regionalTvAdapter } from "@/lib/tvExpansion25k/sources/regionalTv";
import { religiousBroadcastersAdapter } from "@/lib/tvExpansion25k/sources/religiousBroadcasters";
import { createInitialSourceCursor, type TvExpansionSourceAdapter } from "@/lib/tvExpansion25k/sources/types";
import { universityTvAdapter } from "@/lib/tvExpansion25k/sources/universityTv";
import { youtubeStarterAdapter } from "@/lib/tvExpansion25k/sources/youtubeStarterAdapter";

export const TV_EXPANSION_SOURCE_ADAPTERS: TvExpansionSourceAdapter[] = [
  iptvOrgAdapter,
  freeTvLegalAdapter,
  officialBroadcastersAdapter,
  publicBroadcastersAdapter,
  governmentTvAdapter,
  regionalTvAdapter,
  communityTvAdapter,
  educationTvAdapter,
  officialFastProvidersAdapter,
  officialYouTubeLiveAdapter,
  religiousBroadcastersAdapter,
  musicTvAdapter,
  newsBroadcastersAdapter,
  parliamentaryTvAdapter,
  universityTvAdapter,
  curatedSeedsAdapter,
  youtubeStarterAdapter,
];

export function initialAdapterCursors() {
  const cursors: Record<string, ReturnType<typeof createInitialSourceCursor>> = {};
  for (const adapter of TV_EXPANSION_SOURCE_ADAPTERS) {
    cursors[adapter.id] = createInitialSourceCursor(adapter.id);
  }
  return cursors;
}

export function getTvExpansionSourceAdapter(id: string) {
  return TV_EXPANSION_SOURCE_ADAPTERS.find((adapter) => adapter.id === id) || null;
}
