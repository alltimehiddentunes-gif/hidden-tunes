import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Dimensions,
  Image,
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

import LiveWaveform from "../components/LiveWaveform";
import NeonEQ from "../components/NeonEQ";
import AppShell from "../components/navigation/AppShell";
import { COLORS, GRADIENTS } from "../constants/theme";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerProgress,
  usePlayerState,
} from "../context/PlayerContext";
import { FALLBACK_ARTWORK, getArtworkValue } from "../utils/artwork";
import { openGenreCatalog, openMoodCatalog } from "../utils/catalogNavigation";
import { normalizeGenreName } from "../utils/genreNormalization";
import { getBestLyricsPayload, setLyricsMemoryCache } from "../utils/lyrics";

const SCREEN_WIDTH = Dimensions.get("window").width;
const PLAYER_ART_SIZE = Math.round(
  Math.min(300, Math.max(260, SCREEN_WIDTH * 0.72))
);
const PLAYER_ART_SCROLL_OVERLAP = Math.round(PLAYER_ART_SIZE * 0.14);
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
    scale.value = withSequence(withSpring(0.9), withSpring(1));
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
  const { currentSong, isPlaying, isLoading } = usePlayerNowPlaying();
  const { positionMillis, durationMillis } = usePlayerProgress();
  const { activeQueue, activeQueueIndex, activeQueueMode, radioMode, youtubeQueue } =
    usePlayerState();
  const { togglePlayPause, nextSong, previousSong, seekTo } = usePlayerActions();

  const lastMetadataPressAtRef = useRef(0);
  const pulse = useSharedValue(1);
  const artworkHalo = useSharedValue(0.28);
  const metadataOpacity = useSharedValue(1);
  const metadataTranslateY = useSharedValue(0);

  const artwork = useMemo(() => {
    return getArtworkValue(currentSong) || FALLBACK_ARTWORK;
  }, [currentSong]);

  const title = currentSong?.title || "No track selected";
  const artist =
    currentSong?.artist || currentSong?.user?.name || "Hidden Tunes";
  const duration = Math.max(0, durationMillis || 0);
  const position = Math.max(
    0,
    Math.min(positionMillis || 0, duration || positionMillis || 0)
  );

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
      typeof activeQueueIndex === "number" ? activeQueueIndex + 1 : 1;
    return activeQueue[nextIndex] || null;
  }, [activeQueue, activeQueueIndex]);

  const sessionFlowText = useMemo(() => {
    if (nextUpSong?.title) return `Next: ${nextUpSong.title}`;
    if (activeQueue?.length) return "You are near the end of this queue.";
    return "Open discovery to build a longer session.";
  }, [activeQueue?.length, nextUpSong?.title]);

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
    if (!isPlaying || !currentSong) {
      cancelAnimation(pulse);
      cancelAnimation(artworkHalo);
      pulse.value = withTiming(1, { duration: 220 });
      artworkHalo.value = withTiming(0.26, { duration: 220 });
      return;
    }

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
      cancelAnimation(pulse);
      cancelAnimation(artworkHalo);
    };
  }, [artworkHalo, currentSong, isPlaying, pulse]);

  const artworkAnimated = useAnimatedStyle(() => ({
    transform: [{ scale: isPlaying ? pulse.value : 1 }],
  }));

  const artworkHaloStyle = useAnimatedStyle(() => ({
    opacity: artworkHalo.value,
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
          <Text style={styles.emptySubText}>
            Start from Home or Explore and Hidden Tunes will keep the session close.
          </Text>
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

        <View style={styles.playerAnchor}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="chevron-down" size={26} color={COLORS.text} />
            </TouchableOpacity>

            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>{queueLabel}</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {artist}
              </Text>
            </View>

            <TouchableOpacity style={styles.iconButton} onPress={openQueue}>
              <Ionicons name="list" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.artworkStage}>
            <Animated.View style={[styles.artworkHalo, artworkHaloStyle]} pointerEvents="none">
              <LinearGradient
                colors={[
                  "rgba(168,85,247,0.5)",
                  "rgba(236,72,153,0.28)",
                  "rgba(34,211,238,0.16)",
                ]}
                style={styles.artworkHaloFill}
              />
            </Animated.View>

            <LinearGradient colors={GRADIENTS.neon} style={styles.artworkBorder}>
              <Animated.View style={[styles.artworkWrapper, artworkAnimated]}>
                <Image source={{ uri: artwork }} style={styles.artwork} />
              </Animated.View>
            </LinearGradient>

            <View style={styles.eqBadge}>
              <NeonEQ isPlaying={isPlaying} size="medium" />
            </View>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.playerScroll}
          contentContainerStyle={styles.scrollContent}
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

            <Text numberOfLines={2} style={styles.title}>
              {title}
            </Text>
            <Text numberOfLines={1} style={styles.artist}>
              {artist}
            </Text>
          </Animated.View>

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

          <View style={styles.waveformPanel}>
            <LiveWaveform
              isPlaying={isPlaying}
              size="large"
              color={COLORS.primaryGlow}
            />
          </View>

          <View style={styles.progressPanel}>
            <Slider
              value={position}
              minimumValue={0}
              maximumValue={duration > 0 ? duration : 1}
              minimumTrackTintColor={COLORS.primaryGlow}
              maximumTrackTintColor="rgba(255,255,255,0.16)"
              thumbTintColor={COLORS.primary}
              disabled={!currentSong || duration <= 0}
              onSlidingComplete={handleSeekComplete}
            />
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
          </View>

          <View style={styles.controlsDock}>
            <View style={styles.controls}>
              <PremiumIconButton disabled={!currentSong} onPress={handlePrevious}>
                <Ionicons name="play-skip-back" size={30} color={COLORS.text} />
              </PremiumIconButton>

              <PremiumPlayButton
                isPlaying={isPlaying}
                isLoading={isLoading}
                disabled={!currentSong}
                onPress={handleTogglePlayPause}
              />

              <PremiumIconButton disabled={!currentSong} onPress={handleNext}>
                <Ionicons name="play-skip-forward" size={30} color={COLORS.text} />
              </PremiumIconButton>
            </View>
          </View>

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
          </View>

          <View style={styles.sessionCard}>
            <View style={styles.sessionTextWrap}>
              <Text style={styles.sessionEyebrow}>
                {nextUpSong ? "UP NEXT" : "SESSION"}
              </Text>
              <Text numberOfLines={2} style={styles.sessionText}>
                {sessionFlowText}
              </Text>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </AppShell>
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
    paddingHorizontal: 22,
    paddingBottom: 10,
    zIndex: 2,
  },
  playerScroll: {
    flex: 1,
    marginTop: -PLAYER_ART_SCROLL_OVERLAP,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: PLAYER_ART_SCROLL_OVERLAP + 4,
    paddingBottom: 150,
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
    marginTop: 18,
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
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
    letterSpacing: 2,
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
    marginTop: 14,
    shadowColor: "#A855F7",
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
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
  eqBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    minWidth: 54,
    minHeight: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,4,24,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  meta: {
    marginTop: 8,
    alignItems: "center",
  },
  statusPill: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
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
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  artist: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  contextPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
  },
  contextPill: {
    maxWidth: SCREEN_WIDTH * 0.42,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
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
  waveformPanel: {
    marginTop: 22,
    minHeight: 92,
    borderRadius: 28,
    paddingHorizontal: 16,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  progressPanel: {
    marginTop: 22,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
    marginTop: 26,
    borderRadius: 32,
    paddingVertical: 18,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 22,
  },
  premiumIconButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.08)",
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
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(168,85,247,0.35)",
  },
  playButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  extraActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: 18,
  },
  extraAction: {
    minWidth: 108,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    marginTop: 18,
    borderRadius: 24,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 20,
  },
});
