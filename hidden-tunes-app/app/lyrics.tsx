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
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerProgress,
} from "../context/playerContextSlices";
import { getHiddenTunesLyrics } from "../services/hiddenTunesApi";

type LyricLine = {
  id: string;
  timeMs: number;
  text: string;
};

const ITEM_HEIGHT = 64;
const LYRICS_SYNC_OFFSET_MS = -350;
const MAX_LYRIC_CHARS = 34;
const MANUAL_SCROLL_RESUME_MS = 4000;

const lyricsMemoryCache = new Map<
  string,
  {
    synced: string;
    plain: string;
  }
>();

function splitLyricText(text: string) {
  const clean = String(text || "").trim();
  if (!clean) return [];

  const words = clean.split(/\s+/);
  const chunks: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;

    if (next.length > MAX_LYRIC_CHARS && current) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) chunks.push(current);
  return chunks;
}

function parseLrc(lrc: string): LyricLine[] {
  if (!lrc) return [];

  const lines: LyricLine[] = [];

  lrc.split(/\r?\n/).forEach((row, rowIndex) => {
    const timeMatches = [
      ...row.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g),
    ];

    const text = row.replace(/\[(.*?)\]/g, "").trim();

    if (!timeMatches.length || !text) return;

    timeMatches.forEach((match, matchIndex) => {
      const minutes = Number(match[1] || 0);
      const seconds = Number(match[2] || 0);
      const raw = match[3] || "0";

      const fraction =
        raw.length === 1
          ? Number(raw) * 100
          : raw.length === 2
            ? Number(raw) * 10
            : Number(raw.slice(0, 3));

      const baseTime = minutes * 60 * 1000 + seconds * 1000 + fraction;
      const chunks = splitLyricText(text);

      chunks.forEach((chunk, chunkIndex) => {
        lines.push({
          id: `${rowIndex}-${matchIndex}-${chunkIndex}-${baseTime}`,
          timeMs: baseTime + chunkIndex * 120,
          text: chunk,
        });
      });
    });
  });

  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

function plainToLines(plainLyrics: string): LyricLine[] {
  if (!plainLyrics) return [];

  const visualLines: LyricLine[] = [];

  plainLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const chunks = splitLyricText(line);

      chunks.forEach((chunk, chunkIndex) => {
        visualLines.push({
          id: `plain-${index}-${chunkIndex}`,
          text: chunk,
          timeMs: index * 4000 + chunkIndex * 250,
        });
      });
    });

  return visualLines;
}

function getBestLyricsPayload(data: any) {
  return {
    synced: String(
      data?.synced_lrc ||
        data?.syncedLrc ||
        data?.syncedLyrics ||
        data?.lrc ||
        data?.lyrics_lrc ||
        ""
    ),
    plain: String(data?.plain_lyrics || data?.plainLyrics || data?.lyrics || ""),
  };
}

