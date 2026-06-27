import {
  getTvChannelById,
  getTvChannelsByCategory,
  getVisibleTvChannels,
} from "@/data/tvChannelSeedCatalog";
import { isTvChannelMarkedBroken } from "@/services/tv/tvBrokenChannels";
import type { TVChannel, TvLiveSectionId } from "@/types/tv";

export const TV_CHANNEL_PAGE_SIZE = 32;

export const LIVE_TV_HOME_SECTIONS: Array<{
  id: TvLiveSectionId;
  title: string;
  category?: TVChannel["category"];
  featured?: boolean;
}> = [
  { id: "featured", title: "Featured Live TV", featured: true },
  { id: "music", title: "Music TV", category: "music" },
  { id: "worship", title: "Worship / Gospel TV", category: "worship" },
  { id: "concerts", title: "Live Concerts", category: "concerts" },
  { id: "culture", title: "Culture & Arts", category: "culture" },
  { id: "documentary", title: "Documentaries", category: "documentary" },
  { id: "news", title: "News", category: "news" },
];

function filterBroken(channels: TVChannel[]) {
  return channels.filter((channel) => !isTvChannelMarkedBroken(channel.id));
}

export function getFeaturedTvChannels(matureEnabled: boolean, limit = TV_CHANNEL_PAGE_SIZE) {
  const featured = filterBroken(
    getVisibleTvChannels(matureEnabled).filter((channel) => channel.isFeatured)
  );

  if (featured.length >= 8) {
    return featured.slice(0, limit);
  }

  return filterBroken(getVisibleTvChannels(matureEnabled)).slice(0, limit);
}

export function getRecommendedTvChannels(matureEnabled: boolean, limit = 16) {
  const pool = filterBroken(getVisibleTvChannels(matureEnabled));
  return pool.slice(0, limit);
}

export function getMatureTvChannels(matureEnabled: boolean) {
  if (!matureEnabled) return [];
  return filterBroken(getTvChannelsByCategory("mature", true));
}

export function getTvChannelsForSection(
  sectionId: TvLiveSectionId,
  matureEnabled: boolean,
  options: { offset?: number; limit?: number; channelIds?: string[] } = {}
) {
  const offset = Math.max(0, options.offset || 0);
  const limit = Math.min(TV_CHANNEL_PAGE_SIZE, Math.max(1, options.limit || TV_CHANNEL_PAGE_SIZE));

  let pool: TVChannel[] = [];

  if (options.channelIds?.length) {
    pool = options.channelIds
      .map((id) => getTvChannelById(id))
      .filter((channel): channel is TVChannel => channel !== null)
      .filter((channel) => channel.isActive && (!channel.isMature || matureEnabled));
  } else if (sectionId === "featured") {
    pool = getFeaturedTvChannels(matureEnabled, 200);
  } else if (sectionId === "recommended") {
    pool = getRecommendedTvChannels(matureEnabled, 200);
  } else if (sectionId === "all") {
    pool = filterBroken(getVisibleTvChannels(matureEnabled));
  } else if (sectionId === "mature") {
    pool = getMatureTvChannels(matureEnabled);
  } else {
    const section = LIVE_TV_HOME_SECTIONS.find((entry) => entry.id === sectionId);
    if (section?.category) {
      pool = filterBroken(getTvChannelsByCategory(section.category, matureEnabled));
    }
  }

  const slice = pool.slice(offset, offset + limit);

  return {
    channels: slice,
    total: pool.length,
    hasMore: offset + limit < pool.length,
    nextOffset: offset + limit,
  };
}

export function getRelatedTvChannels(channel: TVChannel, matureEnabled: boolean, limit = 8) {
  const sameCategory = filterBroken(
    getTvChannelsByCategory(channel.category, matureEnabled).filter(
      (entry) => entry.id !== channel.id
    )
  );

  if (sameCategory.length >= limit) {
    return sameCategory.slice(0, limit);
  }

  const fallback = filterBroken(
    getVisibleTvChannels(matureEnabled).filter((entry) => entry.id !== channel.id)
  );

  return [...sameCategory, ...fallback].slice(0, limit);
}

export function resolveTvPlaybackQueue(
  sectionId: TvLiveSectionId,
  channelIds: string[],
  matureEnabled: boolean
) {
  if (channelIds.length) {
    return channelIds
      .map((id) => getTvChannelById(id))
      .filter((channel): channel is TVChannel => {
        if (!channel || !channel.isActive) return false;
        if (channel.isMature && !matureEnabled) return false;
        return !isTvChannelMarkedBroken(channel.id);
      });
  }

  return getTvChannelsForSection(sectionId, matureEnabled, {
    offset: 0,
    limit: 200,
  }).channels;
}

export function searchTvChannelsLocal(
  query: string,
  matureEnabled: boolean,
  limit = TV_CHANNEL_PAGE_SIZE
) {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  return filterBroken(getVisibleTvChannels(matureEnabled))
    .filter((channel) => {
      const haystack = [
        channel.name,
        channel.description,
        channel.country,
        channel.language,
        channel.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(clean);
    })
    .slice(0, limit);
}
