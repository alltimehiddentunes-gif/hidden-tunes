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
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.showRow} onPress={onPress}>
      {show.artwork_url ? (
        <Image
          source={{ uri: show.artwork_url }}
          style={styles.showArt}
          contentFit="cover"
          transition={120}
          recyclingKey={show.id}
        />
      ) : (
        <View style={styles.showArtFallback}>
          <Ionicons name="mic-outline" size={22} color={COLORS.textMuted} />
        </View>
      )}

      <View style={styles.showCopy}>
        <Text numberOfLines={2} style={styles.showTitle}>
          {podcastDiscoveryDisplayName(show.title)}
        </Text>
        <Text numberOfLines={1} style={styles.showSubtitle}>
          {subtitle || HIDDEN_TUNES_PODCASTS_LABEL}
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
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.episodeRow} onPress={onPress}>
      {episode.artwork_url ? (
        <Image
          source={{ uri: episode.artwork_url }}
          style={styles.episodeArt}
          contentFit="cover"
          transition={120}
          recyclingKey={episode.id}
        />
      ) : (
        <View style={styles.episodeArtFallback}>
          <Ionicons name="play-outline" size={18} color={COLORS.primary} />
        </View>
      )}

      <View style={styles.episodeCopy}>
        <Text numberOfLines={2} style={styles.episodeTitle}>
          {podcastDiscoveryDisplayName(episode.title)}
        </Text>
        <Text numberOfLines={1} style={styles.episodeSubtitle}>
          {subtitle || HIDDEN_TUNES_PODCASTS_LABEL}
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
  showTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19,
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
  episodeTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  episodeSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
});
