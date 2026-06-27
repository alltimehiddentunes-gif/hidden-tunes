import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { COLORS } from "../../constants/theme";
import {
  formatPodcastEpisodeDuration,
  type HiddenTunesPodcastEpisode,
} from "../../services/podcastCatalogApi";
import { podcastDiscoveryDisplayName } from "../../utils/openHiddenTunesPodcast";

type PodcastShowEpisodeCardProps = {
  episode: HiddenTunesPodcastEpisode;
  podcastTitle: string;
  played?: boolean;
  onPress: () => void;
  onPlayPress: () => void;
};

function formatPublishedDate(value?: string) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isEpisodeExplicit(episode: HiddenTunesPodcastEpisode) {
  const haystack = `${episode.title} ${episode.description || ""}`.toLowerCase();
  return /\bexplicit\b/.test(haystack) || /\[e\]/.test(episode.title || "");
}

export const PodcastShowEpisodeCard = memo(function PodcastShowEpisodeCard({
  episode,
  podcastTitle,
  played = false,
  onPress,
  onPlayPress,
}: PodcastShowEpisodeCardProps) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  const duration = formatPodcastEpisodeDuration(episode.duration_seconds);
  const published = formatPublishedDate(episode.published_at);
  const explicit = isEpisodeExplicit(episode);

  return (
    <Animated.View style={{ opacity: fade }}>
      <TouchableOpacity
        activeOpacity={0.88}
        style={styles.card}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Play episode ${podcastDiscoveryDisplayName(episode.title)}`}
      >
        {episode.artwork_url ? (
          <Image
            source={{ uri: episode.artwork_url }}
            style={styles.artwork}
            contentFit="cover"
            transition={120}
            recyclingKey={episode.id}
          />
        ) : (
          <View style={styles.artworkFallback}>
            <Ionicons name="mic-outline" size={18} color={COLORS.textMuted} />
          </View>
        )}

        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text numberOfLines={2} style={styles.episodeTitle}>
              {podcastDiscoveryDisplayName(episode.title)}
            </Text>
            {played ? (
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={COLORS.primary}
                accessibilityLabel="Played"
              />
            ) : null}
          </View>

          <Text numberOfLines={1} style={styles.podcastTitle}>
            {podcastDiscoveryDisplayName(podcastTitle)}
          </Text>

          <View style={styles.metaRow}>
            {duration ? <Text style={styles.meta}>{duration}</Text> : null}
            {duration && published ? <Text style={styles.metaDot}>·</Text> : null}
            {published ? <Text style={styles.meta}>{published}</Text> : null}
            {explicit ? (
              <View style={styles.explicitBadge}>
                <Text style={styles.explicitText}>E</Text>
              </View>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={styles.playButton}
          onPress={onPlayPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Play ${podcastDiscoveryDisplayName(episode.title)}`}
        >
          <Ionicons name="play" size={16} color="#000" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  artworkFallback: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  episodeTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  podcastTitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  meta: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  metaDot: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  explicitBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  explicitText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
});
