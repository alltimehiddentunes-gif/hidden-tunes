import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";

import HTImage from "../HTImage";

import { COLORS } from "../../constants/theme";
import type { HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import type { PodcastCategory } from "../../constants/podcastCategories";
import type { PodcastShowListItem } from "../../types/podcastDiscovery";
import { sanitizePodcastDiscoveryText } from "../../utils/openHiddenTunesPodcast";
import { getUserFacingPodcastSubtitle } from "../../services/ui/displayMetadata";
import type { LaunchPodcastCategory } from "../../utils/launchPodcastCategories";
import { isValidPodcastShowId } from "../../utils/podcastShowId";
import { isPlayablePodcastEpisode } from "../../services/podcast/podcastDiscoverability";
import { useMatureContentSettings } from "../../hooks/useMatureContentSettings";
import { isMaturePodcastEpisode } from "../../utils/maturePodcastVisibility";
import { isMatureContentItem } from "../../types/matureContent";
import MatureContentBadge from "../mature/MatureContentBadge";
import FavoriteButton from "../FavoriteButton";
import {
  buildPodcastEpisodeFavoriteItem,
  buildPodcastShowFavoriteItem,
} from "../../services/favorites/favoriteItemBuilders";
import type { HiddenTunesPodcastEpisode } from "../../services/podcastCatalogApi";

type PodcastCategoryCardProps = {
  category: LaunchPodcastCategory | PodcastCategory;
  showCount?: number;
  onPress: () => void;
};

export const PodcastCategoryCard = memo(function PodcastCategoryCard({
  category,
  showCount,
  onPress,
}: PodcastCategoryCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.card} onPress={onPress}>
      <LinearGradient colors={category.gradient} style={styles.gradient}>
        <View style={styles.iconWrap}>
          <Ionicons name={category.icon} size={22} color={COLORS.primary} />
        </View>
        <Text numberOfLines={1} style={styles.title}>
          {category.title}
        </Text>
        <Text numberOfLines={2} style={styles.subtitle}>
          {category.subtitle}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {typeof showCount === "number" && showCount > 0
            ? `${showCount} shows`
            : "Category"}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
});

type PodcastEmotionalWorldCardProps = {
  category: PodcastCategory;
  showCount?: number;
  onPress: () => void;
};

export const PodcastEmotionalWorldCard = memo(function PodcastEmotionalWorldCard({
  category,
  showCount,
  onPress,
}: PodcastEmotionalWorldCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.worldCard} onPress={onPress}>
      <LinearGradient colors={category.gradient} style={styles.worldGradient}>
        <View style={styles.worldIconWrap}>
          <Ionicons name={category.icon} size={20} color={COLORS.primary} />
        </View>
        <Text numberOfLines={1} style={styles.worldTitle}>
          {category.title}
        </Text>
        <Text numberOfLines={2} style={styles.worldSubtitle}>
          {category.subtitle}
        </Text>
        {typeof showCount === "number" && showCount > 0 ? (
          <Text style={styles.worldMeta}>{showCount}+ shows</Text>
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  );
});

type PodcastShowCardProps = {
  show: HiddenTunesPodcastShow;
  item?: PodcastShowListItem;
  subtitle?: string;
  onPress: () => void;
  variant?: "list" | "premium";
};

function formatPodcastDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `Latest ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function PodcastShowMetaChips({ item }: { item: PodcastShowListItem }) {
  const chips = [
    item.publisher,
    item.language,
    item.category,
    formatPodcastDate(item.latestEpisodeDate),
    item.episodeLabel,
  ]
    .filter(Boolean)
    .slice(0, 5);

  if (!chips.length) return null;

  return (
    <View style={styles.chipRow}>
      {chips.map((chip) => (
        <View key={`${item.id}-${chip}`} style={styles.chip}>
          <Text numberOfLines={1} style={styles.chipText}>
            {chip}
          </Text>
        </View>
      ))}
    </View>
  );
}

const PodcastShowArt = memo(function PodcastShowArt({
  artworkUrl,
  item,
  size = 64,
}: {
  artworkUrl?: string;
  item: PodcastShowListItem | HiddenTunesPodcastShow;
  size?: number;
}) {
  const { includeMatureInApi } = useMatureContentSettings();
  const showMatureArt = !isMatureContentItem(item) || includeMatureInApi;
  const radius = size >= 64 ? 16 : 14;

  if (!artworkUrl || !showMatureArt) {
    return (
      <View
        style={[styles.showArtFallback, { width: size, height: size, borderRadius: radius }]}
      >
        <Ionicons name="mic-outline" size={size >= 64 ? 24 : 20} color={COLORS.textMuted} />
      </View>
    );
  }

  return (
    <HTImage
      uri={artworkUrl}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: "rgba(255,255,255,0.06)" }}
      contentFit="cover"
      prefetch={false}
      maxDecodeWidth={size * 2}
      maxDecodeHeight={size * 2}
    />
  );
});

export const PodcastShowCard = memo(function PodcastShowCard({
  show,
  item,
  subtitle,
  onPress,
  variant = "list",
}: PodcastShowCardProps) {
  if (!isValidPodcastShowId(show.id)) return null;

  const isPremium = variant === "premium";
  const displayTitle = sanitizePodcastDiscoveryText(show.title) || show.title;
  const listItem =
    item ||
    ({
      id: show.id,
      title: displayTitle,
      artworkUrl: show.artwork_url,
      publisher: show.host_name,
      category: show.primary_category || show.categories?.[0],
      episodeCount: show.episode_count,
      episodeLabel:
        typeof show.episode_count === "number" && show.episode_count > 0
          ? `${show.episode_count} episodes`
          : undefined,
      language: show.language,
      latestEpisodeDate: show.last_published_at,
      is_mature: show.is_mature,
      content_rating: show.content_rating,
    } satisfies PodcastShowListItem);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.showRow, isPremium && styles.showRowPremium]}
      onPress={onPress}
    >
      <PodcastShowArt
        artworkUrl={listItem.artworkUrl || show.artwork_url}
        item={listItem}
        size={isPremium ? 64 : 64}
      />

      <View style={styles.showCopy}>
        <View style={styles.showTitleRow}>
          <Text numberOfLines={isPremium ? 1 : 2} style={[styles.showTitle, isPremium && styles.showTitlePremium]}>
            {listItem.title}
          </Text>
          <MatureContentBadge item={listItem} />
        </View>
        <Text numberOfLines={1} style={styles.showSubtitle}>
          {subtitle || getUserFacingPodcastSubtitle(null, show.title)}
        </Text>
        {isPremium ? <PodcastShowMetaChips item={listItem} /> : null}
      </View>

      <FavoriteButton item={buildPodcastShowFavoriteItem(show)} size={18} />
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
});

type PodcastShowRailCardProps = {
  item: PodcastShowListItem;
  onPress: () => void;
};

export const PodcastShowRailCard = memo(function PodcastShowRailCard({
  item,
  onPress,
}: PodcastShowRailCardProps) {
  if (!isValidPodcastShowId(item.id)) return null;

  const { includeMatureInApi } = useMatureContentSettings();
  const showMatureArt = !isMatureContentItem(item) || includeMatureInApi;

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.railCard} onPress={onPress}>
      <LinearGradient colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} style={styles.railGradient}>
        {item.artworkUrl && showMatureArt ? (
          <Image
            source={{ uri: item.artworkUrl, width: 148, height: 96 }}
            style={styles.railArt}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
            priority="low"
          />
        ) : (
          <View style={styles.railArtFallback}>
            <Ionicons name="mic-outline" size={28} color={COLORS.primaryGlow} />
          </View>
        )}
        <View style={styles.railTitleRow}>
          <Text numberOfLines={2} style={styles.railTitle}>
            {item.title}
          </Text>
          <MatureContentBadge item={item} />
        </View>
        <Text numberOfLines={1} style={styles.railSubtitle}>
          {item.publisher || item.category || ""}
        </Text>
        {item.episodeLabel ? (
          <Text numberOfLines={1} style={styles.railMeta}>
            {item.episodeLabel}
          </Text>
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  );
});

type PodcastEpisodeRowProps = {
  episode: HiddenTunesPodcastEpisode;
  subtitle?: string;
  showIsMature?: boolean;
  isPlayable?: boolean;
  onPress: () => void;
};

export const PodcastEpisodeRow = memo(function PodcastEpisodeRow({
  episode,
  subtitle,
  showIsMature = false,
  isPlayable = true,
  onPress,
}: PodcastEpisodeRowProps) {
  const { includeMatureInApi } = useMatureContentSettings();
  const playable = isPlayable && isPlayablePodcastEpisode(episode);
  const matureItem = {
    is_mature: isMaturePodcastEpisode(episode, showIsMature),
    content_rating: episode.content_rating,
  };
  const showMatureArt = !isMaturePodcastEpisode(episode, showIsMature) || includeMatureInApi;

  return (
    <TouchableOpacity
      activeOpacity={playable ? 0.88 : 1}
      style={[styles.episodeRow, !playable && styles.episodeRowDisabled]}
      onPress={playable ? onPress : undefined}
      disabled={!playable}
    >
      {episode.artwork_url && showMatureArt ? (
        <Image
          source={{ uri: episode.artwork_url }}
          style={styles.episodeArt}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          priority="low"
          recyclingKey={episode.id}
        />
      ) : (
        <View style={styles.episodeArtFallback}>
          <Ionicons name="play-outline" size={18} color={COLORS.primary} />
        </View>
      )}

      <View style={styles.episodeCopy}>
        <View style={styles.episodeTitleRow}>
          <Text numberOfLines={2} style={styles.episodeTitle}>
            {sanitizePodcastDiscoveryText(episode.title) || episode.title}
          </Text>
          <MatureContentBadge item={matureItem} />
        </View>
        <Text numberOfLines={1} style={styles.episodeSubtitle}>
          {playable
            ? subtitle || getUserFacingPodcastSubtitle(episode)
            : "Unavailable · no playable audio"}
        </Text>
      </View>

      {playable ? (
        <FavoriteButton
          item={buildPodcastEpisodeFavoriteItem(episode, {
            showTitle: subtitle,
            showIsMature,
          })}
          size={18}
        />
      ) : null}
      {playable ? (
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      ) : (
        <Ionicons name="ban-outline" size={18} color={COLORS.textMuted} />
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "48%",
    borderRadius: 22,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  gradient: {
    minHeight: 156,
    padding: 14,
    justifyContent: "flex-end",
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.24)",
    marginBottom: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
    fontWeight: "600",
  },
  meta: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 10,
  },
  worldCard: {
    width: 168,
    marginRight: 12,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  worldGradient: {
    minHeight: 168,
    padding: 14,
    justifyContent: "flex-end",
  },
  worldIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.24)",
    marginBottom: 10,
  },
  worldTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  worldSubtitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
    fontWeight: "600",
  },
  worldMeta: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 8,
  },
  showRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  showRowPremium: {
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  showArtFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  showCopy: {
    flex: 1,
    gap: 3,
  },
  showTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  showTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19,
    flexShrink: 1,
  },
  showTitlePremium: {
    fontSize: 16,
  },
  showSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },
  railCard: {
    width: 148,
    marginRight: 12,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  railGradient: {
    minHeight: 196,
    padding: 12,
  },
  railArt: {
    width: "100%",
    height: 96,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  railArtFallback: {
    width: "100%",
    height: 96,
    borderRadius: 14,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  railTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  railTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
    flex: 1,
  },
  railSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
  railMeta: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 6,
  },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  episodeRowDisabled: {
    opacity: 0.55,
  },
  episodeArt: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  episodeArtFallback: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  episodeCopy: {
    flex: 1,
    gap: 3,
  },
  episodeTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  episodeTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
    flexShrink: 1,
  },
  episodeSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
});
