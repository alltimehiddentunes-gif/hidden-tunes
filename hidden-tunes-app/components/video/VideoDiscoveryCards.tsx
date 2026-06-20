import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";

import { COLORS } from "../../constants/theme";
import type { HiddenTunesTvVideo } from "../../services/tvCatalogApi";
import {
  HIDDEN_TUNES_VIDEOS_LABEL,
  type LaunchVideoCategory,
} from "../../utils/launchVideoCategories";
import { videoDiscoveryDisplayName } from "../../utils/openHiddenTunesVideo";

type VideoCategoryCardProps = {
  category: LaunchVideoCategory;
  videoCount?: number;
  onPress: () => void;
};

export const VideoCategoryCard = memo(function VideoCategoryCard({
  category,
  videoCount,
  onPress,
}: VideoCategoryCardProps) {
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
          {typeof videoCount === "number" && videoCount > 0
            ? `${videoCount} Hidden Tunes videos`
            : HIDDEN_TUNES_VIDEOS_LABEL}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
});

type VideoListRowProps = {
  video: HiddenTunesTvVideo;
  subtitle?: string;
  onPress: () => void;
};

export const VideoListRow = memo(function VideoListRow({
  video,
  subtitle,
  onPress,
}: VideoListRowProps) {
  const thumbnail =
    video.thumbnail_url ||
    `https://i.ytimg.com/vi/${video.source_id}/hqdefault.jpg`;

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.row} onPress={onPress}>
      <View style={styles.thumbWrap}>
        <Image
          source={{ uri: thumbnail }}
          style={styles.thumb}
          contentFit="cover"
          transition={120}
          recyclingKey={video.id}
        />
        <View style={styles.playBadge}>
          <Ionicons name="play" size={12} color="#000" />
        </View>
      </View>

      <View style={styles.rowCopy}>
        <Text numberOfLines={2} style={styles.rowTitle}>
          {videoDiscoveryDisplayName(video.title)}
        </Text>
        <Text numberOfLines={1} style={styles.rowSubtitle}>
          {subtitle ||
            videoDiscoveryDisplayName(video.channel_name) ||
            videoDiscoveryDisplayName(video.genre)}
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
  row: {
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
  thumbWrap: {
    width: 96,
    height: 54,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  playBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  rowSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
});
