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
        <HTImage uri={show.artworkUrl} style={styles.showArt} contentFit="cover" />
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
};

export const PodcastEpisodeCard = memo(function PodcastEpisodeCard({
  episode,
  onPress,
  disabled,
  unavailableLabel,
}: PodcastEpisodeCardProps) {
  const hasAudio = Boolean(
    episode.audioUrl?.trim() && isPlayablePodcastAudioUrl(episode.audioUrl)
  );
  const isDisabled = disabled || !hasAudio;
  const durationLabel =
    typeof episode.durationSeconds === "number" && episode.durationSeconds > 0
      ? `${Math.round(episode.durationSeconds / 60)} min`
      : undefined;
  const dateLabel = formatEpisodeDate(episode.publishedAt);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.episodeRow, isDisabled && styles.episodeDisabled]}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
    >
      {episode.artworkUrl ? (
        <HTImage uri={episode.artworkUrl} style={styles.episodeArt} contentFit="cover" />
      ) : (
        <View style={styles.showArtFallback}>
          <Ionicons name="play-outline" size={18} color={COLORS.textMuted} />
        </View>
      )}
      <View style={styles.showCopy}>
        <Text numberOfLines={2} style={styles.showTitle}>
          {episode.title}
        </Text>
        <Text numberOfLines={1} style={styles.showSubtitle}>
          {episode.showTitle}
        </Text>
        <View style={styles.metaRow}>
          {durationLabel ? <Text style={styles.metaText}>{durationLabel}</Text> : null}
          {dateLabel ? <Text style={styles.metaText}>{dateLabel}</Text> : null}
          {episode.isExplicit ? <Text style={styles.explicitBadge}>EXPLICIT</Text> : null}
          {!hasAudio ? (
            <Text style={styles.unavailableText}>
              {unavailableLabel || "Episode unavailable"}
            </Text>
          ) : (
            <Text style={styles.typeBadge}>Podcast</Text>
          )}
        </View>
      </View>
      <View style={[styles.playCircle, isDisabled && styles.playCircleDisabled]}>
        <Ionicons name="play" size={14} color={COLORS.text} />
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
  episodeDisabled: {
    opacity: 0.45,
  },
  episodeArt: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
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
