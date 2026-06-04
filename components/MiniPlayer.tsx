import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { COLORS, GRADIENTS } from "../constants/theme";
import {
  usePlayerActions,
  usePlayerProgress,
  usePlayerState,
} from "../context/PlayerContext";
import HTImage from "./HTImage";
import { FALLBACK_ARTWORK } from "../utils/artwork";
import { isFastScrolling } from "../utils/performanceMode";

type YouTubeMini = {
  id: string;
  title: string;
  channelTitle?: string;
  artist?: string;
  thumbnail?: string;
};

const YOUTUBE_MINI_KEY = "hidden_tunes_current_youtube";
const YOUTUBE_POLL_MS = 30000;

function formatMiniTime(millis: number) {
  const totalSeconds = Math.max(0, Math.floor((millis || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function fireLightHaptic() {
  if (isFastScrolling()) return;

  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

const MiniControlButton = memo(function MiniControlButton({
  onPress,
  style,
  children,
  accessibilityLabel,
}: {
  onPress: () => void;
  style?: object;
  children: React.ReactNode;
  accessibilityLabel?: string;
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
    onPress();
  }, [onPress]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
});

const MiniPlayerArtwork = memo(function MiniPlayerArtwork({
  cover,
  isYoutubeMode,
  isPlaying,
  trackKey,
}: {
  cover?: any;
  isYoutubeMode: boolean;
  isPlaying: boolean;
  trackKey: string;
}) {
  const glowOpacity = useSharedValue(0.18);
  const glowScale = useSharedValue(1);

  useEffect(() => {
    if (!isPlaying && !isYoutubeMode) {
      cancelAnimation(glowOpacity);
      cancelAnimation(glowScale);
      glowOpacity.value = withTiming(0.3, { duration: 220 });
      glowScale.value = withTiming(1, { duration: 220 });
      return;
    }

    glowOpacity.value = withTiming(0.26, { duration: 220 });
    glowScale.value = withTiming(1.015, { duration: 220 });

    return () => {
      cancelAnimation(glowOpacity);
      cancelAnimation(glowScale);
    };
  }, [glowOpacity, glowScale, isPlaying, isYoutubeMode]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <View style={styles.coverWrap}>
      <Animated.View style={[styles.coverGlowOuter, glowStyle]} pointerEvents="none">
        <LinearGradient
          colors={["rgba(168,85,247,0.28)", "rgba(236,72,153,0.18)", "rgba(34,211,238,0.1)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.coverGlowFill}
        />
      </Animated.View>

      <View style={styles.coverFrame}>
        {cover ? (
          <HTImage
            key={trackKey}
            source={cover}
            fallback={FALLBACK_ARTWORK}
            style={styles.cover}
            contentFit="cover"
          />
        ) : isYoutubeMode ? (
          <View style={styles.youtubeCover}>
            <Ionicons name="tv" size={30} color="#fff" />
          </View>
        ) : (
          <HTImage
            source={FALLBACK_ARTWORK}
            style={styles.cover}
            contentFit="cover"
          />
        )}
      </View>

      {(isPlaying || isYoutubeMode) && (
        <Animated.View
          entering={FadeInDown.duration(180)}
          style={styles.liveDot}
        />
      )}
    </View>
  );
});

const MiniPlayerProgress = memo(function MiniPlayerProgress({
  isYoutubeMode,
}: {
  isYoutubeMode: boolean;
}) {
  const { position, duration } = usePlayerProgress();
  const trackWidth = useSharedValue(0);
  const progressValue = useSharedValue(0);

  const progress = useMemo(() => {
    if (isYoutubeMode || !duration || duration <= 0) return 0;

    const safeProgress = position / duration;

    if (!Number.isFinite(safeProgress)) return 0;

    return Math.max(0, Math.min(safeProgress, 1));
  }, [position, duration, isYoutubeMode]);

  useEffect(() => {
    progressValue.value = withTiming(progress, {
      duration: isFastScrolling() ? 0 : 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, progressValue]);

  const fillStyle = useAnimatedStyle(() => ({
    width: trackWidth.value * progressValue.value,
  }));

  const onTrackLayout = useCallback(
    (event: LayoutChangeEvent) => {
      trackWidth.value = event.nativeEvent.layout.width;
    },
    [trackWidth]
  );

  if (isYoutubeMode) {
    return (
      <Text numberOfLines={1} style={styles.youtubeNote}>
        Open video
      </Text>
    );
  }

  return (
    <View>
      <View style={styles.progressTrack} onLayout={onTrackLayout}>
        <Animated.View style={[styles.progressFill, fillStyle]} />
        <View style={styles.progressGlow} pointerEvents="none" />
      </View>
      <View style={styles.miniTimeRow}>
        <Text style={styles.miniTimeText}>{formatMiniTime(position)}</Text>
        <Text style={styles.miniTimeText}>{formatMiniTime(duration)}</Text>
      </View>
    </View>
  );
});

const MiniPlayerMetadata = memo(function MiniPlayerMetadata({
  title,
  artist,
  queueLabel,
  badgeIconName,
  isYoutubeMode,
}: {
  title: string;
  artist: string;
  queueLabel: string;
  badgeIconName: string;
  isYoutubeMode: boolean;
}) {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const identity = `${title}-${artist}`;

  useEffect(() => {
    opacity.value = 0.55;
    translateY.value = 4;
    opacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
    translateY.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [identity, opacity, translateY]);

  const textStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const badgeStyle = useMemo(
    () => [styles.badge, isYoutubeMode && styles.youtubeBadge],
    [isYoutubeMode]
  );

  return (
    <Animated.View style={[styles.info, textStyle]}>
      <View style={styles.badgeRow}>
        <View style={badgeStyle}>
          <Ionicons name={badgeIconName as any} size={11} color="#fff" />
          <Text style={styles.badgeText}>{queueLabel}</Text>
        </View>
      </View>

      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>

      <Text numberOfLines={1} style={styles.artist}>
        {artist}
      </Text>

      <MiniPlayerProgress isYoutubeMode={isYoutubeMode} />
    </Animated.View>
  );
});

function MiniPlayer() {
  const {
    currentSong,
    isPlaying,
    isLoading,
    radioMode,
    youtubeQueue,
    radioQueue,
  } = usePlayerState();
  const { togglePlayPause, nextSong, previousSong } = usePlayerActions();

  const [youtubeVideo, setYoutubeVideo] = useState<YouTubeMini | null>(null);

  const mountedRef = useRef(true);
  const lastYouTubeJsonRef = useRef<string | null>(null);

  const loadYouTubeMini = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(YOUTUBE_MINI_KEY);

      if (!mountedRef.current) return;
      if (saved === lastYouTubeJsonRef.current) return;

      lastYouTubeJsonRef.current = saved;

      if (!saved) {
        setYoutubeVideo(null);
        return;
      }

      const parsed = JSON.parse(saved);

      setYoutubeVideo({
        id: String(parsed?.id || ""),
        title: String(parsed?.title || "YouTube Video"),
        channelTitle: parsed?.channelTitle,
        artist: parsed?.artist,
        thumbnail: parsed?.thumbnail,
      });
    } catch {
      if (!mountedRef.current) return;

      lastYouTubeJsonRef.current = null;
      setYoutubeVideo(null);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    loadYouTubeMini();

    const timer = setInterval(loadYouTubeMini, YOUTUBE_POLL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [loadYouTubeMini]);

  const isYoutubeMode = !currentSong && !!youtubeVideo;

  const radioQueueLength = radioQueue?.length || 0;
  const youtubeQueueLength = youtubeQueue?.length || 0;

  const queueLabel = useMemo(() => {
    if (radioMode && radioQueueLength > 0) return "Radio queue";
    if (youtubeQueueLength > 0) return `${youtubeQueueLength} in queue`;
    if (isYoutubeMode) return "YouTube";
    return "Now playing";
  }, [radioMode, radioQueueLength, youtubeQueueLength, isYoutubeMode]);

  const title = useMemo(() => {
    if (isYoutubeMode) return youtubeVideo?.title || "YouTube Video";
    return currentSong?.title || "Unknown track";
  }, [isYoutubeMode, youtubeVideo?.title, currentSong?.title]);

  const artist = useMemo(() => {
    if (isYoutubeMode) {
      return youtubeVideo?.channelTitle || youtubeVideo?.artist || "YouTube";
    }

    return currentSong?.artist || currentSong?.user?.name || "Unknown artist";
  }, [
    isYoutubeMode,
    youtubeVideo?.channelTitle,
    youtubeVideo?.artist,
    currentSong?.artist,
    currentSong?.user?.name,
  ]);

  const cover = useMemo(() => {
    if (isYoutubeMode) {
      return youtubeVideo?.thumbnail
        ? {
            thumbnail: youtubeVideo.thumbnail,
            image: youtubeVideo.thumbnail,
            title: youtubeVideo.title,
          }
        : null;
    }
    return currentSong;
  }, [isYoutubeMode, youtubeVideo, currentSong]);

  const trackKey = useMemo(() => {
    if (isYoutubeMode) return `yt-${youtubeVideo?.id || "none"}`;
    return `song-${currentSong?.id || "none"}`;
  }, [isYoutubeMode, youtubeVideo?.id, currentSong?.id]);

  const openPlayer = useCallback(() => {
    if (isYoutubeMode && youtubeVideo?.id) {
      router.push({
        pathname: "/youtube-player",
        params: {
          videoId: youtubeVideo.id,
          title: youtubeVideo.title,
          channelTitle:
            youtubeVideo.channelTitle || youtubeVideo.artist || "YouTube",
          thumbnail: youtubeVideo.thumbnail || "",
        },
      });

      return;
    }

    router.push("/player" as any);
  }, [isYoutubeMode, youtubeVideo]);

  const handleMainButton = useCallback(async () => {
    if (isYoutubeMode) {
      openPlayer();
      return;
    }

    await togglePlayPause();
  }, [isYoutubeMode, openPlayer, togglePlayPause]);

  const handlePrevious = useCallback(() => {
    previousSong();
  }, [previousSong]);

  const handleNext = useCallback(() => {
    nextSong();
  }, [nextSong]);

  const badgeIconName = useMemo(() => {
    if (isYoutubeMode) return "tv";
    if (radioMode) return "radio";
    return "pulse";
  }, [isYoutubeMode, radioMode]);

  const mainIconName = useMemo(() => {
    if (isYoutubeMode) return "open-outline";
    if (isLoading) return "sync";
    if (isPlaying) return "pause";
    return "play";
  }, [isYoutubeMode, isLoading, isPlaying]);

  const playButtonStyle = useMemo(
    () => [styles.playButton, isYoutubeMode && styles.youtubeButton],
    [isYoutubeMode]
  );

  const shellScale = useSharedValue(1);

  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shellScale.value }],
  }));

  const onShellPressIn = useCallback(() => {
    shellScale.value = withSpring(0.985, { damping: 18, stiffness: 380 });
  }, [shellScale]);

  const onShellPressOut = useCallback(() => {
    shellScale.value = withSpring(1, { damping: 16, stiffness: 340 });
  }, [shellScale]);

  if (!currentSong && !youtubeVideo) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(220)}
      style={styles.wrapper}
    >
      <AnimatedPressable
        onPress={openPlayer}
        onPressIn={onShellPressIn}
        onPressOut={onShellPressOut}
        style={shellStyle}
      >
        <LinearGradient colors={GRADIENTS.neon} style={styles.border}>
          <BlurView intensity={50} tint="dark" style={styles.container}>
            <View style={styles.sheen} pointerEvents="none" />

            <MiniPlayerArtwork
              cover={cover}
              isYoutubeMode={isYoutubeMode}
              isPlaying={isPlaying}
              trackKey={trackKey}
            />

            <MiniPlayerMetadata
              title={title}
              artist={artist}
              queueLabel={queueLabel}
              badgeIconName={badgeIconName}
              isYoutubeMode={isYoutubeMode}
            />

            {!isYoutubeMode && (
              <MiniControlButton
                accessibilityLabel="Previous track"
                onPress={handlePrevious}
                style={styles.skipButton}
              >
                <Ionicons name="play-skip-back" size={18} color={COLORS.text} />
              </MiniControlButton>
            )}

            {!isYoutubeMode && (
              <MiniControlButton
                accessibilityLabel="Next track"
                onPress={handleNext}
                style={styles.skipButton}
              >
                <Ionicons name="play-skip-forward" size={18} color={COLORS.text} />
              </MiniControlButton>
            )}

            <MiniControlButton
              accessibilityLabel={isYoutubeMode ? "Open video" : "Play or pause"}
              onPress={handleMainButton}
              style={playButtonStyle}
            >
              <Ionicons
                name={mainIconName as any}
                size={isYoutubeMode ? 22 : 23}
                color={isYoutubeMode ? "#fff" : "#000"}
              />
            </MiniControlButton>
          </BlurView>
        </LinearGradient>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default memo(MiniPlayer);

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 82,
    borderRadius: 24,
    overflow: "hidden",
  },

  border: {
    borderRadius: 24,
    padding: 1.2,
  },

  container: {
    height: 78,
    borderRadius: 23,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    backgroundColor: "rgba(5,5,8,0.92)",
  },

  sheen: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    backgroundColor: "rgba(255,255,255,0.028)",
  },

  coverWrap: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },

  coverGlowOuter: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 20,
    overflow: "hidden",
  },

  coverGlowFill: {
    flex: 1,
  },

  coverFrame: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: COLORS.cardLight,
  },

  cover: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.cardLight,
  },

  youtubeCover: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#ff0033",
    alignItems: "center",
    justifyContent: "center",
  },

  liveDot: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: "#000",
  },

  info: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 8,
    minWidth: 0,
  },

  progressSlot: {
    position: "absolute",
    left: 86,
    right: 118,
    bottom: 10,
  },

  badgeRow: {
    height: 15,
    justifyContent: "center",
  },

  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(168,85,247,0.82)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    gap: 4,
  },

  youtubeBadge: {
    backgroundColor: "rgba(255,0,51,0.9)",
  },

  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
  },

  title: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 1,
    letterSpacing: 0,
  },

  artist: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    marginTop: 2,
    fontWeight: "700",
  },

  youtubeNote: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
    fontWeight: "700",
  },

  miniTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },

  miniTimeText: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 9,
    fontWeight: "800",
  },

  progressTrack: {
    height: 4,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginTop: 5,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: COLORS.primary,
  },

  progressGlow: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    backgroundColor: "rgba(192,132,252,0.08)",
  },

  skipButton: {
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  playButton: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  youtubeButton: {
    backgroundColor: "#ff0033",
    shadowColor: "#ff0033",
  },
});
