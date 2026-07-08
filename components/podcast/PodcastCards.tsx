import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import HTImage from "../HTImage";
import { COLORS } from "../../constants/theme";
import type { PodcastCategoryDef } from "../../constants/podcastCategories";
import type { PodcastEpisode, PodcastShow } from "../../types/podcast";
import { isPlayablePodcastAudioUrl } from "../../utils/podcastPlaybackAdapter";

function formatEpisodeDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type PodcastCategoryCardProps = {
  category: PodcastCategoryDef;
  onPress: () => void;
  locked?: boolean;
};

export const PodcastCategoryCard = memo(function PodcastCategoryCard({
  category,
  onPress,
  locked,
}: PodcastCategoryCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.card} onPress={onPress}>
      <LinearGradient colors={category.gradient} style={styles.gradient}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={locked ? "lock-closed-outline" : category.icon}
            size={22}
            color={COLORS.primary}
          />
        </View>
        <Text numberOfLines={1} style={styles.title}>
          {category.title}
        </Text>
        <Text numberOfLines={2} style={styles.subtitle}>
          {locked ? "18+ locked" : category.description}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
});

type PodcastShowCardProps = {
  show: PodcastShow;
  onPress: () => void;
};

export const PodcastShowCard = memo(function PodcastShowCard({
  show,
  onPress,
}: PodcastShowCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.showRow} onPress={onPress}>
      {show.artworkUrl ? (
        <HTImage
          uri={show.artworkUrl}
          style={styles.showArt}
          contentFit="cover"
          maxDecodeWidth={112}
          maxDecodeHeight={112}
        />
      ) : (
        <View style={styles.showArtFallback}>
          <Ionicons name="mic-outline" size={20} color={COLORS.textMuted} />
        </View>
      )}
      <View style={styles.showCopy}>
        <Text numberOfLines={1} style={styles.showTitle}>
          {show.title}
        </Text>
        <Text numberOfLines={1} style={styles.showSubtitle}>
          {show.publisher}
        </Text>
        {show.isExplicit ? <Text style={styles.explicitBadge}>EXPLICIT</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
});

type PodcastEpisodeCardProps = {
  episode: PodcastEpisode;
  onPress: () => void;
  disabled?: boolean;
  unavailableLabel?: string;
  played?: boolean;
  showDownloadPlaceholder?: boolean;
  index?: number;
  /** Metadata-only browse rows stay tappable; audio resolves on press. */
  browseOnly?: boolean;
};

export const PodcastEpisodeCard = memo(function PodcastEpisodeCard({
  episode,
  onPress,
  disabled,
  unavailableLabel,
  played = false,
  showDownloadPlaceholder = true,
  index = 0,
  browseOnly = false,
}: PodcastEpisodeCardProps) {
  const hasAudio =
    browseOnly ||
    Boolean(episode.audioUrl?.trim() && isPlayablePodcastAudioUrl(episode.audioUrl));
  const isDisabled = disabled || (!browseOnly && !hasAudio);
  const durationLabel =
    typeof episode.durationSeconds === "number" && episode.durationSeconds > 0
      ? `${Math.round(episode.durationSeconds / 60)} min`
      : undefined;
  const dateLabel = formatEpisodeDate(episode.publishedAt);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.episodeCard, isDisabled && styles.episodeDisabled]}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={
        isDisabled
          ? `${episode.title}, episode unavailable`
          : `Play episode ${index + 1}, ${episode.title}`
      }
      accessibilityState={{ disabled: isDisabled }}
    >
      {episode.artworkUrl ? (
        <HTImage
          uri={episode.artworkUrl}
          style={styles.episodeArtLarge}
          contentFit="cover"
          maxDecodeWidth={128}
          maxDecodeHeight={128}
        />
      ) : (
        <View style={styles.episodeArtLargeFallback}>
          <Ionicons name="play-outline" size={20} color={COLORS.textMuted} />
        </View>
      )}
      <View style={styles.showCopy}>
        <Text numberOfLines={2} style={styles.episodeTitle}>
          {episode.title}
        </Text>
        <Text numberOfLines={1} style={styles.showSubtitle}>
          {episode.showTitle}
        </Text>
        <View style={styles.metaRow}>
          {durationLabel ? <Text style={styles.metaText}>{durationLabel}</Text> : null}
          {dateLabel ? <Text style={styles.metaText}>{dateLabel}</Text> : null}
          {episode.isExplicit ? <Text style={styles.explicitBadge}>EXPLICIT</Text> : null}
          {played ? <Text style={styles.playedBadge}>PLAYED</Text> : null}
          {!hasAudio && !browseOnly ? (
            <Text style={styles.unavailableText}>
              {unavailableLabel || "Episode unavailable"}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.episodeActions}>
        {showDownloadPlaceholder ? (
          <View
            style={styles.downloadPlaceholder}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="download-outline" size={16} color={COLORS.textMuted} />
          </View>
        ) : null}
        <View
          style={[styles.playCircle, isDisabled && styles.playCircleDisabled]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name="play" size={14} color={COLORS.text} />
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 168,
    marginRight: 12,
  },
  gradient: {
    borderRadius: 18,
    padding: 14,
    minHeight: 132,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  showRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  showArt: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  showArtFallback: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  showCopy: {
    flex: 1,
    minWidth: 0,
  },
  showTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  showSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  explicitBadge: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
  },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  episodeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 10,
  },
  episodeDisabled: {
    opacity: 0.5,
  },
  episodeArt: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  episodeArtLarge: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  episodeArtLargeFallback: {
    width: 64,
    height: 64,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  episodeTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  episodeActions: {
    alignItems: "center",
    gap: 8,
  },
  downloadPlaceholder: {
    opacity: 0.35,
    padding: 2,
  },
  playedBadge: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: "800",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    flexWrap: "wrap",
  },
  metaText: {
    color: COLORS.textSoft,
    fontSize: 10,
  },
  typeBadge: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "700",
  },
  unavailableText: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: "700",
  },
  playCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.22)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  playCircleDisabled: {
    opacity: 0.35,
  },
});
