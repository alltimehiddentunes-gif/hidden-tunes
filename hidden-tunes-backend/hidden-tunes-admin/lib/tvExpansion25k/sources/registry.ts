import { communityTvAdapter } from "@/lib/tvExpansion25k/sources/communityTv";
import { culturalBroadcastersAdapter } from "@/lib/tvExpansion25k/sources/culturalBroadcasters";
import { curatedSeedsAdapter } from "@/lib/tvExpansion25k/sources/curatedSeedsAdapter";
import { educationTvAdapter } from "@/lib/tvExpansion25k/sources/educationTv";
import { freeTvLegalAdapter } from "@/lib/tvExpansion25k/sources/freeTvLegalAdapter";
import { governmentParliamentHlsAdapter } from "@/lib/tvExpansion25k/sources/governmentParliamentHls";
import { governmentParliamentHlsExtendedAdapter } from "@/lib/tvExpansion25k/sources/governmentParliamentHlsExtended";
import { governmentTvAdapter } from "@/lib/tvExpansion25k/sources/governmentTv";
import { iptvOrgAdapter } from "@/lib/tvExpansion25k/sources/iptvOrgAdapter";
import { municipalTvAdapter } from "@/lib/tvExpansion25k/sources/municipalTv";
import { musicTvAdapter } from "@/lib/tvExpansion25k/sources/musicTv";
import { newsBroadcastersAdapter } from "@/lib/tvExpansion25k/sources/newsBroadcasters";
import { officialBroadcastersAdapter } from "@/lib/tvExpansion25k/sources/officialBroadcasters";
import { officialFastProvidersAdapter } from "@/lib/tvExpansion25k/sources/officialFastProviders";
import { officialGlobalHlsAdapter } from "@/lib/tvExpansion25k/sources/officialGlobalHls";
import { officialGlobalHlsExtendedAdapter } from "@/lib/tvExpansion25k/sources/officialGlobalHlsExtended";
import { officialYouTubeLiveAdapter } from "@/lib/tvExpansion25k/sources/officialYouTubeLive";
import { parliamentaryTvAdapter } from "@/lib/tvExpansion25k/sources/parliamentaryTv";
import { plutoTvFastAdapter } from "@/lib/tvExpansion25k/sources/plutoTvFast";
import { plutoTvGlobalMjhAdapter } from "@/lib/tvExpansion25k/sources/plutoTvGlobalMjh";
import { publicBroadcastersAdapter } from "@/lib/tvExpansion25k/sources/publicBroadcasters";
import { regionalTvAdapter } from "@/lib/tvExpansion25k/sources/regionalTv";
import { religiousBroadcastersAdapter } from "@/lib/tvExpansion25k/sources/religiousBroadcasters";
import { rokuFastChannelsAdapter } from "@/lib/tvExpansion25k/sources/rokuFastChannels";
import { samsungTvPlusFastAdapter } from "@/lib/tvExpansion25k/sources/samsungTvPlusFast";
import { sportsBroadcastersAdapter } from "@/lib/tvExpansion25k/sources/sportsBroadcasters";
import { createInitialSourceCursor, type TvExpansionSourceAdapter } from "@/lib/tvExpansion25k/sources/types";
import { tdtChannelsAdapter } from "@/lib/tvExpansion25k/sources/tdtChannels";
import { universityTvAdapter } from "@/lib/tvExpansion25k/sources/universityTv";
import { WORLDWAVE_SOURCE_ADAPTERS } from "@/lib/tvExpansion25k/sources/worldwave/worldwaveSources";
import { WORLDWAVE3_SOURCE_ADAPTERS } from "@/lib/tvExpansion25k/sources/worldwave3/wave3Sources";
import { WORLDWAVE4_MATURE_SOURCE_ADAPTERS } from "@/lib/tvExpansion25k/sources/worldwave4/wave4MatureSources";
import { WORLDWAVE4_SOURCE_ADAPTERS } from "@/lib/tvExpansion25k/sources/worldwave4/wave4Sources";
import { youtubeOfficialGlobalAdapter } from "@/lib/tvExpansion25k/sources/youtubeOfficialGlobal";
import { youtubeOfficialGlobalExtendedAdapter } from "@/lib/tvExpansion25k/sources/youtubeOfficialGlobalExtended";
import { youtubeStarterAdapter } from "@/lib/tvExpansion25k/sources/youtubeStarterAdapter";

