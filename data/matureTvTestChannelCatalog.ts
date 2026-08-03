import { isMatureTvTestModeEnabled } from "@/services/tv/matureTvTestMode";
import type { TVChannel } from "@/types/tv";

export const MATURE_TV_TEST_CHANNEL_IDS = [
  "mature-gate-test-primary",
  "mature-gate-test-alternate",
] as const;

export type MatureTvTestChannelId = (typeof MATURE_TV_TEST_CHANNEL_IDS)[number];

const FRANCE_24_TEST_STREAM =
  "https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_900.m3u8";
const DW_ENGLISH_TEST_STREAM =
  "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/master.m3u8";

const MATURE_TV_TEST_CHANNELS: TVChannel[] = [
  {
    id: "mature-gate-test-primary",
    name: "Mature Gate Playback Test — Working Stream",
    description:
      "Internal 18+ gate playback test using a verified public HLS stream. Not adult content.",
    streamUrl: FRANCE_24_TEST_STREAM,
    country: "FR",
    language: "English",
    category: "mature",
    streamType: "hls",
    quality: "HD",
    isLive: true,
    catalogStatus: "active",
    isActive: true,
    isMature: true,
    isVerifiedLegal: true,
    sourceType: "test",
  },
  {
    id: "mature-gate-test-alternate",
    name: "Mature Gate Playback Test — Alternate Stream",
    description:
      "Internal 18+ gate playback test using a second verified public HLS stream. Not adult content.",
    streamUrl: DW_ENGLISH_TEST_STREAM,
    country: "DE",
    language: "English",
    category: "mature",
    streamType: "hls",
    quality: "HD",
    isLive: true,
    catalogStatus: "active",
    isActive: true,
    isMature: true,
    isVerifiedLegal: true,
    sourceType: "test",
  },
];

const testChannelById = new Map(
  MATURE_TV_TEST_CHANNELS.map((channel) => [channel.id, channel])
);

export function isMatureTvTestChannelId(channelId: string) {
  return MATURE_TV_TEST_CHANNEL_IDS.includes(channelId as MatureTvTestChannelId);
}

export function isMatureTvTestChannel(
  channel: Pick<TVChannel, "id" | "sourceType">
) {
  return channel.sourceType === "test" || isMatureTvTestChannelId(channel.id);
}

export function getMatureTvTestChannelById(channelId: string) {
  if (!isMatureTvTestModeEnabled() || !isMatureTvTestChannelId(channelId)) {
    return null;
  }

  return testChannelById.get(channelId) || null;
}

export function getMatureTvTestChannels() {
  if (!isMatureTvTestModeEnabled()) return [];
  return MATURE_TV_TEST_CHANNELS;
}
