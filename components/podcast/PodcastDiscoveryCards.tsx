import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";

import { COLORS } from "../../constants/theme";
import type { HiddenTunesPodcastEpisode, HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import {
  HIDDEN_TUNES_PODCASTS_LABEL,
  type LaunchPodcastCategory,
} from "../../utils/launchPodcastCategories";
import { podcastDiscoveryDisplayName } from "../../utils/openHiddenTunesPodcast";
import { getUserFacingPodcastSubtitle } from "../../services/ui/displayMetadata";
import { useMatureContentSettings } from "../../hooks/useMatureContentSettings";
import { isMatureContentItem } from "../../types/matureContent";
import MatureContentBadge from "../mature/MatureContentBadge";

type PodcastCategoryCardProps = {
  category: LaunchPodcastCategory;
  showCount?: number;
  onPress: () => void;
};

export const PodcastCategoryCard = memo(function PodcastCategoryCard({
  category,
  showCount,
  onPress,
}: PodcastCategoryCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.card}
      onPress={onPress}
    >
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
            ? `${showCount} Hidden Tunes shows`
            : HIDDEN_TUNES_PODCASTS_LABEL}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
});

type PodcastShowCardProps = {
  show: HiddenTunesPodcastShow;
  subtitle?: string;
  onPress: () => void;
};

export const PodcastShowCard = memo(function PodcastShowCard({
  show,
  subtitle,
  onPress,
}: PodcastShowCardProps) {
  const { includeMatureInApi } = useMatureContentSettings();
  const showMatureArt = !isMatureContentItem(show) || includeMatureInApi;

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.showRow} onPress={onPress}>
      {show.artwork_url && showMatureArt ? (
        <Image
          source={{ uri: show.artwork_url }}
          style={styles.showArt}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          priority="low"
          recyclingKey={show.id}
        />
      ) : (
        <View style={styles.showArtFallback}>
          <Ionicons name="mic-outline" size={22} color={COLORS.textMuted} />
        </View>
      )}

      <View style={styles.showCopy}>
        <View style={styles.showTitleRow}>
          <Text numberOfLines={2} style={styles.showTitle}>
            {podcastDiscoveryDisplayName(show.title)}
          </Text>
          <MatureContentBadge item={show} />
        </View>
        <Text numberOfLines={1} style={styles.showSubtitle}>
          {subtitle || getUserFacingPodcastSubtitle(null, show.title)}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
});

type PodcastEpisodeRowProps = {
  episode: HiddenTunesPodcastEpisode;
  subtitle?: string;
  onPress: () => void;
};

export const PodcastEpisodeRow = memo(function PodcastEpisodeRow({
  episode,
  subtitle,
  onPress,
}: PodcastEpisodeRowProps) {
  const { includeMatureInApi } = useMatureContentSettings();
  const showMatureArt = !isMatureContentItem(episode) || includeMatureInApi;

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.episodeRow} onPress={onPress}>
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
            {podcastDiscoveryDisplayName(episode.title)}
          </Text>
          <MatureContentBadge item={episode} />
        </View>
        <Text numberOfLines={1} style={styles.episodeSubtitle}>
          {subtitle || getUserFacingPodcastSubtitle(episode)}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
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
  showArt: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  showArtFallback: {
    width: 64,
    height: 64,
    borderRadius: 16,
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
  showSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
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
