import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import {
  getBestLyricsPayload,
  getLyricsMemoryCache,
  getLyricsSyncOffset,
  LYRICS_ITEM_HEIGHT,
  LYRICS_SYNC_OFFSET_MS,
  resolveLyricsDisplay,
  setLyricsMemoryCache,
  findActiveLyricIndex,
  formatLyricsTime,
  type LyricLine,
} from "../utils/lyrics";

import LyricsEmptyState from "../components/LyricsEmptyState";
import AppShell from "../components/navigation/AppShell";
import { TESTER_COPY } from "../constants/testerExperience";
import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerProgress,
} from "../context/playerContextSlices";
import { getHiddenTunesLyrics } from "../services/hiddenTunesApi";

const MANUAL_SCROLL_RESUME_MS = 4000;

function getArtwork(song: any, params: any) {
  return (
    song?.artwork ||
    song?.cover ||
    song?.thumbnail ||
    song?.cover_url ||
    song?.artwork_url ||
    params.artwork ||
    params.cover ||
    undefined
  );
}

function findActiveIndex(lines: LyricLine[], activePosition: number) {
  return findActiveLyricIndex(lines, activePosition);
}

type LyricRowProps = {
  item: LyricLine;
  active: boolean;
  passed: boolean;
  upcoming: boolean;
  seekable: boolean;
  onPressLine?: (line: LyricLine) => void;
};

const LyricRow = memo(
  function LyricRow({
    item,
    active,
    passed,
    upcoming,
    seekable,
    onPressLine,
  }: LyricRowProps) {
    const scaleAnim = useRef(new Animated.Value(active ? 1.04 : 1)).current;
    const glowAnim = useRef(new Animated.Value(active ? 1 : 0)).current;

    useEffect(() => {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: active ? 1.04 : 1,
          friction: 9,
          tension: 70,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: active ? 1 : 0,
          duration: active ? 280 : 180,
          useNativeDriver: true,
        }),
      ]).start();
    }, [active, glowAnim, scaleAnim]);

    const content = (
      <Animated.View
        style={[
          styles.lineWrap,
          active && styles.activeLineWrap,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeGlow,
            {
              opacity: glowAnim,
            },
          ]}
        />
        <Text
          style={[
            styles.lineText,
            upcoming && styles.upcomingLineText,
            passed && styles.passedLineText,
            active && styles.activeLineText,
          ]}
        >
          {item.text}
        </Text>
      </Animated.View>
    );

    if (!seekable || !onPressLine) {
      return content;
    }

    return (
      <Pressable
        onPress={() => onPressLine(item)}
        style={styles.linePressable}
        android_ripple={{ color: "rgba(247,215,122,0.12)" }}
      >
        {content}
      </Pressable>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.active === next.active &&
    prev.passed === next.passed &&
    prev.upcoming === next.upcoming &&
    prev.seekable === next.seekable
);

