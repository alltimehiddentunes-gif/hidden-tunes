import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useWindowDimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import AddToPlaylistModal from "../components/AddToPlaylistModal";
import HTImage from "../components/HTImage";
import NeonEQ from "../components/NeonEQ";
import AppShell from "../components/navigation/AppShell";
import { COLORS, GRADIENTS, LUXURY_GLOW, TYPOGRAPHY } from "../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerProgress,
  usePlayerState,
} from "../context/PlayerContext";
import { openGenreCatalog, openMoodCatalog } from "../utils/catalogNavigation";
import { normalizeGenreName } from "../utils/genreNormalization";
import { getBestLyricsPayload, setLyricsMemoryCache } from "../utils/lyrics";
import { logPlaybackUxSync } from "../utils/playbackDiagnostics";
import {
  logPlayerDuplicateSmartControlRemoved,
  logPlayerRepeatControlUnified,
} from "../utils/playerControlDiagnostics";
import { useAppActiveState } from "../utils/performanceMode";
import { logPerformanceOffscreenWorkPaused } from "../utils/performanceLogs";

const METADATA_PRESS_GUARD_MS = 500;

type PlayerMetadataChip = {
  type: "album" | "mood" | "genre";
  label: string;
};

function formatTime(millis: number) {
  const totalSeconds = Math.max(0, Math.floor((millis || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function fireLightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

const AmbientGlow = memo(function AmbientGlow() {
  const appActive = useAppActiveState();
  const purple = useSharedValue<number>(LUXURY_GLOW.opacityMin);
  const cyan = useSharedValue<number>(LUXURY_GLOW.opacityMin * 0.85);

  useEffect(() => {
    if (!appActive) {
      cancelAnimation(purple);
      cancelAnimation(cyan);
      purple.value = withTiming(LUXURY_GLOW.opacityMin, { duration: 220 });
      cyan.value = withTiming(LUXURY_GLOW.opacityMin * 0.85, { duration: 220 });
      logPerformanceOffscreenWorkPaused("player_ambient_glow", { reason: "app_inactive" });
      return;
    }

    purple.value = withRepeat(
      withSequence(
        withTiming(LUXURY_GLOW.opacityMax, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(LUXURY_GLOW.opacityMin, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );
    cyan.value = withRepeat(
      withSequence(
        withTiming(LUXURY_GLOW.opacityMax * 0.9, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(LUXURY_GLOW.opacityMin * 0.85, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(purple);
      cancelAnimation(cyan);
    };
  }, [appActive, purple, cyan]);

  const purpleStyle = useAnimatedStyle(() => ({
    opacity: purple.value,
  }));

  const cyanStyle = useAnimatedStyle(() => ({
    opacity: cyan.value,
  }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.glowPurple, purpleStyle]} />
      <Animated.View pointerEvents="none" style={[styles.glowCyan, cyanStyle]} />
    </>
  );
});

const PremiumIconButton = memo(function PremiumIconButton({
  children,
  onPress,
  disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.45 : 1,
  }));

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    scale.value = withSpring(0.9, { damping: 16, stiffness: 420 });
  }, [disabled, scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 360 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    fireLightHaptic();
    scale.value = withSpring(1, { damping: 14, stiffness: 360 });
    onPress?.();
  }, [disabled, onPress, scale]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={styles.premiumIconButton}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
});

const PremiumPlayButton = memo(function PremiumPlayButton({
  isPlaying,
  isLoading,
  disabled,
  onPress,
}: {
  isPlaying: boolean;
  isLoading: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.24);

  useEffect(() => {
    if (!isPlaying || disabled) {
      cancelAnimation(ringOpacity);
      ringOpacity.value = withTiming(0.22, { duration: 220 });
      return;
    }

    ringOpacity.value = withTiming(0.34, { duration: 260 });

    return () => {
      cancelAnimation(ringOpacity);
    };
  }, [disabled, isPlaying, ringOpacity]);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.45 : 1,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
  }));

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    scale.value = withSpring(0.94, { damping: 16, stiffness: 420 });
  }, [disabled, scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 360 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    fireLightHaptic();
    onPress();
  }, [disabled, onPress]);

  return (
    <View style={styles.playButtonWrap}>
      <Animated.View style={[styles.playButtonRing, ringStyle]} pointerEvents="none" />
      <Animated.View style={buttonStyle}>
        <Pressable
          disabled={disabled}
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

const PlayerProgressPanel = memo(function PlayerProgressPanel({
  compactLayout,
  disabled,
  isLoading,
  isPlaying,
  onSeekComplete,
}: {
  compactLayout: boolean;
  disabled: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  onSeekComplete: (value: number) => void;
}) {
  const { positionMillis, durationMillis } = usePlayerProgress();
  const duration = Math.max(0, durationMillis || 0);
  const position = Math.max(
    0,
    Math.min(positionMillis || 0, duration || positionMillis || 0)
  );
  const progressDisabled = disabled || isLoading || !isPlaying;

  return (
    <View style={[styles.progressPanel, compactLayout && styles.progressPanelCompact]}>
      <Slider
        value={position}
        minimumValue={0}
        maximumValue={duration > 0 ? duration : 1}
        minimumTrackTintColor={COLORS.primaryGlow}
        maximumTrackTintColor="rgba(255,255,255,0.16)"
        thumbTintColor={COLORS.primary}
        disabled={progressDisabled}
        onSlidingComplete={onSeekComplete}
      />
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(position)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
});

const PlayerControlsDock = memo(function PlayerControlsDock({
  compactLayout,
  disabled,
  shuffle,
  repeatMode,
  isPlaying,
  isLoading,
  onToggleShuffle,
  onPrevious,
  onTogglePlayPause,
  onNext,
  onCycleRepeat,
}: {
  compactLayout: boolean;
  disabled: boolean;
  shuffle: boolean;
  repeatMode: string;
  isPlaying: boolean;
  isLoading: boolean;
  onToggleShuffle: () => void;
  onPrevious: () => void;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onCycleRepeat: () => void;
}) {
  return (
    <View style={[styles.controlsDock, compactLayout && styles.controlsDockCompact]}>
      <View style={[styles.controls, styles.controlsRestored, compactLayout && styles.controlsCompact]}>
        <PremiumIconButton disabled={disabled} onPress={onToggleShuffle}>
          <Ionicons name="shuffle" size={22} color={shuffle ? COLORS.primaryGlow : COLORS.text} />
        </PremiumIconButton>

        <PremiumIconButton disabled={disabled} onPress={onPrevious}>
          <Ionicons name="play-skip-back" size={27} color={COLORS.text} />
        </PremiumIconButton>

        <PremiumPlayButton
          isPlaying={isPlaying}
          isLoading={isLoading}
          disabled={disabled}
          onPress={onTogglePlayPause}
        />

        <PremiumIconButton disabled={disabled} onPress={onNext}>
          <Ionicons name="play-skip-forward" size={27} color={COLORS.text} />
        </PremiumIconButton>

        <PremiumIconButton disabled={disabled} onPress={onCycleRepeat}>
          <View style={styles.repeatIconWrap}>
            <Ionicons
              name="repeat"
              size={22}
              color={repeatMode === "off" ? COLORS.text : COLORS.primaryGlow}
            />
            {repeatMode === "one" ? <Text style={styles.repeatOneBadge}>1</Text> : null}
          </View>
        </PremiumIconButton>
      </View>
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

export default function PlayerScreen() {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const compactLayout = viewportWidth < 380 || viewportHeight < 760;
  const artworkSize = Math.round(
    Math.min(compactLayout ? 268 : 334, Math.max(232, viewportWidth * (compactLayout ? 0.68 : 0.76)))
  );
  const artworkScrollOverlap = Math.round(artworkSize * (compactLayout ? 0.08 : 0.12));
  const horizontalPadding = compactLayout ? 18 : 22;

  const { currentSong, isPlaying, isLoading } = usePlayerNowPlaying();
  const playerScreenActive = useAppActiveState();
  const {
    activeQueue,
    activeQueueIndex,
    activeQueueMode,
    activeQueueContext,
    radioMode,
    youtubeQueue,
    shuffle,
    repeatMode,
    smartAutoplayEnabled,
    volume,
    isMuted,
  } = usePlayerState();
  const {
    togglePlayPause,
    nextSong,
    previousSong,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeatMode,
    toggleSmartAutoplay,
  } = usePlayerActions();

  const [addToPlaylistOpen, setAddToPlaylistOpen] = useState(false);
  const lastMetadataPressAtRef = useRef(0);
  const pulse = useSharedValue(1);
  const artworkRotation = useSharedValue(0);
  const artworkHalo = useSharedValue(0.28);
  const metadataOpacity = useSharedValue(1);
  const metadataTranslateY = useSharedValue(0);

  const title = currentSong?.title || "No track selected";
  const artist =
    currentSong?.artist || currentSong?.user?.name || "Hidden Tunes";
  const queueLabel = useMemo(() => {
    if (activeQueueMode === "smart") return "SMART AUTOPLAY";
    if (radioMode) return "RADIO MODE";
    if (youtubeQueue?.length) return `${youtubeQueue.length} IN QUEUE`;
    if (activeQueue?.length) return `${activeQueue.length} TRACK SESSION`;
    return "NOW PLAYING";
  }, [
    activeQueue?.length,
    activeQueueMode,
    radioMode,
    youtubeQueue?.length,
  ]);

  const sessionContextLabel = useMemo(() => {
    const context = activeQueueContext;
    if (context?.albumTitle) return context.albumTitle;
    if (context?.label) return context.label;
    if (context?.genre) return context.genre;
    if (context?.mood) return context.mood;
    return "Hidden Tunes";
  }, [activeQueueContext]);

  const listeningContext = useMemo(() => {
    if (!currentSong) return [] as PlayerMetadataChip[];

    const chips: PlayerMetadataChip[] = [];
    const album = String(currentSong.album || "").trim();
    if (album) chips.push({ type: "album", label: album });

    const mood = String((currentSong as { mood?: string }).mood || "").trim();
    if (mood) chips.push({ type: "mood", label: mood });

    const genre = normalizeGenreName((currentSong as { genre?: string }).genre);
    if (genre) chips.push({ type: "genre", label: genre });

    return chips.slice(0, 3);
  }, [currentSong]);

  const nextUpSong = useMemo(() => {
    if (!Array.isArray(activeQueue) || activeQueue.length === 0) return null;
    const nextIndex =
      typeof activeQueueIndex === "number" ? activeQueueIndex + 1 : 0;
    if (nextIndex < 0 || nextIndex >= activeQueue.length) return null;
    return activeQueue[nextIndex] || null;
  }, [activeQueue, activeQueueIndex]);

  const sessionFlowText = useMemo(() => {
    if (nextUpSong?.title) return `Next: ${nextUpSong.title}`;
    if (activeQueue?.length) return "Queue ending";
    return "Open discovery for the next track";
  }, [activeQueue?.length, nextUpSong?.title]);

  const lastUpNextLogKeyRef = useRef("");

  useEffect(() => {
    if (!currentSong?.id) return;
    const key = `${currentSong.id}:${activeQueueIndex}:${nextUpSong?.id || ""}`;
    if (lastUpNextLogKeyRef.current === key) return;
    lastUpNextLogKeyRef.current = key;
    logPlaybackUxSync("up_next_sync_confirmed", {
      songId: currentSong.id,
      queueLength: activeQueue?.length ?? 0,
      activeIndex: activeQueueIndex,
      nextSongId: nextUpSong?.id,
      nextTitle: nextUpSong?.title,
    });
  }, [activeQueue?.length, activeQueueIndex, currentSong?.id, nextUpSong?.id, nextUpSong?.title]);

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
    cancelAnimation(artworkRotation);
    artworkRotation.value = 0;
  }, [artworkRotation, currentSong?.id]);

  useEffect(() => {
    if (!currentSong || !playerScreenActive) {
      cancelAnimation(pulse);
      cancelAnimation(artworkRotation);
      cancelAnimation(artworkHalo);
      pulse.value = withTiming(1, { duration: 220 });
      artworkRotation.value = withTiming(0, { duration: 220 });
      artworkHalo.value = withTiming(0.24, { duration: 220 });
      return;
    }

    if (!isPlaying) {
      cancelAnimation(pulse);
      cancelAnimation(artworkRotation);
      cancelAnimation(artworkHalo);
      pulse.value = withRepeat(
        withSequence(
          withTiming(LUXURY_GLOW.scaleMax, {
            duration: LUXURY_GLOW.pulseDurationMs / 2,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(1, {
            duration: LUXURY_GLOW.pulseDurationMs / 2,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        false
      );
      artworkHalo.value = withRepeat(
        withSequence(
          withTiming(LUXURY_GLOW.opacityMax, {
            duration: LUXURY_GLOW.pulseDurationMs / 2,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(LUXURY_GLOW.opacityMin + 0.06, {
            duration: LUXURY_GLOW.pulseDurationMs / 2,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        false
      );
      return;
    }

    pulse.value = withRepeat(
      withSequence(
        withTiming(1.02, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(1.004, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );
    artworkRotation.value = withRepeat(
      withTiming(360, { duration: 72000, easing: Easing.linear }),
      -1,
      false
    );
    artworkHalo.value = withRepeat(
      withSequence(
        withTiming(LUXURY_GLOW.opacityMax + 0.1, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(LUXURY_GLOW.opacityMin + 0.12, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(pulse);
      cancelAnimation(artworkRotation);
      cancelAnimation(artworkHalo);
    };
  }, [artworkHalo, artworkRotation, currentSong, isPlaying, playerScreenActive, pulse]);

  const artworkAnimated = useAnimatedStyle(() => ({
    transform: [
      { scale: isPlaying ? pulse.value : 1 },
      { rotate: `${artworkRotation.value}deg` },
    ],
  }));

  const artworkHaloStyle = useAnimatedStyle(() => ({
    opacity: artworkHalo.value,
    transform: [{ scale: 0.94 + artworkHalo.value * 0.18 }],
  }));

  const metadataAnimated = useAnimatedStyle(() => ({
    opacity: metadataOpacity.value,
    transform: [{ translateY: metadataTranslateY.value }],
  }));

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const openQueue = useCallback(() => {
    router.push("/queue" as any);
  }, []);

  const handleSeekComplete = useCallback(
    (value: number) => {
      void seekTo(value);
    },
    [seekTo]
  );

  const handlePrevious = useCallback(() => {
    void previousSong();
  }, [previousSong]);

  const handleTogglePlayPause = useCallback(() => {
    void togglePlayPause();
  }, [togglePlayPause]);

  const handleNext = useCallback(() => {
    void nextSong();
  }, [nextSong]);

  const openArtist = useCallback(() => {
    if (!artist) return;
    router.push({ pathname: "/artist", params: { artist } } as any);
  }, [artist]);

  const handleCycleRepeat = useCallback(() => {
    void toggleRepeatMode();
  }, [toggleRepeatMode]);

  useEffect(() => {
    logPlayerDuplicateSmartControlRemoved();
    logPlayerRepeatControlUnified({ cycle: "off-one-all" });
  }, []);

  const handleVolumeChange = useCallback(
    (value: number) => {
      void setVolume(value);
    },
    [setVolume]
  );

  const handleSmartToggle = useCallback(() => {
    void toggleSmartAutoplay();
  }, [toggleSmartAutoplay]);

  const openLyrics = useCallback(() => {
    if (!currentSong) return;

    const song = currentSong as Record<string, unknown>;
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
    } as any);
  }, [artist, currentSong]);

  const handleMetadataPress = useCallback(
    (type: PlayerMetadataChip["type"], value: string) => {
      const now = Date.now();
      if (now - lastMetadataPressAtRef.current < METADATA_PRESS_GUARD_MS) return;
      lastMetadataPressAtRef.current = now;

      const trimmed = String(value || "").trim();
      if (!trimmed) return;

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

      router.push({
        pathname: "/album",
        params: {
          album: trimmed,
          artist,
          query: `${trimmed} ${artist}`.trim(),
        },
      } as any);
    },
    [artist]
  );

  if (!currentSong) {
    return (
      <AppShell>
        <LinearGradient colors={GRADIENTS.player} style={styles.emptyContainer}>
          <AmbientGlow />
          <View style={styles.emptyIcon}>
            <Ionicons name="musical-notes-outline" size={64} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyText}>Ready when you are</Text>
          <Text style={styles.emptySubText}>Start from Home or Explore.</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.emptyButton}
            onPress={() => router.push("/music-feed" as any)}
          >
            <Ionicons name="home" size={18} color="#000" />
            <Text style={styles.emptyButtonText}>Start Listening</Text>
          </TouchableOpacity>
        </LinearGradient>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.player} style={styles.container}>
        <AmbientGlow />

        <View style={[styles.playerAnchor, compactLayout && styles.playerAnchorCompact, { paddingHorizontal: horizontalPadding }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="chevron-down" size={26} color={COLORS.text} />
            </TouchableOpacity>

            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>{queueLabel}</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {sessionContextLabel}
              </Text>
            </View>

            <TouchableOpacity style={styles.iconButton} onPress={openQueue}>
              <Ionicons name="list" size={23} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.artworkStage}>
            <Animated.View
              style={[
                styles.artworkHalo,
                {
                  width: artworkSize + 32,
                  height: artworkSize + 32,
                  borderRadius: (artworkSize + 32) / 2,
                },
                artworkHaloStyle,
              ]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={[
                  "rgba(168,85,247,0.5)",
                  "rgba(236,72,153,0.28)",
                  "rgba(34,211,238,0.16)",
                ]}
                style={styles.artworkHaloFill}
              />
            </Animated.View>

            <LinearGradient
              colors={GRADIENTS.neon}
              style={[
                styles.artworkBorder,
                { width: artworkSize, height: artworkSize, borderRadius: artworkSize / 2 },
              ]}
            >
              <Animated.View
                style={[
                  styles.artworkWrapper,
                  {
                    width: artworkSize - 6,
                    height: artworkSize - 6,
                    borderRadius: (artworkSize - 6) / 2,
                  },
                  artworkAnimated,
                ]}
              >
                <HTImage source={currentSong} style={styles.artwork} contentFit="cover" />
              </Animated.View>
            </LinearGradient>

            <View style={styles.eqBadge}>
              <NeonEQ isPlaying={isPlaying} size="medium" />
            </View>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={[styles.playerScroll, { marginTop: -artworkScrollOverlap }]}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: horizontalPadding, paddingTop: artworkScrollOverlap + (compactLayout ? 0 : 4) },
          ]}
        >
          <Animated.View style={[styles.meta, metadataAnimated]}>
            <View style={styles.statusPill}>
              <Ionicons
                name={isPlaying ? "radio" : "musical-notes"}
                size={13}
                color={COLORS.primaryGlow}
              />
              <Text style={styles.statusText}>
                {isPlaying ? "Playing" : "Paused"}
              </Text>
            </View>

            <Text numberOfLines={2} ellipsizeMode="tail" style={styles.title}>
              {title}
            </Text>
            <TouchableOpacity activeOpacity={0.82} onPress={openArtist}>
              <Text numberOfLines={1} style={styles.artist}>{artist}</Text>
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.sessionPillRow}>
            <Text style={styles.sessionPill}>{activeQueue?.length || 1} Track Session</Text>
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={handleSmartToggle}
              style={[styles.smartPillButton, smartAutoplayEnabled && styles.smartPillButtonActive]}
            >
              <Ionicons
                name="sparkles"
                size={13}
                color={smartAutoplayEnabled ? COLORS.primaryGlow : COLORS.text}
              />
              <Text style={[styles.smartPillText, smartAutoplayEnabled && styles.smartPillTextActive]}>
                Smart {smartAutoplayEnabled ? "On" : "Off"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.82} onPress={openQueue} style={styles.queuePillButton}>
              <Ionicons name="list" size={13} color={COLORS.primaryGlow} />
              <Text style={styles.queuePillText}>Queue</Text>
            </TouchableOpacity>
          </View>

          {listeningContext.length > 0 ? (
            <View style={styles.contextPillRow}>
              {listeningContext.map((item) => (
                <MetadataContextChip
                  key={`${item.type}-${item.label}`}
                  label={item.label}
                  onPress={() => handleMetadataPress(item.type, item.label)}
                />
              ))}
            </View>
          ) : null}

          <PlayerProgressPanel
            compactLayout={compactLayout}
            disabled={!currentSong}
            isLoading={isLoading}
            isPlaying={isPlaying}
            onSeekComplete={handleSeekComplete}
          />

          <PlayerControlsDock
            compactLayout={compactLayout}
            disabled={!currentSong}
            shuffle={shuffle}
            repeatMode={repeatMode}
            isPlaying={isPlaying}
            isLoading={isLoading}
            onToggleShuffle={toggleShuffle}
            onPrevious={handlePrevious}
            onTogglePlayPause={handleTogglePlayPause}
            onNext={handleNext}
            onCycleRepeat={handleCycleRepeat}
          />

          <View style={styles.extraActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open lyrics"
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
              onPress={openQueue}
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
              onPress={() => setAddToPlaylistOpen(true)}
              style={({ pressed }) => [
                styles.extraAction,
                pressed && styles.extraActionPressed,
              ]}
            >
              <Ionicons name="add-circle" size={19} color={COLORS.text} />
              <Text style={styles.extraActionText}>Add to Playlist</Text>
            </Pressable>
          </View>

          {nextUpSong ? (
            <TouchableOpacity activeOpacity={0.84} style={styles.upNextCard} onPress={openQueue}>
              <View style={styles.upNextCopy}>
                <Text style={styles.sessionEyebrow}>UP NEXT</Text>
                <Text numberOfLines={1} style={styles.upNextTitle}>{nextUpSong.title}</Text>
                <Text numberOfLines={1} style={styles.upNextArtist}>{nextUpSong.artist || nextUpSong.user?.name || "Hidden Tunes"}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : null}

          <View style={styles.infoCard}>
            <Text style={styles.sessionEyebrow}>{activeQueueContext?.source === "album" ? "ALBUM CONTEXT" : activeQueueContext?.source === "radio" ? "ROOM CONTEXT" : "TRACK INFORMATION"}</Text>
            <InfoRow label="Album" value={String(currentSong.album || "Singles")} onPress={() => handleMetadataPress("album", String(currentSong.album || "Singles"))} />
            <InfoRow label="Artist" value={artist} onPress={openArtist} />
            <InfoRow label="Song" value={title} />
            <InfoRow label="Mood" value={String((currentSong as { mood?: string }).mood || "Open")} onPress={() => handleMetadataPress("mood", String((currentSong as { mood?: string }).mood || ""))} />
            <InfoRow label="Genre" value={normalizeGenreName((currentSong as { genre?: string }).genre) || "Hidden Tunes"} onPress={() => handleMetadataPress("genre", normalizeGenreName((currentSong as { genre?: string }).genre) || "")} />
          </View>

          <View style={styles.sessionCard}>
            <View style={styles.sessionTextWrap}>
              <Text style={styles.sessionEyebrow}>SESSION CONTINUATION</Text>
              <Text numberOfLines={2} style={styles.sessionSubText}>{sessionFlowText}</Text>
            </View>
          </View>

          <View style={styles.volumeCard}>
            <View style={styles.volumeHeader}>
              <Text style={styles.sessionEyebrow}>VOLUME</Text>
              <TouchableOpacity activeOpacity={0.82} onPress={toggleMute}>
                <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={21} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Slider
              value={isMuted ? 0 : volume}
              minimumValue={0}
              maximumValue={1}
              minimumTrackTintColor={COLORS.primaryGlow}
              maximumTrackTintColor="rgba(255,255,255,0.16)"
              thumbTintColor={COLORS.primary}
              onSlidingComplete={handleVolumeChange}
            />
          </View>
        </ScrollView>
      </LinearGradient>
      <AddToPlaylistModal
        visible={addToPlaylistOpen}
        track={currentSong}
        onClose={() => setAddToPlaylistOpen(false)}
      />
    </AppShell>
  );
}


const InfoRow = memo(function InfoRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.infoValue}>{value}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} /> : null}
    </View>
  );

  if (!onPress) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  glowPurple: {
    position: "absolute",
    top: 50,
    left: -120,
    width: 324,
    height: 324,
    borderRadius: 162,
    backgroundColor: "rgba(168,85,247,0.28)",
  },
  glowCyan: {
    position: "absolute",
    top: 336,
    right: -146,
    width: 344,
    height: 344,
    borderRadius: 172,
    backgroundColor: "rgba(34,211,238,0.16)",
  },
  playerAnchor: {
    paddingTop: 38,
    paddingHorizontal: 20,
    paddingBottom: 8,
    zIndex: 2,
  },
  playerAnchorCompact: {
    paddingTop: 44,
    paddingBottom: 4,
  },
  playerScroll: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 138,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 58,
    paddingHorizontal: 28,
    paddingBottom: 130,
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
    marginTop: 12,
  },
  emptySubText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8,
    fontWeight: "700",
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  headerCopy: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 10,
  },
  headerTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  headerSubtitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
    maxWidth: 220,
  },
  artworkStage: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    shadowColor: "#A855F7",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  artworkHalo: {
    position: "absolute",
    overflow: "hidden",
  },
  artworkHaloFill: {
    flex: 1,
  },
  artworkBorder: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primaryGlow,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  artworkWrapper: {
    overflow: "hidden",
    backgroundColor: "rgba(18,7,31,0.46)",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.38)",
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  eqBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    minWidth: 52,
    minHeight: 40,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,4,24,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  meta: {
    marginTop: 4,
    alignItems: "center",
  },
  statusPill: {
    minHeight: 26,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    marginBottom: 6,
  },
  statusText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.heroTitle,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0,
    lineHeight: TYPOGRAPHY.heroTitle + 6,
  },
  artist: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.heroSubtitle,
    fontWeight: "700",
    marginTop: 7,
    textAlign: "center",
    lineHeight: TYPOGRAPHY.heroSubtitle + 4,
  },
  sessionPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  sessionPill: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  queuePillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.22)",
  },
  queuePillText: {
    color: COLORS.primaryGlow,
    fontSize: 11,
    fontWeight: "900",
  },
  smartPillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  smartPillButtonActive: {
    backgroundColor: "rgba(168,85,247,0.12)",
    borderColor: "rgba(168,85,247,0.22)",
  },
  smartPillText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
  },
  smartPillTextActive: {
    color: COLORS.primaryGlow,
  },
  repeatIconWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatOneBadge: {
    position: "absolute",
    right: -1,
    bottom: -2,
    color: COLORS.primaryGlow,
    fontSize: 9,
    fontWeight: "900",
  },
  contextPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  contextPill: {
    maxWidth: "46%",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  contextPillPressed: {
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  contextPillText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  progressPanel: {
    marginTop: 14,
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 11,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  progressPanelCompact: {
    marginTop: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  timeText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  controlsDock: {
    marginTop: 13,
    borderRadius: 25,
    paddingVertical: 13,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  controlsDockCompact: {
    marginTop: 12,
    paddingVertical: 14,
  },
  controlsCompact: {
    gap: 16,
  },
  premiumIconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.085)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  playButtonWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonRing: {
    position: "absolute",
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  playButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.22,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  extraActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 13,
  },
  extraAction: {
    minWidth: 104,
    borderRadius: 17,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  extraActionPressed: {
    backgroundColor: "rgba(168,85,247,0.14)",
  },
  extraActionText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  sessionCard: {
    marginTop: 14,
    borderRadius: 20,
    padding: 13,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sessionTextWrap: {
    flex: 1,
  },
  sessionEyebrow: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  sessionText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 20,
  },
  controlsRestored: {
    gap: 9,
    flexWrap: "nowrap",
  },
  upNextCard: {
    marginTop: 14,
    borderRadius: 20,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  upNextCopy: {
    flex: 1,
    minWidth: 0,
  },
  upNextTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 6,
  },
  upNextArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  infoCard: {
    marginTop: 14,
    borderRadius: 20,
    padding: 13,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  infoRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.065)",
  },
  infoLabel: {
    width: 72,
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  infoValue: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  sessionSubText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 18,
  },
  smartButton: {
    minWidth: 54,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  smartButtonActive: {
    backgroundColor: "rgba(168,85,247,0.18)",
    borderColor: "rgba(168,85,247,0.32)",
  },
  smartButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  volumeCard: {
    marginTop: 14,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  volumeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },

});
