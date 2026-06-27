import { memo, useCallback, useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { COLORS } from "../../constants/theme";
import type { HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import { podcastDiscoveryDisplayName } from "../../utils/openHiddenTunesPodcast";
import { PodcastReadMoreText } from "./PodcastReadMoreText";

type PodcastShowHeaderProps = {
  show: HiddenTunesPodcastShow;
  cleanedDescription: string;
  isFollowing: boolean;
  followBusy: boolean;
  latestPlayable: boolean;
  playLatestBusy: boolean;
  shuffleBusy: boolean;
  hasEpisodes: boolean;
  onToggleFollow: () => void;
  onPlayLatest: () => void;
  onShuffle: () => void;
};

export const PodcastShowHeader = memo(function PodcastShowHeader({
  show,
  cleanedDescription,
  isFollowing,
  followBusy,
  latestPlayable,
  playLatestBusy,
  shuffleBusy,
  hasEpisodes,
  onToggleFollow,
  onPlayLatest,
  onShuffle,
}: PodcastShowHeaderProps) {
  const artworkOpacity = useRef(new Animated.Value(0)).current;
  const followScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(artworkOpacity, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [artworkOpacity]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(followScale, {
        toValue: 0.94,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(followScale, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
  }, [followScale, isFollowing]);

  const publisher = show.host_name
    ? podcastDiscoveryDisplayName(show.host_name)
    : show.primary_category || "Hidden Tunes Podcasts";

  const pulseFollow = useCallback(() => {
    Animated.sequence([
      Animated.timing(followScale, {
        toValue: 0.92,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(followScale, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
  }, [followScale]);

  const handleFollowPress = useCallback(() => {
    pulseFollow();
    onToggleFollow();
  }, [onToggleFollow, pulseFollow]);

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.artworkWrap, { opacity: artworkOpacity }]}>
        {show.artwork_url ? (
          <Image
            source={{ uri: show.artwork_url }}
            style={styles.artwork}
            contentFit="cover"
            transition={180}
            recyclingKey={show.id}
            accessibilityLabel={`${podcastDiscoveryDisplayName(show.title)} artwork`}
          />
        ) : (
          <View style={styles.artworkFallback}>
            <Ionicons name="mic-outline" size={42} color={COLORS.primary} />
          </View>
        )}
      </Animated.View>

      <Text style={styles.kicker}>HIDDEN TUNES PODCASTS</Text>
      <Text style={styles.title} accessibilityRole="header">
        {podcastDiscoveryDisplayName(show.title)}
      </Text>
      <Text style={styles.publisher}>{publisher}</Text>

      <View style={styles.actionRow}>
        <Animated.View style={{ transform: [{ scale: followScale }] }}>
          <TouchableOpacity
            style={[styles.followButton, isFollowing && styles.followButtonActive]}
            onPress={handleFollowPress}
            activeOpacity={0.88}
            disabled={followBusy}
            accessibilityRole="button"
            accessibilityLabel={isFollowing ? "Unfollow show" : "Follow show"}
            accessibilityState={{ selected: isFollowing, busy: followBusy }}
          >
            <Ionicons
              name={isFollowing ? "checkmark" : "add"}
              size={16}
              color={isFollowing ? COLORS.primary : COLORS.text}
            />
            <Text
              style={[
                styles.followButtonText,
                isFollowing && styles.followButtonTextActive,
              ]}
            >
              {isFollowing ? "Following" : "Follow show"}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          style={[
            styles.playLatestButton,
            (!latestPlayable || playLatestBusy) && styles.buttonDisabled,
          ]}
          onPress={onPlayLatest}
          activeOpacity={0.88}
          disabled={!latestPlayable || playLatestBusy}
          accessibilityRole="button"
          accessibilityLabel="Play latest episode"
          accessibilityState={{
            disabled: !latestPlayable || playLatestBusy,
          }}
        >
          <Ionicons name="play" size={18} color="#000" />
          <Text style={styles.playLatestText}>Play Latest</Text>
        </TouchableOpacity>
      </View>

      {!latestPlayable && hasEpisodes ? (
        <Text style={styles.unavailableText} accessibilityRole="text">
          Latest episode unavailable
        </Text>
      ) : null}

      <TouchableOpacity
        style={[
          styles.shuffleButton,
          (!hasEpisodes || shuffleBusy) && styles.buttonDisabled,
        ]}
        onPress={onShuffle}
        activeOpacity={0.88}
        disabled={!hasEpisodes || shuffleBusy}
        accessibilityRole="button"
        accessibilityLabel="Shuffle episodes"
        accessibilityState={{ disabled: !hasEpisodes || shuffleBusy }}
      >
        <Ionicons name="shuffle" size={17} color={COLORS.text} />
        <Text style={styles.shuffleText}>Shuffle Episodes</Text>
      </TouchableOpacity>

      {cleanedDescription ? (
        <PodcastReadMoreText text={cleanedDescription} maxLines={4} />
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Latest Episodes</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  artworkWrap: {
    marginTop: 8,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  artwork: {
    width: 196,
    height: 196,
    borderRadius: 28,
  },
  artworkFallback: {
    width: 196,
    height: 196,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 32,
    paddingHorizontal: 8,
  },
  publisher: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 20,
    flexWrap: "wrap",
  },
  followButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  followButtonActive: {
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  followButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  followButtonTextActive: {
    color: COLORS.primary,
  },
  playLatestButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  playLatestText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "900",
  },
  shuffleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  shuffleText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  unavailableText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
  },
  sectionHeader: {
    width: "100%",
    marginTop: 24,
    marginBottom: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
});
