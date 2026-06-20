import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import Animated, {
  Easing,
  FadeInDown,
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

import LiveWaveform from "../../components/LiveWaveform";
import AddToPlaylistModal from "../../components/AddToPlaylistModal";
import HTImage from "../../components/HTImage";
import { FALLBACK_ARTWORK, getArtworkValue } from "../../utils/artwork";
import { getBestLyricsPayload, setLyricsMemoryCache } from "../../utils/lyrics";
import { openGenreCatalog, openMoodCatalog } from "../../utils/catalogNavigation";
import { normalizeGenreName } from "../../utils/genreNormalization";
import { isFastScrolling } from "../../utils/performanceMode";
import { useRenderCountProbe } from "../../utils/performanceVerification";
import { useRuntimeRenderProbe } from "../../utils/runtimeInstrumentation";

type PlayerMetadataType = "album" | "mood" | "genre";

type PlayerMetadataChip = {
  type: PlayerMetadataType;
  label: string;
};

const METADATA_PRESS_GUARD_MS = 500;
const SCREEN_WIDTH = Dimensions.get("window").width;
/** Premium round cover: ~72% of screen width, clamped for balance on all devices. */
const PLAYER_ART_SIZE = Math.round(
  Math.min(300, Math.max(260, SCREEN_WIDTH * 0.72))
);
/** Lets scroll content tuck under the cover edge while keeping the anchor visible. */
const PLAYER_ART_SCROLL_OVERLAP = Math.round(PLAYER_ART_SIZE * 0.14);

function formatTime(ms: number) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function fireLightHaptic() {
  if (isFastScrolling()) return;

  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

const AmbientGlow = memo(function AmbientGlow() {
  const purple = useSharedValue(0.16);
  const cyan = useSharedValue(0.1);

  useEffect(() => {
    purple.value = withRepeat(
      withSequence(
        withTiming(0.24, { duration: 3200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.14, { duration: 3200, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );

    cyan.value = withRepeat(
      withSequence(
        withTiming(0.16, { duration: 3800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.08, { duration: 3800, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(purple);
      cancelAnimation(cyan);
    };
  }, [purple, cyan]);

  const purpleStyle = useAnimatedStyle(() => ({
    opacity: purple.value,
  }));

  const cyanStyle = useAnimatedStyle(() => ({
    opacity: cyan.value,
  }));

  return (
    <>
      <Animated.View style={[styles.glowPurple, purpleStyle]} />
      <Animated.View style={[styles.glowCyan, cyanStyle]} />
    </>
  );
});

const PremiumIconButton = memo(function PremiumIconButton({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress?: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.9, { damping: 16, stiffness: 420 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 360 });
  }, [scale]);

  const handlePress = useCallback(() => {
    fireLightHaptic();
    scale.value = withSequence(withSpring(0.9), withSpring(1));
    onPress?.();
  }, [onPress, scale]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={styles.iconButton}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
});

const PremiumPlayButton = memo(function PremiumPlayButton({
  isPlaying,
  isLoading,
  onPress,
}: {
  isPlaying: boolean;
  isLoading: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.24);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimation(ringOpacity);
      ringOpacity.value = withTiming(0.22, { duration: 220 });
      return;
    }

    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0.46, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.18, { duration: 1400, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(ringOpacity);
    };
  }, [isPlaying, ringOpacity]);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.94, { damping: 16, stiffness: 420 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 360 });
  }, [scale]);

  const handlePress = useCallback(() => {
    fireLightHaptic();
    onPress();
  }, [onPress]);

  return (
    <View style={styles.playButtonWrap}>
      <Animated.View style={[styles.playButtonRing, ringStyle]} pointerEvents="none" />
      <Animated.View style={buttonStyle}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={handlePress}
          style={styles.playButton}
        >
          <Ionicons
            name={isLoading ? "sync" : isPlaying ? "pause" : "play"}
            size={38}
            color="#000"
          />
        </Pressable>
      </Animated.View>
    </View>
  );
});

const MetadataContextChip = memo(function MetadataContextChip({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.contextPill,
        pressed && styles.contextPillPressed,
      ]}
    >
      <Text numberOfLines={1} style={styles.contextPillText}>
        {label}
      </Text>
    </Pressable>
  );
});

const PlayerWaveform = memo(function PlayerWaveform({
  isPlaying,
}: {
  isPlaying: boolean;
}) {
  return (
    <View style={styles.waveformContainer}>
      <LiveWaveform isPlaying={isPlaying} />
    </View>
  );
});

const PlayerProgressSection = memo(function PlayerProgressSection({
  seekTo,
}: {
  seekTo: (value: number) => void | Promise<void>;
}) {
  const { positionMillis, durationMillis, position, duration } = usePlayerProgress();
  const playbackPosition = positionMillis ?? position ?? 0;
  const playbackDuration = durationMillis ?? duration ?? 1;

  return (
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
  );
});

export default function PlayerScreen() {
  useRenderCountProbe("PlayerScreen");
  useRuntimeRenderProbe("Player");

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
  const lastMetadataPressAtRef = useRef(0);

  const rotate = useSharedValue(0);
  const pulse = useSharedValue(1);
  const metadataOpacity = useSharedValue(1);
  const metadataTranslateY = useSharedValue(0);
  const artworkHalo = useSharedValue(0.28);

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
    if (!currentSong) return [] as PlayerMetadataChip[];

    const chips: PlayerMetadataChip[] = [];

    const album = String(currentSong.album || "").trim();
    if (album) {
      chips.push({ type: "album", label: album });
    }

    const mood = String(currentSong.mood || "").trim();
    if (mood) {
      chips.push({ type: "mood", label: mood });
    }

    const genre = normalizeGenreName(currentSong.genre);
    if (genre) {
      chips.push({ type: "genre", label: genre });
    }

    return chips.slice(0, 3);
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
    if (!currentSong?.id) return;

    metadataOpacity.value = 0.6;
    metadataTranslateY.value = 8;
    metadataOpacity.value = withTiming(1, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
    metadataTranslateY.value = withTiming(0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [currentSong?.id, metadataOpacity, metadataTranslateY]);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimation(rotate);
      cancelAnimation(pulse);
      cancelAnimation(artworkHalo);
      pulse.value = withTiming(1, { duration: 220 });
      artworkHalo.value = withTiming(0.26, { duration: 220 });
      return;
    }

    rotate.value = withRepeat(
      withTiming(360, {
        duration: 52000,
      }),
      -1,
      false
    );

    pulse.value = withRepeat(
      withSequence(
        withTiming(1.018, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );

    artworkHalo.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.24, { duration: 2200, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(rotate);
      cancelAnimation(pulse);
      cancelAnimation(artworkHalo);
    };
  }, [isPlaying, rotate, pulse, artworkHalo]);

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

  const artworkHaloStyle = useAnimatedStyle(() => ({
    opacity: artworkHalo.value,
  }));

  const metadataAnimated = useAnimatedStyle(() => ({
    opacity: metadataOpacity.value,
    transform: [{ translateY: metadataTranslateY.value }],
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

  const handleMetadataPress = useCallback(
    (type: PlayerMetadataType, value: string) => {
      const now = Date.now();
      if (now - lastMetadataPressAtRef.current < METADATA_PRESS_GUARD_MS) {
        return;
      }

      lastMetadataPressAtRef.current = now;

      const trimmed = String(value || "").trim();
      if (!trimmed) return;

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[player] metadata tapped", type, value);
      }
      fireLightHaptic();

      if (type === "mood") {
        openMoodCatalog(trimmed);
        return;
      }

      if (type === "genre") {
        const normalizedGenre = normalizeGenreName(trimmed) || trimmed;
        openGenreCatalog({
          id: normalizedGenre,
          title: normalizedGenre,
          query: normalizedGenre,
        });
        return;
      }

      const albumId = String(currentSong?.albumId || "").trim();

      if (albumId) {
        router.push({
          pathname: "/album/[id]",
          params: {
            id: albumId,
          },
        } as any);
        return;
      }

      router.push({
        pathname: "/album",
        params: {
          album: trimmed,
          artist,
          query: `${trimmed} ${artist}`.trim(),
        },
      } as any);
    },
    [artist, currentSong?.albumId]
  );

  const openLyrics = useCallback(() => {
    if (!currentSong) return;

    const song = currentSong as any;
    const songId = String(currentSong.id || "");
    const payload = getBestLyricsPayload({
      synced_lrc:
        song.syncedLyrics ||
        song.synced_lyrics ||
        song.synced_lrc ||
        song.lrc ||
        song.lrc_text,
      plain_lyrics:
        song.lyrics ||
        song.plainLyrics ||
        song.plain_lyrics ||
        song.lyrics_text,
    });

    if (songId) {
      setLyricsMemoryCache(songId, payload);
    }

    router.push({
      pathname: "/lyrics",
      params: {
        songId,
        title: currentSong.title || "Unknown Song",
        artist,
        syncedLyrics: payload.synced,
        plainLyrics: payload.plain,
      },
    });
  }, [currentSong, artist]);

  if (!currentSong) {
    return (
      <LinearGradient colors={GRADIENTS.main} style={styles.emptyContainer}>
        <AmbientGlow />

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
      <AmbientGlow />

      <View style={styles.playerAnchor}>
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

        <Animated.View
          entering={FadeInDown.duration(360).springify().damping(18)}
          style={styles.artworkGlow}
        >
          <Animated.View style={[styles.artworkHalo, artworkHaloStyle]} pointerEvents="none">
            <LinearGradient
              colors={["rgba(168,85,247,0.5)", "rgba(236,72,153,0.28)", "rgba(34,211,238,0.16)"]}
              style={styles.artworkHaloFill}
            />
          </Animated.View>

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
        </Animated.View>
      </View>

      <ScrollView
        style={styles.playerScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      >
        <Animated.View style={[styles.songInfo, metadataAnimated]}>
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
        </Animated.View>

        <PlayerWaveform isPlaying={isPlaying} />

        <PlayerProgressSection seekTo={seekTo} />

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

          <PremiumPlayButton
            isPlaying={isPlaying}
            isLoading={isLoading}
            onPress={togglePlayPause}
          />

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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open lyrics"
            hitSlop={10}
            onPress={openLyrics}
            style={({ pressed }) => [
              styles.extraAction,
              pressed && styles.extraActionPressed,
            ]}
          >
            <Ionicons name="musical-notes" size={20} color={COLORS.text} />
            <Text style={styles.extraActionText}>Lyrics</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open queue"
            hitSlop={10}
            onPress={() => router.push("/queue")}
            style={({ pressed }) => [
              styles.extraAction,
              pressed && styles.extraActionPressed,
            ]}
          >
            <Ionicons name="list" size={19} color={COLORS.text} />
            <Text style={styles.extraActionText}>Queue</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add to playlist"
            hitSlop={10}
            onPress={openPlaylistModal}
            style={({ pressed }) => [
              styles.extraAction,
              pressed && styles.extraActionPressed,
            ]}
          >
            <Ionicons name="add" size={20} color={COLORS.text} />
            <Text style={styles.extraActionText}>Playlist</Text>
          </Pressable>
        </View>

        {listeningContext.length > 0 ? (
          <View style={styles.contextPillRow}>
            {listeningContext.map((item) => (
              <MetadataContextChip
                key={`context-${item.type}-${item.label}`}
                label={item.label}
                onPress={() => handleMetadataPress(item.type, item.label)}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.sessionCard}>
          <View style={styles.sessionTextWrap}>
            <Text style={styles.sessionEyebrow}>
              {nextUpSong ? "UP NEXT" : "SESSION"}
            </Text>
            <Text numberOfLines={2} style={styles.sessionText}>
              {sessionFlowText}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.smartToggle, smartAutoplayEnabled && styles.smartToggleActive]}
            onPress={toggleSmartAutoplay}
          >
            <Ionicons
              name={smartAutoplayEnabled ? "infinite" : "infinite-outline"}
              size={15}
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
    backgroundColor: "rgba(168,85,247,0.32)",
  },

  glowCyan: {
    position: "absolute",
    top: 300,
    right: -130,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(34,211,238,0.22)",
  },

  playerAnchor: {
    paddingTop: 52,
    paddingHorizontal: 24,
    paddingBottom: 10,
    zIndex: 2,
  },

  playerScroll: {
    flex: 1,
    marginTop: -PLAYER_ART_SCROLL_OVERLAP,
    zIndex: 1,
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: PLAYER_ART_SCROLL_OVERLAP + 4,
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
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#A855F7",
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14,
    },
    elevation: 8,
  },

  artworkHalo: {
    position: "absolute",
    width: PLAYER_ART_SIZE + 32,
    height: PLAYER_ART_SIZE + 32,
    borderRadius: (PLAYER_ART_SIZE + 32) / 2,
    overflow: "hidden",
  },

  artworkHaloFill: {
    flex: 1,
  },

  artworkBorder: {
    width: PLAYER_ART_SIZE,
    height: PLAYER_ART_SIZE,
    borderRadius: PLAYER_ART_SIZE / 2,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },

  artworkWrapper: {
    width: PLAYER_ART_SIZE - 6,
    height: PLAYER_ART_SIZE - 6,
    borderRadius: (PLAYER_ART_SIZE - 6) / 2,
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
    marginTop: 2,
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
    marginTop: 12,
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

  contextPillPressed: {
    backgroundColor: "rgba(168,85,247,0.18)",
    borderColor: "rgba(168,85,247,0.38)",
  },

  contextPillText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
  },

  sessionCard: {
    marginTop: 12,
    borderRadius: 20,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  sessionTextWrap: {
    flex: 1,
    minWidth: 0,
  },

  sessionEyebrow: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  sessionText: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    fontWeight: "700",
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

  waveformContainer: {
    marginTop: 12,
    marginBottom: 4,
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
    marginTop: 16,
  },

  iconButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.075)",
    alignItems: "center",
    justifyContent: "center",
  },

  playButtonWrap: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },

  playButtonRing: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "rgba(192,132,252,0.35)",
  },

  playButton: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 8,
  },

  extraActions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },

  extraAction: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  extraActionPressed: {
    backgroundColor: "rgba(168,85,247,0.16)",
    borderColor: "rgba(168,85,247,0.32)",
  },

  extraActionText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },

  volumeSection: {
    marginTop: 14,
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
