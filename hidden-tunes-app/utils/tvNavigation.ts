import { router } from "expo-router";

import { getTvChannelById } from "@/data/tvChannelSeedCatalog";
import {
  isTvChannelPlayable,
  resolveTvPlaybackQueue,
} from "@/services/tv/tvChannelService";
import {
  clearTvPlaybackSession,
  setTvPlaybackSession,
} from "@/services/tv/tvPlaybackSession";
import type { TVChannel, TvLiveSectionId } from "@/types/tv";

type OpenTvChannelOptions = {
  sectionId: TvLiveSectionId;
  channelIds?: string[];
  matureEnabled?: boolean;
};

export function openTvChannelPlayer(
  channel: TVChannel | string,
  options: OpenTvChannelOptions
) {
  const resolved =
    typeof channel === "string" ? getTvChannelById(channel) : channel;

  if (!resolved) return;

  const matureEnabled = options.matureEnabled === true;
  if (!isTvChannelPlayable(resolved, matureEnabled)) return;

  const queue = resolveTvPlaybackQueue(
    options.sectionId,
    options.channelIds || [],
    matureEnabled
  );

  const channelIds =
    options.channelIds && options.channelIds.length
      ? options.channelIds
      : queue.map((entry) => entry.id);

  const startIndex = Math.max(
    0,
    channelIds.findIndex((id) => id === resolved.id)
  );

  setTvPlaybackSession({
    sectionId: options.sectionId,
    channelIds,
    startIndex: startIndex >= 0 ? startIndex : 0,
  });

  router.push({
    pathname: "/tv-player",
    params: {
      channelId: resolved.id,
    },
  } as any);
}

export function closeTvPlayer() {
  clearTvPlaybackSession();
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace("/(tabs)/tv");
}