function formatTime(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

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
  if (!lines.length) return -1;

  let low = 0;
  let high = lines.length - 1;
  let answer = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (activePosition >= lines[mid].timeMs) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return answer;
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
    () => Math.max(140, screenHeight * 0.28 - ITEM_HEIGHT / 2),
    [screenHeight]
  );

  const initialLyrics = useMemo(() => {
    const fromCache = songId ? lyricsMemoryCache.get(songId) : null;

    if (fromCache) return fromCache;

    return getBestLyricsPayload({
      synced_lrc:
        (currentSong as any)?.syncedLyrics ||
        (currentSong as any)?.synced_lyrics ||
        (currentSong as any)?.lrc,
      plain_lyrics: (currentSong as any)?.lyrics,
    });
  }, [currentSong, songId]);

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
          offset: Math.max(0, index * ITEM_HEIGHT),
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
    const cached = songId ? lyricsMemoryCache.get(songId) : null;
    const best = cached || initialLyrics;

    setSyncedLrc(best.synced);
    setPlainLyrics(best.plain);
    setError("");
    setLoading(!best.synced && !best.plain);

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

      const cached = lyricsMemoryCache.get(songId);

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

        lyricsMemoryCache.set(songId, best);

        if (!mounted) return;

        setSyncedLrc(best.synced);
        setPlainLyrics(best.plain);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "Could not load lyrics.");
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

  const syncedLines = useMemo(() => parseLrc(syncedLrc), [syncedLrc]);
  const plainLines = useMemo(() => plainToLines(plainLyrics), [plainLyrics]);

  const hasSyncedLyrics = syncedLines.length > 0;
  const lines = hasSyncedLyrics ? syncedLines : plainLines;

  useEffect(() => {
    if (!hasSyncedLyrics || !lines.length) return;

    const activePosition = playbackPositionMs + LYRICS_SYNC_OFFSET_MS;
    const nextIndex = findActiveIndex(lines, activePosition);

    if (nextIndex === activeIndexRef.current) return;

    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  }, [hasSyncedLyrics, lines, playbackPositionMs]);

  useEffect(() => {
    if (!hasSyncedLyrics) return;

    if (playbackPositionMs < 900) {
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
    playbackPositionMs,
    scrollToActiveLine,
  ]);

  const handleLinePress = useCallback(
    (line: LyricLine) => {
      if (!hasSyncedLyrics) return;

      const targetMs = Math.max(0, line.timeMs - LYRICS_SYNC_OFFSET_MS);
      void seekTo(targetMs);
      resumeLiveSync();
    },
    [hasSyncedLyrics, resumeLiveSync, seekTo]
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
      hasSyncedLyrics,
    }),
    [activeIndex, hasSyncedLyrics]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LyricLine; index: number }) => {
      const active = hasSyncedLyrics && index === activeIndex;
      const passed = hasSyncedLyrics && index < activeIndex;
      const upcoming = hasSyncedLyrics && index > activeIndex;

      return (
        <LyricRow
          item={item}
          active={active}
          passed={passed}
          upcoming={upcoming}
          seekable={hasSyncedLyrics}
          onPressLine={handleLinePress}
        />
      );
    },
    [activeIndex, handleLinePress, hasSyncedLyrics]
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
          <View style={styles.syncBadge}>
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

          <View style={styles.progressWrap}>
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${progress * 100}%` }]}
              />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>
                {formatTime(playbackPositionMs)}
              </Text>
              <Text style={styles.timeText}>
                {durationMs ? formatTime(durationMs) : "--:--"}
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
            <View style={styles.centerState}>
              <Ionicons name="alert-circle" size={34} color="#F7D77A" />
              <Text style={styles.centerTitle}>Lyrics unavailable</Text>
              <Text style={styles.centerText}>{error}</Text>
            </View>
          ) : !lines.length ? (
            <View style={styles.centerState}>
              <Ionicons
                name="document-text-outline"
                size={34}
                color="#F7D77A"
              />
              <Text style={styles.centerTitle}>No lyrics found</Text>
              <Text style={styles.centerText}>
                Upload synced LRC or plain lyrics for this song.
              </Text>
            </View>
          ) : (
            <>
              {loading ? (
                <View style={styles.loadingPill}>
                  <ActivityIndicator color="#F7D77A" size="small" />
                  <Text style={styles.loadingPillText}>Refreshing lyrics</Text>
                </View>
              ) : null}

              {userScrolledAway && hasSyncedLyrics ? (
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
                  length: ITEM_HEIGHT,
                  offset: ITEM_HEIGHT * index,
                  index,
                })}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050508",
  },

  backgroundArt: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    transform: [{ scale: 1.12 }],
    opacity: 0.72,
  },

  ambientGradient: {
    ...StyleSheet.absoluteFillObject,
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

  syncBadgeText: {
    color: "#101010",
    fontSize: 10,
    fontWeight: "900",
  },

  syncBadgeTextPlain: {
    color: "#F7D77A",
    backgroundColor: "rgba(247,215,122,0.12)",
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
    ...StyleSheet.absoluteFillObject,
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
    height: ITEM_HEIGHT,
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
