import { memo, useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { SPORTS_COLORS } from "@/lib/sports/ui/sportsTheme";
import type { SportsVideoCard as SportsVideoCardType } from "@/types/sports";

function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return null;
  }
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

function formatPublishedAgo(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) return null;
  const ms = Date.parse(publishedAt);
  if (!Number.isFinite(ms)) return null;
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (deltaSeconds < 60) return "Just now";
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${Math.max(1, months)}mo ago`;
}

function formatVideoTypeLabel(videoType: string): string {
  const normalized = String(videoType || "").toLowerCase();
  if (normalized === "highlights" || normalized === "highlight") return "Highlights";
  if (normalized === "replay") return "Replay";
  if (normalized === "interview") return "Interview";
  if (normalized === "analysis") return "Analysis";
  if (!normalized) return "Video";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

type SportsVideoCardProps = {
  video: SportsVideoCardType;
  width?: number;
  loading?: boolean;
  onPress?: (video: SportsVideoCardType) => void;
};

function SportsVideoCard({ video, width = 200, loading = false, onPress }: SportsVideoCardProps) {
  const handlePress = useCallback(() => {
    onPress?.(video);
  }, [onPress, video]);

  const thumbnail = video.thumbnailUrl || video.artworkUrl || null;
  const duration = formatDuration(video.durationSeconds);
  const typeLabel = formatVideoTypeLabel(video.videoType);
  const publishedAgo = formatPublishedAgo(video.publishedAt);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={handlePress}
      style={[styles.card, { width }]}
      accessibilityRole="button"
      accessibilityLabel={`Play ${typeLabel}, ${video.title}`}
    >
      <View style={styles.thumbWrap}>
        {thumbnail ? (
          <Image
            source={{ uri: thumbnail }}
            style={styles.thumb}
            contentFit="cover"
            transition={120}
            recyclingKey={video.id}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="film-outline" size={26} color={SPORTS_COLORS.textDim} />
          </View>
        )}

        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{typeLabel}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={SPORTS_COLORS.amber} />
          </View>
        ) : (
          <View style={styles.playBadge}>
            <Ionicons name="play" size={14} color="#0A0A0A" />
          </View>
        )}

        {duration ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{duration}</Text>
          </View>
        ) : null}
      </View>

      <Text numberOfLines={2} style={styles.title}>
        {video.title}
      </Text>

      <Text numberOfLines={1} style={styles.meta}>
        {[video.competitionName, publishedAgo].filter(Boolean).join(" · ") || "Hidden Tunes Sports"}
      </Text>
    </TouchableOpacity>
  );
}

export default memo(SportsVideoCard);

const styles = StyleSheet.create({
  card: {
    marginRight: 12,
  },

  thumbWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: SPORTS_COLORS.surfaceGlass,
    borderWidth: 1,
    borderColor: SPORTS_COLORS.border,
  },

  thumb: {
    width: "100%",
    height: "100%",
  },

  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },

  typeBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: SPORTS_COLORS.plumSoft,
  },

  typeBadgeText: {
    color: SPORTS_COLORS.plum,
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  playBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SPORTS_COLORS.amber,
  },

  durationBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(0,0,0,0.72)",
  },

  durationText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },

  title: {
    color: SPORTS_COLORS.text,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10,
    lineHeight: 17,
  },

  meta: {
    color: SPORTS_COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
});
