import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useScrollToTop } from "@react-navigation/native";
import { router } from "expo-router";

import { COLORS, GRADIENTS } from "../../constants/theme";
import { usePlayer } from "../../context/PlayerContext";

import MediaCard from "../../components/MediaCard";
import NeonEQ from "../../components/NeonEQ";

import { clearSmartQueue } from "../../services/smartQueue";
import { getArtworkValue } from "../../utils/artwork";

function getArtist(item: any) {
  return item?.artist || item?.user?.name || item?.channelTitle || "Unknown Artist";
}

function getImage(item: any) {
  return getArtworkValue(item);
}

const QueueItem = memo(function QueueItem({
  item,
  active,
  isPlaying,
  onPlay,
}: {
  item: any;
  active: boolean;
  isPlaying: boolean;
  onPlay: (item: any) => void;
}) {
  const subtitle = useMemo(
    () => `${getArtist(item)} • ${item.sourceName || "Hidden Tunes"}`,
    [item]
  );

  const handlePress = useCallback(() => {
    onPlay(item);
  }, [item, onPlay]);

  return (
    <View style={[styles.trackShell, active && styles.trackShellActive]}>
      <MediaCard
        title={item.title || "Unknown Song"}
        subtitle={subtitle}
        image={getImage(item)}
        type={item.queueType === "radio" ? "radio" : "song"}
        size="medium"
        showPlayButton={false}
        onPress={handlePress}
      />

      <View style={styles.trackAction}>
        {active && isPlaying ? (
          <View style={styles.eqBox}>
            <NeonEQ isPlaying={isPlaying} size="small" />
          </View>
        ) : (
          <TouchableOpacity activeOpacity={0.85} style={styles.playButton} onPress={handlePress}>
            <Ionicons name="play" size={18} color="#000" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

export default function QueueScreen() {
  const {
    currentSong,
    isPlaying,
    playSong,
    playAudiusTrack,
    activeQueue,
    activeQueueIndex,
    activeQueueMode,
    radioMode,
    nextSong,
    previousSong,
    stopPlayback,
    clearActiveQueue,
    smartAutoplayEnabled,
    toggleSmartAutoplay,
  } = usePlayer() as any;

  const listRef = useRef<FlatList<any>>(null);
  const [clearingSmart, setClearingSmart] = useState(false);

  useScrollToTop(listRef);

  const queue = useMemo(() => {
    if (!activeQueue?.length) return [];

    return activeQueue.map((track: any, index: number) => ({
      ...track,
      queueIndex: index,
      queueType: activeQueueMode || "standard",
    }));
  }, [activeQueue, activeQueueMode]);

  const nowPlaying = useMemo(() => {
    return (
      currentSong ||
      (queue.length > 0 && activeQueueIndex >= 0 ? queue[activeQueueIndex] : null)
    );
  }, [currentSong, queue, activeQueueIndex]);

  const upNext = useMemo(() => {
    return queue.filter((item: any, index: number) => {
      if (!nowPlaying) return true;
      if (item.id === nowPlaying.id) return false;
      return index > activeQueueIndex;
    });
  }, [queue, nowPlaying, activeQueueIndex]);

  const queueModeLabel = useMemo(() => {
    if (activeQueueMode === "smart") return "Smart autoplay is extending your queue";
    if (activeQueueMode === "radio") return "Personal radio is running";
    if (activeQueueMode === "youtube") return "Hidden Tunes TV queue is ready";
    if (queue.length > 0) return "Persistent queue is ready";
    return "Your next tracks";
  }, [activeQueueMode, queue.length]);

  const modeShort = useMemo(() => {
    if (activeQueueMode === "smart") return "AI";
    if (activeQueueMode === "youtube") return "YT";
    if (activeQueueMode === "radio") return "FM";
    return "HQ";
  }, [activeQueueMode]);

  const playQueueItem = useCallback(
    async (item: any) => {
      const index = typeof item.queueIndex === "number" ? item.queueIndex : 0;
      const artist = getArtist(item);
      const image = getImage(item);

      const normalized = {
        ...item,
        artist,
        user: item.user || { name: artist },
        cover: image,
        thumbnail: item.thumbnail || image,
        artwork: item.artwork || image,
        sourceName: item.sourceName || "Hidden Tunes",
        isOnline: item.isOnline ?? true,
      };

      if (
        queue.length > 0 &&
        (activeQueueMode === "standard" || activeQueueMode === "smart")
      ) {
        await playSong(normalized, queue, index);
        return;
      }

      if (normalized.type === "youtube" || normalized.sourceName === "YouTube") {
        await playAudiusTrack(normalized);
        return;
      }

      await playSong(normalized, queue, index);
    },
    [queue, activeQueueMode, playSong, playAudiusTrack]
  );

  const handleClearQueue = useCallback(() => {
    Alert.alert("Clear Queue", "Remove all tracks from your current queue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: clearActiveQueue,
      },
    ]);
  }, [clearActiveQueue]);

  const handleClearSmartMemory = useCallback(() => {
    Alert.alert(
      "Clear Smart Memory",
      "This clears the saved smart autoplay memory. Your playlists and current queue will not be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              setClearingSmart(true);
              await clearSmartQueue();
            } catch (error) {
              console.log("Clear smart queue memory error:", error);
            } finally {
              setClearingSmart(false);
            }
          },
        },
      ]
    );
  }, []);

  const renderQueueItem = useCallback(
    ({ item }: { item: any }) => (
      <QueueItem
        item={item}
        active={currentSong?.id === item.id}
        isPlaying={isPlaying}
        onPlay={playQueueItem}
      />
    ),
    [currentSong?.id, isPlaying, playQueueItem]
  );

  const keyExtractor = useCallback((item: any, index: number) => {
    return item.id
      ? `queue-${item.queueType}-${item.id}-${index}`
      : `queue-${index}`;
  }, []);

  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.smartPanel}>
          <View style={styles.smartPanelIcon}>
            <Ionicons
              name="infinite"
              size={24}
              color={smartAutoplayEnabled ? COLORS.primary : COLORS.textMuted}
            />
          </View>

          <View style={styles.smartPanelInfo}>
            <Text style={styles.smartPanelTitle}>
              Smart Autoplay {smartAutoplayEnabled ? "On" : "Off"}
            </Text>

            <Text style={styles.smartPanelSubtitle}>
              {smartAutoplayEnabled
                ? "When the queue ends, Hidden Tunes adds related songs."
                : "Playback stops when the queue reaches the end."}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.smartSwitch, smartAutoplayEnabled && styles.smartSwitchActive]}
            onPress={toggleSmartAutoplay}
          >
            <Text
              style={[
                styles.smartSwitchText,
                smartAutoplayEnabled && styles.smartSwitchTextActive,
              ]}
            >
              {smartAutoplayEnabled ? "ON" : "OFF"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.smartActionsRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.smartActionButton}
            onPress={handleClearSmartMemory}
            disabled={clearingSmart}
          >
            <Ionicons name="sparkles-outline" size={17} color={COLORS.text} />
            <Text style={styles.smartActionText}>
              {clearingSmart ? "Clearing..." : "Clear Smart Memory"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.smartActionButton}
            onPress={() => router.push("/player" as any)}
          >
            <Ionicons name="disc-outline" size={17} color={COLORS.text} />
            <Text style={styles.smartActionText}>Open Player</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.queueStats}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{queue.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{upNext.length}</Text>
            <Text style={styles.statLabel}>Up Next</Text>
          </View>

          <View style={[styles.statCard, activeQueueMode === "smart" && styles.smartStatCard]}>
            <Text style={styles.statNumber}>{modeShort}</Text>
            <Text style={styles.statLabel}>Mode</Text>
          </View>
        </View>

        <View style={styles.nowPlayingSection}>
          <Text style={styles.sectionLabel}>Now Playing</Text>

          {nowPlaying ? (
            <View style={styles.nowPlayingCard}>
              <MediaCard
                title={nowPlaying.title || "Unknown Song"}
                subtitle={`${getArtist(nowPlaying)} • ${
                  nowPlaying.sourceName || "Hidden Tunes"
                }`}
                image={getImage(nowPlaying)}
                type={radioMode ? "radio" : "song"}
                size="medium"
                showPlayButton={false}
                onPress={() => playQueueItem(nowPlaying)}
              />

              <View style={styles.nowActions}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.controlButton}
                  onPress={previousSong}
                >
                  <Ionicons name="play-skip-back" size={19} color={COLORS.text} />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.mainControlButton}
                  onPress={nextSong}
                >
                  <Ionicons name="play-skip-forward" size={20} color="#000" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.controlButton}
                  onPress={stopPlayback}
                >
                  <Ionicons name="stop" size={18} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.emptyNowCard}>
              <Ionicons name="musical-notes-outline" size={42} color={COLORS.textMuted} />
              <Text style={styles.emptyNowText}>Nothing playing yet</Text>
            </View>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Up Next</Text>
          <Text style={styles.sectionSub}>
            {upNext.length > 0 ? `${upNext.length} tracks waiting` : "No upcoming tracks"}
          </Text>
        </View>
      </>
    ),
    [
      smartAutoplayEnabled,
      toggleSmartAutoplay,
      handleClearSmartMemory,
      clearingSmart,
      queue.length,
      upNext.length,
      activeQueueMode,
      modeShort,
      nowPlaying,
      radioMode,
      playQueueItem,
      previousSong,
      nextSong,
      stopPlayback,
    ]
  );

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.title}>Queue</Text>
          <Text style={styles.subtitle}>{queueModeLabel}</Text>
        </View>

        {queue.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.clearButton}
            onPress={handleClearQueue}
          >
            <Ionicons name="trash-outline" size={19} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={upNext}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="albums-outline" size={56} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Queue is empty</Text>
            <Text style={styles.emptyText}>
              Search a song, start radio, or play a playlist to build your queue.
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.searchMusicButton}
              onPress={() => router.push("/search")}
            >
              <Ionicons name="search" size={18} color="#000" />
              <Text style={styles.searchMusicText}>Find Music</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={renderQueueItem}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },

  glowPurple: {
    position: "absolute",
    top: 20,
    left: -120,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(168,85,247,0.18)",
  },

  glowCyan: {
    position: "absolute",
    top: 270,
    right: -140,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(34,211,238,0.1)",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },

  headerText: {
    flex: 1,
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  clearButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  title: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -0.6,
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 4,
    fontWeight: "700",
  },

  listContent: {
    paddingBottom: 180,
  },

  smartPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 26,
    padding: 15,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  smartPanelIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  smartPanelInfo: {
    flex: 1,
  },

  smartPanelTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  smartPanelSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  smartSwitch: {
    minWidth: 54,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },

  smartSwitchActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  smartSwitchText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "900",
  },

  smartSwitchTextActive: {
    color: "#000",
  },

  smartActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },

  smartActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  smartActionText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },

  queueStats: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 22,
  },

  statCard: {
    flex: 1,
    minHeight: 74,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },

  smartStatCard: {
    backgroundColor: "rgba(168,85,247,0.14)",
    borderColor: "rgba(168,85,247,0.26)",
  },

  statNumber: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },

  statLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },

  nowPlayingSection: {
    marginBottom: 22,
  },

  sectionLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  nowPlayingCard: {
    position: "relative",
  },

  nowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: -4,
    marginBottom: 10,
    justifyContent: "center",
  },

  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  mainControlButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyNowCard: {
    minHeight: 118,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyNowText: {
    color: COLORS.textMuted,
    marginTop: 10,
    fontWeight: "800",
  },

  sectionHeader: {
    marginBottom: 14,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },

  sectionSub: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5,
  },

  trackShell: {
    position: "relative",
  },

  trackShellActive: {
    borderRadius: 28,
    backgroundColor: "rgba(168,85,247,0.12)",
  },

  trackAction: {
    position: "absolute",
    right: 16,
    top: 27,
  },

  playButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  eqBox: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyBox: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 18,
  },

  emptyText: {
    color: COLORS.textMuted,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },

  searchMusicButton: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 999,
  },

  searchMusicText: {
    color: "#000",
    fontWeight: "900",
  },
});
