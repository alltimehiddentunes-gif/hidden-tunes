import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { safeRouterBack } from "../utils/safeNavigation";

import AppShell from "../components/navigation/AppShell";
import AddToPlaylistButton from "../components/AddToPlaylistButton";
import HTImage from "../components/HTImage";
import NeonEQ from "../components/NeonEQ";
import { COLORS, GRADIENTS } from "../constants/theme";
import PremiumEmptyState from "../components/PremiumEmptyState";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerState,
} from "../context/PlayerContext";
import { FALLBACK_ARTWORK, getArtworkUri } from "../utils/artwork";
import {
  logPerformanceSummary,
  logScreenReady,
  logTapToPlay,
  startPerformanceTimer,
} from "../utils/performanceLogs";
import {
  getListPerformanceSettings,
  markFastScrolling,
} from "../utils/performanceMode";

function getArtist(item: any) {
  return item?.artist || item?.user?.name || item?.channelTitle || "Hidden Tunes";
}

function normalizeRecentTrack(item: any) {
  const artwork = getArtworkUri(item, FALLBACK_ARTWORK);
  const artist = String(getArtist(item));
  const streamUrl = String(
    item?.streamUrl ||
      item?.url ||
      item?.audioUrl ||
      item?.audio_url ||
      item?.previewUrl ||
      ""
  );

  return {
    ...item,
    id: String(item?.id || `${item?.title || "track"}-${artist}`),
    title: String(item?.title || "Unknown Song"),
    artist,
    user: item?.user || { name: artist },
    artwork,
    cover: artwork,
    thumbnail: item?.thumbnail || artwork,
    url: String(item?.url || streamUrl),
    streamUrl,
    sourceName: item?.sourceName || "Hidden Tunes",
    type: item?.type || "r2",
    isOnline: item?.isOnline ?? true,
  };
}

function dedupePlayableTracks(items: any[]) {
  const seen = new Set<string>();

  return items
    .map(normalizeRecentTrack)
    .filter((item) => {
      const key = String(item.id || item.streamUrl || item.url).toLowerCase();
      if (!key || seen.has(key)) return false;

      seen.add(key);
      return Boolean(item.streamUrl || item.url);
    });
}

const RecentRow = memo(function RecentRow({
  item,
  active,
  isPlaying,
  onPress,
}: {
  item: any;
  active: boolean;
  isPlaying: boolean;
  onPress: (item: any) => void;
}) {
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.trackCard, active && styles.trackCardActive]}
      onPress={handlePress}
    >
      <HTImage source={item} style={styles.cover} />

      <View style={styles.trackInfo}>
        <Text numberOfLines={1} style={styles.trackTitle}>
          {item.title}
        </Text>

        <Text numberOfLines={1} style={styles.trackArtist}>
          {item.artist}
        </Text>

        <View style={styles.metaRow}>
          <Ionicons name="time" size={13} color={COLORS.primary} />
          <Text style={styles.metaText}>
            {item.sourceName || "Hidden Tunes"}
          </Text>
        </View>
      </View>

      <AddToPlaylistButton track={item as any} />

      <View style={styles.playCircle}>
        {active ? (
          <NeonEQ isPlaying={isPlaying} size="small" />
        ) : (
          <Ionicons name="play" size={18} color="#000" />
        )}
      </View>
    </TouchableOpacity>
  );
});