/** Wave 1 category adapters (legacy iptv-org family). */
export const TV_EXPANSION_WAVE1_SOURCE_ADAPTERS: TvExpansionSourceAdapter[] = [
  iptvOrgAdapter,
  freeTvLegalAdapter,
  officialBroadcastersAdapter,
  publicBroadcastersAdapter,
  governmentTvAdapter,
  parliamentaryTvAdapter,
  regionalTvAdapter,
  communityTvAdapter,
  municipalTvAdapter,
  educationTvAdapter,
  universityTvAdapter,
  officialFastProvidersAdapter,
  newsBroadcastersAdapter,
  sportsBroadcastersAdapter,
  musicTvAdapter,
  culturalBroadcastersAdapter,
  religiousBroadcastersAdapter,
  officialYouTubeLiveAdapter,
  curatedSeedsAdapter,
  youtubeStarterAdapter,
];

/** Independent upstream adapters introduced before worldwide waves. */
export const TV_EXPANSION_INDEPENDENT_SOURCE_ADAPTERS: TvExpansionSourceAdapter[] = [
  tdtChannelsAdapter,
  plutoTvFastAdapter,
  officialGlobalHlsAdapter,
  youtubeOfficialGlobalAdapter,
  governmentParliamentHlsAdapter,
  samsungTvPlusFastAdapter,
  rokuFastChannelsAdapter,
  plutoTvGlobalMjhAdapter,
  officialGlobalHlsExtendedAdapter,
  governmentParliamentHlsExtendedAdapter,
  youtubeOfficialGlobalExtendedAdapter,
];

export const TV_EXPANSION_SOURCE_ADAPTERS: TvExpansionSourceAdapter[] = [
  ...TV_EXPANSION_WAVE1_SOURCE_ADAPTERS,
  ...TV_EXPANSION_INDEPENDENT_SOURCE_ADAPTERS,
  ...WORLDWAVE_SOURCE_ADAPTERS,
  ...WORLDWAVE3_SOURCE_ADAPTERS,
  ...WORLDWAVE4_SOURCE_ADAPTERS,
  ...WORLDWAVE4_MATURE_SOURCE_ADAPTERS,
];

export const TV_EXPANSION_WAVE2_ACTIVE_SOURCE_IDS = [
  "paratv-official",
  "paratv-stream-manifests",
  "independent-m3u-worldwave",
  "iptv-org-unseen-worldwave",
  "free-tv-world-countries",
  "official-org-manifests",
  "parliament-worldwave",
  "public-europe-wave2",
  "public-americas-wave2",
  "public-asia-pacific-wave2",
  "public-africa-middle-east-wave2",
  "bloomberg-official",
  "france-medias-official",
  "cgtn-official",
  "dw-official",
  "redbull-official",
  "youtube-official-worldwave",
] as const;

export const TV_EXPANSION_WAVE2_INDEPENDENT_SOURCE_IDS = [
  "paratv-official",
  "paratv-stream-manifests",
  "independent-m3u-worldwave",
  "bloomberg-official",
  "france-medias-official",
  "cgtn-official",
  "redbull-official",
  "dw-official",
  "official-org-manifests",
  "parliament-worldwave",
  "youtube-official-worldwave",
] as const;

export const TV_EXPANSION_WAVE3_ACTIVE_SOURCE_IDS = [
  "xumo-official-wave3",
  "json-teles-community-wave3",
  "country-official-manifests-wave3",
  "parliament-government-wave3",
  "university-education-wave3",
  "youtube-official-wave3",
  "iptv-org-api-residual-wave3",
  "public-americas-wave3",
  "public-europe-wave3",
  "public-asia-pacific-wave3",
  "public-africa-middle-east-wave3",
] as const;

export const TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS = [
  "iptv-org-github-countries-wave4",
  "country-official-manifests-wave4",
  "parliament-government-wave4",
  "international-news-wave4",
  "religious-education-wave4",
  "regional-community-wave4",
  "free-community-playlists-wave4",
  "education-culture-wave4",
] as const;

export const TV_EXPANSION_WAVE4_MATURE_SOURCE_IDS = [] as const;

/** Active inventory sources for the current worldwide wave (used by build estimates). */
export const TV_EXPANSION_ACTIVE_SOURCE_IDS = [
  ...TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS,
] as const;

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

export function getWave4NormalSourceAdapters() {
  return WORLDWAVE4_SOURCE_ADAPTERS;
}

export function getWave4MatureSourceAdapters() {
  return WORLDWAVE4_MATURE_SOURCE_ADAPTERS;
}