function CinematicBackground({ artwork }: { artwork?: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {artwork ? (
        <Image
          source={{ uri: String(artwork) }}
          style={styles.backgroundArt}
          blurRadius={Platform.OS === "android" ? 28 : 0}
        />
      ) : (
        <LinearGradient
          colors={["#1A0F24", "#050505", "#120A18"]}
          style={StyleSheet.absoluteFill}
        />
      )}

      {Platform.OS === "ios" && artwork ? (
        <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}

      <LinearGradient
        colors={[
          "rgba(5,5,8,0.55)",
          "rgba(5,5,8,0.82)",
          "rgba(5,5,8,0.94)",
          "rgba(5,5,8,0.98)",
        ]}
        locations={[0, 0.35, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={[
          "rgba(168,85,247,0.14)",
          "transparent",
          "rgba(247,215,122,0.08)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ambientGradient}
      />

      <View style={styles.vignetteTop} />
      <View style={styles.vignetteBottom} />
    </View>
  );
}

export default function LyricsScreen() {
  const params = useLocalSearchParams();
  const { seekTo } = usePlayerActions();
  const { currentSong } = usePlayerNowPlaying();
  const { positionMillis, durationMillis } = usePlayerProgress();

  const { height: screenHeight } = useWindowDimensions();

  const songId = String(
    params.songId ||
      params.id ||
      currentSong?.id ||
      (currentSong as any)?.songId ||
      ""
  );

  const title = String(params.title || currentSong?.title || "Lyrics");

  const artist = String(
    params.artist ||
      currentSong?.artist ||
      (currentSong as any)?.artist_name ||
      (currentSong as any)?.artistName ||
      "Hidden Tunes"
  );

  const artwork = getArtwork(currentSong, params);

  const playbackPositionMs = Number(positionMillis || 0);
  const durationMs = Number(durationMillis || 0);

  const centerPadding = useMemo(
    () => Math.max(140, screenHeight * 0.28 - LYRICS_ITEM_HEIGHT / 2),
    [screenHeight]
  );

  const initialLyrics = useMemo(() => {
    const fromCache = songId ? getLyricsMemoryCache(songId) : null;
    if (fromCache) return fromCache;

    const fromParams = getBestLyricsPayload({
      synced_lrc: params.syncedLyrics,
      plain_lyrics: params.plainLyrics || params.lyrics,
    });

    if (fromParams.synced || fromParams.plain) return fromParams;

    return getBestLyricsPayload({
      synced_lrc:
        (currentSong as any)?.syncedLyrics ||
        (currentSong as any)?.synced_lyrics ||
        (currentSong as any)?.lrc,
      plain_lyrics: (currentSong as any)?.lyrics,
    });
  }, [currentSong, params.lyrics, params.plainLyrics, params.syncedLyrics, songId]);

  const [loading, setLoading] = useState(
    !initialLyrics.synced && !initialLyrics.plain
  );
  const [error, setError] = useState("");
  const [syncedLrc, setSyncedLrc] = useState(initialLyrics.synced);
  const [plainLyrics, setPlainLyrics] = useState(initialLyrics.plain);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [userScrolledAway, setUserScrolledAway] = useState(false);

  const listRef = useRef<FlatList<LyricLine>>(null);
  const activeIndexRef = useRef(-1);
  const lastScrolledIndexRef = useRef(-1);
  const userScrolledRef = useRef(false);
  const resumeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollAnimFrameRef = useRef<number | null>(null);

  const clearResumeSyncTimer = useCallback(() => {
    if (resumeSyncTimerRef.current) {
      clearTimeout(resumeSyncTimerRef.current);
      resumeSyncTimerRef.current = null;
    }
  }, []);

  const scrollToActiveLine = useCallback(
    (index: number, animated = true) => {
      if (index < 0) return;

      if (scrollAnimFrameRef.current !== null) {
        cancelAnimationFrame(scrollAnimFrameRef.current);
      }

      scrollAnimFrameRef.current = requestAnimationFrame(() => {
        scrollAnimFrameRef.current = null;
        listRef.current?.scrollToOffset({
          offset: Math.max(0, index * LYRICS_ITEM_HEIGHT),
          animated,
        });
      });
    },
    []
  );

  const resumeLiveSync = useCallback(() => {
    userScrolledRef.current = false;
    setUserScrolledAway(false);
    clearResumeSyncTimer();

    if (activeIndexRef.current >= 0) {
      lastScrolledIndexRef.current = -1;
      scrollToActiveLine(activeIndexRef.current, true);
    }
  }, [clearResumeSyncTimer, scrollToActiveLine]);

  useEffect(() => {
    const cached = songId ? getLyricsMemoryCache(songId) : null;
    const best = cached || initialLyrics;

    setSyncedLrc(best.synced);
    setPlainLyrics(best.plain);
    setError("");
    setLoading(!best.synced && !best.plain);

    if (songId && (best.synced || best.plain)) {
      setLyricsMemoryCache(songId, best);
    }

    activeIndexRef.current = -1;
    lastScrolledIndexRef.current = -1;
    userScrolledRef.current = false;
    setUserScrolledAway(false);
    setActiveIndex(-1);
    clearResumeSyncTimer();

    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [songId, initialLyrics, clearResumeSyncTimer]);

  useEffect(() => {
    let mounted = true;

    async function loadLyrics() {
      if (!songId) {
        setLoading(false);
        setError("Missing song ID.");
        return;
      }

      const cached = getLyricsMemoryCache(songId);

      if (cached?.synced || cached?.plain) {
        setSyncedLrc(cached.synced);
        setPlainLyrics(cached.plain);
        setLoading(false);
        return;
      }

      try {
        setError("");

        const data = await getHiddenTunesLyrics(songId);
        const best = getBestLyricsPayload(data);

        setLyricsMemoryCache(songId, best);

        if (!mounted) return;

        setSyncedLrc(best.synced);
        setPlainLyrics(best.plain);

        if (data.fetchFailed && !best.synced && !best.plain) {
          setError(TESTER_COPY.lyricsLoadFailed);
        }
      } catch (err: any) {
        if (!mounted) return;
        setError(TESTER_COPY.lyricsLoadFailed);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadLyrics();

    return () => {
      mounted = false;
    };
  }, [songId]);

  useEffect(() => {
    return () => {
      clearResumeSyncTimer();
      if (scrollAnimFrameRef.current !== null) {
        cancelAnimationFrame(scrollAnimFrameRef.current);
      }
    };
  }, [clearResumeSyncTimer]);

  const lyricsDisplay = useMemo(
    () => resolveLyricsDisplay(syncedLrc, plainLyrics),
    [plainLyrics, syncedLrc]
  );

  const { mode: lyricsMode, lines, hasSyncedLyrics } = lyricsDisplay;
  const isSeekable = lyricsMode === "synced";
  const hasTimedLyrics = lyricsMode !== "none";

  useEffect(() => {
    if (!hasTimedLyrics || !lines.length) return;

    const activePosition =
      playbackPositionMs + getLyricsSyncOffset(lyricsMode);
    const nextIndex = findActiveIndex(lines, activePosition);

    if (nextIndex === activeIndexRef.current) return;

    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  }, [hasTimedLyrics, lines, lyricsMode, playbackPositionMs]);

  useEffect(() => {
    if (!hasTimedLyrics) return;

    if (hasSyncedLyrics && playbackPositionMs < 900) {
      lastScrolledIndexRef.current = -1;
      activeIndexRef.current = 0;
      setActiveIndex(0);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      return;
    }

    if (userScrolledRef.current) return;
    if (activeIndex < 0) return;
    if (activeIndex === lastScrolledIndexRef.current) return;

    lastScrolledIndexRef.current = activeIndex;
    scrollToActiveLine(activeIndex, true);
  }, [
    activeIndex,
    hasSyncedLyrics,
    hasTimedLyrics,
    playbackPositionMs,
    scrollToActiveLine,
  ]);

  const handleLinePress = useCallback(
    (line: LyricLine) => {
      if (!isSeekable) return;

      const targetMs = Math.max(0, line.timeMs - LYRICS_SYNC_OFFSET_MS);
      void seekTo(targetMs);
      resumeLiveSync();
    },
    [isSeekable, resumeLiveSync, seekTo]
  );

  const handleScrollBeginDrag = useCallback(() => {
    userScrolledRef.current = true;
    setUserScrolledAway(true);
    clearResumeSyncTimer();
  }, [clearResumeSyncTimer]);

  const handleScrollEndDrag = useCallback(() => {
    clearResumeSyncTimer();
    resumeSyncTimerRef.current = setTimeout(() => {
      resumeLiveSync();
    }, MANUAL_SCROLL_RESUME_MS);
  }, [clearResumeSyncTimer, resumeLiveSync]);

  const progress =
    durationMs > 0
      ? Math.min(1, Math.max(0, playbackPositionMs / durationMs))
      : 0;

  const listExtraData = useMemo(
    () => ({
      activeIndex,
      hasTimedLyrics,
      lyricsMode,
    }),
    [activeIndex, hasTimedLyrics, lyricsMode]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LyricLine; index: number }) => {
      const active = hasTimedLyrics && index === activeIndex;
      const passed = hasTimedLyrics && index < activeIndex;
      const upcoming = hasTimedLyrics && index > activeIndex;

      return (
        <LyricRow
          item={item}
          active={active}
          passed={passed}
          upcoming={upcoming}
          seekable={isSeekable}
          onPressLine={handleLinePress}
        />
      );
    },
    [activeIndex, handleLinePress, hasTimedLyrics, isSeekable]
  );

  const lyricsContentStyle = useMemo(
    () => [
      styles.lyricsContent,
      {
        paddingTop: centerPadding,
        paddingBottom: centerPadding,
      },
    ],
    [centerPadding]
  );

  return (
    <AppShell>
      <View style={styles.root}>
      <CinematicBackground artwork={artwork} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-down" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTextWrap}>
            <Text style={styles.headerLabel}>Lyrics</Text>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {title}
            </Text>
            <Text numberOfLines={1} style={styles.headerArtist}>
              {artist}
            </Text>
          </View>

          <View style={styles.iconButton}>
            <Ionicons name="musical-notes" size={21} color="#F7D77A" />
          </View>
        </View>

        <View style={styles.metaRow}>
          {hasTimedLyrics ? (
            <View
              style={[
                styles.syncBadge,
                !hasSyncedLyrics && styles.syncBadgePlain,
              ]}
            >
              <Ionicons
                name={hasSyncedLyrics ? "radio" : "document-text"}
                size={12}
                color={hasSyncedLyrics ? "#101010" : "#F7D77A"}
              />
              <Text
                style={[
                  styles.syncBadgeText,
                  !hasSyncedLyrics && styles.syncBadgeTextPlain,
                ]}
              >
                {hasSyncedLyrics ? "Live synced" : "Plain lyrics"}
              </Text>
            </View>
          ) : null}

          <View style={styles.progressWrap}>
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${progress * 100}%` }]}
              />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>
                {formatLyricsTime(playbackPositionMs)}
              </Text>
              <Text style={styles.timeText}>
                {durationMs ? formatLyricsTime(durationMs) : "--:--"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.lyricsPanel}>
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.55)"]}
            style={styles.lyricsPanelFade}
            pointerEvents="none"
          />

          {loading && !lines.length ? (
            <View style={styles.centerState}>
              <ActivityIndicator color="#F7D77A" />
              <Text style={styles.centerText}>Loading lyrics...</Text>
            </View>
          ) : error && !lines.length ? (
            <LyricsEmptyState
              variant="error"
              title="Lyrics unavailable"
              message={error}
            />
          ) : !lines.length ? (
            <LyricsEmptyState />
          ) : (
            <>
              {loading ? (
                <View style={styles.loadingPill}>
                  <ActivityIndicator color="#F7D77A" size="small" />
                  <Text style={styles.loadingPillText}>Refreshing lyrics</Text>
                </View>
              ) : null}

              {userScrolledAway && hasTimedLyrics ? (
                <TouchableOpacity
                  style={styles.syncPill}
                  onPress={resumeLiveSync}
                  activeOpacity={0.9}
                >
                  <Ionicons name="locate" size={14} color="#101010" />
                  <Text style={styles.syncPillText}>Back to live lyrics</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.centerGuide} pointerEvents="none">
                <View style={styles.centerGuideLine} />
              </View>

              <FlatList
                ref={listRef}
                data={lines}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                extraData={listExtraData}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={lyricsContentStyle}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScrollEndDrag={handleScrollEndDrag}
                onMomentumScrollEnd={handleScrollEndDrag}
                removeClippedSubviews={Platform.OS === "android"}
                initialNumToRender={14}
                maxToRenderPerBatch={10}
                windowSize={7}
                updateCellsBatchingPeriod={80}
                decelerationRate="fast"
                getItemLayout={(_, index) => ({
                  length: LYRICS_ITEM_HEIGHT,
                  offset: LYRICS_ITEM_HEIGHT * index,
                  index,
                })}
              />
            </>
          )}
        </View>
        </SafeAreaView>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050508",
  },

  backgroundArt: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    width: "100%",
    height: "100%",
    transform: [{ scale: 1.12 }],
    opacity: 0.72,
  },

  ambientGradient: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },

  vignetteTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  vignetteBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  safe: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? 34 : 0,
  },

  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  headerTextWrap: {
    flex: 1,
    paddingHorizontal: 14,
    alignItems: "center",
  },

  headerLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },

  headerTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },

  headerArtist: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },

  metaRow: {
    paddingHorizontal: 22,
    paddingBottom: 8,
    gap: 10,
  },

  syncBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F7D77A",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  syncBadgePlain: {
    backgroundColor: "rgba(247,215,122,0.12)",
    borderWidth: 1,
    borderColor: "rgba(247,215,122,0.28)",
  },

  syncBadgeText: {
    color: "#101010",
    fontSize: 10,
    fontWeight: "900",
  },

  syncBadgeTextPlain: {
    color: "#F7D77A",
  },

  progressWrap: {
    gap: 6,
  },

  progressBar: {
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#F7D77A",
  },

  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  timeText: {
    color: "rgba(255,255,255,0.50)",
    fontSize: 11,
    fontWeight: "700",
  },

  lyricsPanel: {
    flex: 1,
    marginTop: 4,
    overflow: "hidden",
  },

  lyricsPanelFade: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    zIndex: 1,
  },

  centerGuide: {
    position: "absolute",
    left: 24,
    right: 24,
    top: "50%",
    marginTop: -1,
    zIndex: 2,
    alignItems: "center",
  },

  centerGuideLine: {
    width: "42%",
    height: 1,
    borderRadius: 999,
    backgroundColor: "rgba(247,215,122,0.18)",
  },

  lyricsContent: {
    paddingHorizontal: 28,
  },

  linePressable: {
    width: "100%",
  },

  lineWrap: {
    height: LYRICS_ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },

  activeLineWrap: {
    zIndex: 2,
  },

  activeGlow: {
    position: "absolute",
    left: "8%",
    right: "8%",
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(247,215,122,0.16)",
    shadowColor: "#F7D77A",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },

  lineText: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.2,
    textAlign: "center",
  },

  upcomingLineText: {
    color: "rgba(255,255,255,0.34)",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },

  passedLineText: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },

  activeLineText: {
    color: "#FFF4C8",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(247,215,122,0.85)",
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },

  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    zIndex: 3,
  },

  centerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 12,
    textAlign: "center",
  },

  centerText: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 10,
    textAlign: "center",
    lineHeight: 21,
  },

  loadingPill: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    zIndex: 12,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.68)",
    borderWidth: 1,
    borderColor: "rgba(247,215,122,0.22)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  loadingPillText: {
    color: "#F7D77A",
    fontSize: 11,
    fontWeight: "900",
  },

  syncPill: {
    position: "absolute",
    bottom: 22,
    alignSelf: "center",
    zIndex: 12,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "#F7D77A",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    shadowColor: "#F7D77A",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  syncPillText: {
    color: "#101010",
    fontSize: 12,
    fontWeight: "900",
  },
});
