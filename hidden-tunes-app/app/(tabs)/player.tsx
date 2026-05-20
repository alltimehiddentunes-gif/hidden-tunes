import React, { memo, useCallback, useEffect, useMemo, useState } from "react";

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { COLORS, GRADIENTS } from "../../constants/theme";
import {
  usePlayerActions,
  usePlayerProgress,
  usePlayerState,
} from "../../context/PlayerContext";
import { getHiddenTunesLyrics } from "../../services/hiddenTunesApi";

import LiveWaveform from "../../components/LiveWaveform";
import AddToPlaylistModal from "../../components/AddToPlaylistModal";
import HTImage from "../../components/HTImage";
import { FALLBACK_ARTWORK, getArtworkValue } from "../../utils/artwork";

function formatTime(ms: number) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

const PremiumIconButton = memo(function PremiumIconButton({ children, onPress }: any) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    scale.value = withSequence(withSpring(0.9), withSpring(1));
    onPress?.();
  }, [onPress, scale]);

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={styles.iconButton}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function PlayerScreen() {
  const {
    currentSong,
    isPlaying,
    isLoading,
    volume,
    isMuted,
    shuffle,
    repeatMode,
    smartAutoplayEnabled,
    radioMode,
    youtubeQueue,
    radioQueue,
    activeQueueMode,
    activeQueue,
    activeQueueIndex,
  } = usePlayerState();
  const { positionMillis, durationMillis, position, duration } =
    usePlayerProgress();
  const {
    togglePlayPause,
    seekTo,
    nextSong,
    previousSong,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeatMode,
    toggleSmartAutoplay,
    toggleFavorite,
    isFavorite,
  } = usePlayerActions();

  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
  const [selectedPlaylistTrack, setSelectedPlaylistTrack] = useState<any>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  const rotate = useSharedValue(0);
  const pulse = useSharedValue(1);

  const playbackPosition = positionMillis ?? position ?? 0;
  const playbackDuration = durationMillis ?? duration ?? 1;

  const favoriteActive = useMemo(() => {
    return isFavorite?.(currentSong);
  }, [isFavorite, currentSong]);

  const queueLabel = useMemo(() => {
    if (activeQueueMode === "smart") return "SMART AUTOPLAY";
    if (radioMode && radioQueue?.length) return "RADIO MODE";
    if (youtubeQueue?.length) return `${youtubeQueue.length} IN QUEUE`;
    if (activeQueue?.length) return `${activeQueue.length} TRACK SESSION`;
    return "NOW PLAYING";
  }, [
    activeQueue?.length,
    activeQueueMode,
    radioMode,
    radioQueue?.length,
    youtubeQueue?.length,
  ]);

  const artist = useMemo(() => {
    if (!currentSong) return "Hidden Tunes";

    return (
      currentSong.artist ||
      currentSong.user?.name ||
      currentSong.channelTitle ||
      currentSong.sourceName ||
      "Hidden Tunes"
    );
  }, [currentSong]);

  const artworkSource = useMemo(() => {
    if (!currentSong) return null;
    return getArtworkValue(currentSong);
  }, [currentSong]);

  const listeningContext = useMemo(() => {
    if (!currentSong) return [];

    return [
      currentSong.album,
      currentSong.mood,
      currentSong.genre,
      currentSong.sourceName,
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 3);
  }, [currentSong]);

  const nextUpSong = useMemo(() => {
    if (!Array.isArray(activeQueue) || activeQueue.length === 0) return null;

    const nextIndex =
      typeof activeQueueIndex === "number" ? activeQueueIndex + 1 : 1;

    return activeQueue[nextIndex] || null;
  }, [activeQueue, activeQueueIndex]);

  const sessionFlowText = useMemo(() => {
    if (nextUpSong?.title) {
      return `Next: ${nextUpSong.title}`;
    }

    if (smartAutoplayEnabled) {
      return "Smart continuation can extend the session.";
    }

    if (activeQueue?.length) {
      return "You are near the end of this queue.";
    }

    return "Start from discovery to build a longer session.";
  }, [activeQueue?.length, nextUpSong?.title, smartAutoplayEnabled]);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimation(rotate);
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 220 });
      return;
    }

    rotate.value = withRepeat(
      withTiming(360, {
        duration: 42000,
      }),
      -1,
      false
    );

    pulse.value = withRepeat(
      withSequence(
        withTiming(1.012, { duration: 2400 }),
        withTiming(1, { duration: 2400 })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(rotate);
      cancelAnimation(pulse);
    };
  }, [isPlaying, rotate, pulse]);

  const artworkAnimated = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: isPlaying ? `${rotate.value}deg` : "0deg",
      },
      {
        scale: isPlaying ? pulse.value : 1,
      },
    ],
  }));

  const openPlaylistModal = useCallback(() => {
    setSelectedPlaylistTrack(currentSong);
    setPlaylistModalVisible(true);
  }, [currentSong]);

  const closePlaylistModal = useCallback(() => {
    setPlaylistModalVisible(false);
  }, []);

  const handleFavorite = useCallback(() => {
    if (!currentSong) return;
    toggleFavorite(currentSong);
  }, [toggleFavorite, currentSong]);

  const openLyrics = useCallback(async () => {
    if (!currentSong || lyricsLoading) return;

    try {
      setLyricsLoading(true);

      const songId = String(currentSong.id || "");
      const cloudLyrics = songId ? await getHiddenTunesLyrics(songId) : null;

      const syncedLyrics =
        cloudLyrics?.syncedLrc ||
        currentSong.syncedLyrics ||
        currentSong.synced_lyrics ||
        currentSong.lrc ||
        "";

      const plainLyrics = cloudLyrics?.plainLyrics || currentSong.lyrics || "";

      router.push({
        pathname: "/lyrics",
        params: {
          title: currentSong.title || "Unknown Song",
          artist,
          syncedLyrics,
          lyrics: plainLyrics || syncedLyrics || "No lyrics available.",
        },
      });
    } catch {
      router.push({
        pathname: "/lyrics",
        params: {
          title: currentSong.title || "Unknown Song",
          artist,
          lyrics: currentSong.lyrics || "No lyrics available.",
        },
      });
    } finally {
      setLyricsLoading(false);
    }
  }, [currentSong, artist, lyricsLoading]);

  if (!currentSong) {
    return (
      <LinearGradient colors={GRADIENTS.main} style={styles.emptyContainer}>
        <View style={styles.glowPurple} />

        <View style={styles.emptyIcon}>
          <Ionicons name="musical-notes-outline" size={64} color={COLORS.primary} />
        </View>

        <Text style={styles.emptyText}>Ready when you are</Text>

        <Text style={styles.emptySubText}>
          Start from Search or Explore and Hidden Tunes will keep the session close.
        </Text>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.emptyButton}
          onPress={() => router.push("/search")}
        >
          <Ionicons name="search" size={18} color="#000" />
          <Text style={styles.emptyButtonText}>Start Listening</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      >
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.topButton}>
            <Ionicons name="chevron-down" size={26} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.topCenter}>
            <Text style={styles.playingLabel}>{queueLabel}</Text>

            <Text numberOfLines={1} style={styles.artistTop}>
              {artist}
            </Text>
          </View>

          <TouchableOpacity style={styles.topButton} onPress={openPlaylistModal}>
            <Ionicons name="add-circle-outline" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.artworkGlow}>
          <LinearGradient colors={GRADIENTS.neon} style={styles.artworkBorder}>
            <Animated.View style={[styles.artworkWrapper, artworkAnimated]}>
              {artworkSource ? (
                <HTImage
                  source={artworkSource}
                  style={styles.artwork}
                  contentFit="cover"
                />
              ) : (
                <HTImage
                  source={FALLBACK_ARTWORK}
                  style={styles.artworkFallback}
                  contentFit="cover"
                />
              )}
            </Animated.View>
          </LinearGradient>
        </View>

        <View style={styles.songInfo}>
          <View style={styles.songTextWrap}>
            <Text numberOfLines={1} style={styles.songTitle}>
              {currentSong.title}
            </Text>

            <Text numberOfLines={1} style={styles.artistName}>
              {artist}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.favoriteButton, favoriteActive && styles.favoriteActive]}
            onPress={handleFavorite}
          >
            <Ionicons
              name={favoriteActive ? "heart" : "heart-outline"}
              size={26}
              color={favoriteActive ? COLORS.primary : COLORS.text}
            />
          </TouchableOpacity>
        </View>

        {listeningContext.length > 0 && (
          <View style={styles.contextPillRow}>
            {listeningContext.map((item) => (
              <View key={`context-${item}`} style={styles.contextPill}>
                <Text numberOfLines={1} style={styles.contextPillText}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.statusRow}>
          <View style={styles.statusPill}>
            <Ionicons
              name={isLoading ? "sync" : isPlaying ? "pulse" : "pause-circle"}
              size={15}
              color={COLORS.primary}
            />

            <Text style={styles.statusText}>
              {isLoading
                ? "Loading"
                : isPlaying
                ? "Playing"
                : "Paused"}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.smartToggle, smartAutoplayEnabled && styles.smartToggleActive]}
            onPress={toggleSmartAutoplay}
          >
            <Ionicons
              name={smartAutoplayEnabled ? "infinite" : "infinite-outline"}
              size={16}
              color={smartAutoplayEnabled ? "#000" : COLORS.textMuted}
            />

            <Text
              style={[
                styles.smartToggleText,
                smartAutoplayEnabled && styles.smartToggleTextActive,
              ]}
            >
              Smart {smartAutoplayEnabled ? "On" : "Off"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.smartInfoCard}>
          <View style={styles.smartInfoIcon}>
            <Ionicons
              name={nextUpSong ? "play-skip-forward" : "sparkles"}
              size={18}
              color={smartAutoplayEnabled ? COLORS.primary : COLORS.textMuted}
            />
          </View>

          <View style={styles.smartInfoTextWrap}>
            <Text style={styles.smartInfoTitle}>
              {nextUpSong ? "Up Next" : `Smart Autoplay ${smartAutoplayEnabled ? "On" : "Off"}`}
            </Text>

            <Text numberOfLines={2} style={styles.smartInfoSubtitle}>
              {sessionFlowText}
            </Text>
          </View>
        </View>

        <View style={styles.waveformContainer}>
          <LiveWaveform isPlaying={isPlaying} />
        </View>

        <View style={styles.sliderContainer}>
          <Slider
            style={styles.mainSlider}
            minimumValue={0}
            maximumValue={playbackDuration || 1}
            value={playbackPosition}
            minimumTrackTintColor={COLORS.primary}
            maximumTrackTintColor="#ffffff20"
            thumbTintColor={COLORS.primary}
            onSlidingComplete={seekTo}
          />

          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(playbackPosition)}</Text>
            <Text style={styles.timeText}>{formatTime(playbackDuration)}</Text>
          </View>
        </View>

        <View style={styles.controlsRow}>
          <PremiumIconButton onPress={toggleShuffle}>
            <Ionicons
              name="shuffle"
              size={24}
              color={shuffle ? COLORS.primary : COLORS.textMuted}
            />
          </PremiumIconButton>

          <PremiumIconButton onPress={previousSong}>
            <Ionicons name="play-skip-back" size={34} color={COLORS.text} />
          </PremiumIconButton>

          <Pressable onPress={togglePlayPause} style={styles.playButton}>
            <Ionicons
              name={isLoading ? "sync" : isPlaying ? "pause" : "play"}
              size={38}
              color="#000"
            />
          </Pressable>

          <PremiumIconButton onPress={nextSong}>
            <Ionicons name="play-skip-forward" size={34} color={COLORS.text} />
          </PremiumIconButton>

          <PremiumIconButton onPress={toggleRepeatMode}>
            <Ionicons
              name={repeatMode === "one" ? "repeat-outline" : "repeat"}
              size={24}
              color={repeatMode !== "off" ? COLORS.primary : COLORS.textMuted}
            />
          </PremiumIconButton>
        </View>

        <View style={styles.extraActions}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.extraAction}
            onPress={() => router.push("/queue")}
          >
            <Ionicons name="list" size={19} color={COLORS.text} />
            <Text style={styles.extraActionText}>Queue</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.85} style={styles.extraAction} onPress={openLyrics}>
            <Ionicons
              name={lyricsLoading ? "sync" : "musical-notes"}
              size={20}
              color={COLORS.text}
            />

            <Text style={styles.extraActionText}>
              {lyricsLoading ? "Loading" : "Lyrics"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.extraAction}
            onPress={openPlaylistModal}
          >
            <Ionicons name="add" size={20} color={COLORS.text} />
            <Text style={styles.extraActionText}>Playlist</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.volumeSection}>
          <TouchableOpacity onPress={toggleMute} style={styles.volumeIcon}>
            <Ionicons
              name={isMuted ? "volume-mute" : "volume-high"}
              size={22}
              color={COLORS.text}
            />
          </TouchableOpacity>

          <Slider
            style={styles.volumeSlider}
            minimumValue={0}
            maximumValue={1}
            value={volume}
            minimumTrackTintColor={COLORS.primary}
            maximumTrackTintColor="#ffffff20"
            thumbTintColor={COLORS.primary}
            onSlidingComplete={setVolume}
          />
        </View>
      </ScrollView>

      <AddToPlaylistModal
        visible={playlistModalVisible}
        track={selectedPlaylistTrack}
        onClose={closePlaylistModal}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  glowPurple: {
    position: "absolute",
    top: 50,
    left: -120,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(168,85,247,0.18)",
  },

  glowCyan: {
    position: "absolute",
    top: 300,
    right: -130,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(34,211,238,0.1)",
  },

  content: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 190,
  },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  emptyIcon: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  emptyText: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 18,
  },

  emptySubText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8,
  },

  emptyButton: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 999,
  },

  emptyButtonText: {
    color: "#000",
    fontWeight: "900",
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  topButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  topCenter: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 14,
  },

  playingLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "900",
  },

  artistTop: {
    color: COLORS.text,
    marginTop: 4,
    fontWeight: "800",
    maxWidth: 210,
  },

  artworkGlow: {
    alignSelf: "center",
    marginTop: 28,
    shadowColor: "#A855F7",
    shadowOpacity: 0.26,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 6,
  },

  artworkBorder: {
    width: 294,
    height: 294,
    borderRadius: 147,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },

  artworkWrapper: {
    width: 288,
    height: 288,
    borderRadius: 144,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },

  artwork: {
    width: "100%",
    height: "100%",
  },

  artworkFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  songInfo: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  songTextWrap: {
    flex: 1,
  },

  songTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.6,
  },

  artistName: {
    color: COLORS.textMuted,
    marginTop: 6,
    fontSize: 15,
    fontWeight: "700",
  },

  favoriteButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
  },

  favoriteActive: {
    backgroundColor: "rgba(168,85,247,0.15)",
  },

  contextPillRow: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  contextPill: {
    maxWidth: "48%",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },

  contextPillText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
  },

  statusRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.075)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },

  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },

  smartToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.075)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  smartToggleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  smartToggleText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "900",
  },

  smartToggleTextActive: {
    color: "#000",
  },

  smartInfoCard: {
    marginTop: 14,
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  smartInfoIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
  },

  smartInfoTextWrap: {
    flex: 1,
  },

  smartInfoTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },

  smartInfoSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  waveformContainer: {
    marginTop: 20,
    marginBottom: 6,
  },

  sliderContainer: {
    marginTop: 12,
  },

  mainSlider: {
    width: "100%",
  },

  timeRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  timeText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },

  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 26,
  },

  iconButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
  },

  playButton: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.34,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 6,
  },

  extraActions: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },

  extraAction: {
    flex: 1,
    minHeight: 52,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  extraActionText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },

  volumeSection: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  volumeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
  },

  volumeSlider: {
    flex: 1,
  },
});