function RecentlyPlayedScreen() {
  const { playSong } = usePlayerActions();
  const { recentlyPlayed } = usePlayerState();
  const { currentSong, isPlaying } = usePlayerNowPlaying();
  const screenStartedAt = useRef(startPerformanceTimer()).current;

  const tracks = useMemo(() => {
    return dedupePlayableTracks(Array.isArray(recentlyPlayed) ? recentlyPlayed : []);
  }, [recentlyPlayed]);
  const listPerformance = useMemo(
    () => getListPerformanceSettings(tracks.length),
    [tracks.length]
  );

  useEffect(() => {
    logScreenReady("recently_played", screenStartedAt, {
      count: tracks.length,
    });
    logPerformanceSummary("recently_played", {
      cache: "memory",
      firstContentMs: Date.now() - screenStartedAt,
      itemCount: tracks.length,
      emptyStateReason: tracks.length
        ? "content_available"
        : "no_recently_played_tracks",
    });
  }, [screenStartedAt, tracks.length]);

  const playRecentTrack = useCallback(
    (item: any) => {
      const tapStartedAt = startPerformanceTimer();
      const normalized = normalizeRecentTrack(item);
      const queue = tracks.length > 0
        ? tracks
        : dedupePlayableTracks([normalized]);

      const startIndex = Math.max(
        0,
        queue.findIndex((track) => track.id === normalized.id)
      );

      void playSong(normalized as any, queue as any, startIndex, {
        source: "home_rail",
        label: "Recently Played",
        railId: "recently_played",
        artistName: normalized.artist,
        genre: normalized.genre,
        mood: normalized.mood,
      })
        .finally(() => {
          logTapToPlay("recently_played", tapStartedAt, { id: normalized.id });
        })
        .catch((error: unknown) => {
          if (__DEV__) console.log("Recently played tap error:", error);
        });

      requestAnimationFrame(() => {
        router.push("/music-feed" as any);
      });
    },
    [playSong, tracks]
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <RecentRow
        item={item}
        active={String(currentSong?.id || "") === String(item.id)}
        isPlaying={isPlaying}
        onPress={playRecentTrack}
      />
    ),
    [currentSong?.id, isPlaying, playRecentTrack]
  );

  const keyExtractor = useCallback((item: any, index: number) => {
    return `recent-${item.id || item.streamUrl || index}`;
  }, []);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View pointerEvents="none" style={styles.glowPurple} />
      <View pointerEvents="none" style={styles.glowCyan} />

      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.iconButton}
          onPress={() => safeRouterBack("/library")}
        >
          <Ionicons name="chevron-back" size={25} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.title}>Recently Played</Text>
          <Text style={styles.subtitle}>Your latest Hidden Tunes sessions</Text>
        </View>
      </View>

      <FlatList
        data={tracks}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        initialNumToRender={listPerformance.initialNumToRender}
        maxToRenderPerBatch={listPerformance.maxToRenderPerBatch}
        windowSize={listPerformance.windowSize}
        updateCellsBatchingPeriod={listPerformance.updateCellsBatchingPeriod}
        removeClippedSubviews
        onScrollBeginDrag={() => markFastScrolling(true)}
        onMomentumScrollBegin={() => markFastScrolling(true)}
        onMomentumScrollEnd={() => markFastScrolling(false)}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <PremiumEmptyState
              icon="time-outline"
              title="Your listening trail starts here"
              message="Play a few tracks and this screen becomes a fast, artwork-rich path back into recent sessions."
              actionLabel="Explore Music"
              onAction={() => router.push("/music-feed" as any)}
            />
          </View>
        }
      />
      </LinearGradient>
    </AppShell>
  );
}

export default memo(RecentlyPlayedScreen);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 58,
  },

  glowPurple: {
    position: "absolute",
    top: 34,
    left: -120,
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: "rgba(168,85,247,0.2)",
  },

  glowCyan: {
    position: "absolute",
    top: 300,
    right: -150,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(34,211,238,0.11)",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 22,
  },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.075)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginRight: 13,
  },

  headerText: {
    flex: 1,
  },

  title: {
    color: COLORS.text,
    fontSize: 31,
    fontWeight: "900",
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },

  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 155,
  },

  trackCard: {
    minHeight: 94,
    borderRadius: 27,
    padding: 13,
    marginBottom: 13,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },

  trackCardActive: {
    backgroundColor: "rgba(168,85,247,0.14)",
    borderColor: "rgba(168,85,247,0.34)",
  },

  cover: {
    width: 68,
    height: 68,
    borderRadius: 19,
    backgroundColor: COLORS.card,
  },

  trackInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },

  trackTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  trackArtist: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 5,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
  },

  metaText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 5,
  },

  playCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  emptyBox: {
    minHeight: 430,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 17,
  },

  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },

  exploreButton: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 999,
  },

  exploreButtonText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "900",
  },
});
