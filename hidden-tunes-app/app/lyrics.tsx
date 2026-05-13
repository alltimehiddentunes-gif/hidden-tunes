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
  FlatList,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { usePlayer } from "../context/PlayerContext";
import { getHiddenTunesLyrics } from "../services/hiddenTunesApi";

type LyricLine = {
  id: string;
  timeMs: number;
  text: string;
};

const ITEM_HEIGHT = 58;
const LYRICS_SYNC_OFFSET_MS = 2200;
const MAX_LYRIC_CHARS = 34;
const MIN_SCROLL_INDEX_JUMP = 2;
const MIN_ACTIVE_UPDATE_MS = 650;

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

const LyricRow = memo(function LyricRow({
  item,
  active,
  passed,
}: {
  item: LyricLine;
  active: boolean;
  passed: boolean;
}) {
  return (
    <View style={[styles.lineWrap, active && styles.activeLineWrap]}>
      <Text
        style={[
          styles.lineText,
          passed && styles.passedLineText,
          active && styles.activeLineText,
        ]}
      >
        {item.text}
      </Text>
    </View>
  );
});

export default function LyricsScreen() {
  const params = useLocalSearchParams();
  const player = usePlayer() as any;

  const currentSong = player?.currentSong;

  const songId = String(
    params.songId ||
      params.id ||
      currentSong?.id ||
      currentSong?.songId ||
      ""
  );

  const title = String(params.title || currentSong?.title || "Lyrics");

  const artist = String(
    params.artist ||
      currentSong?.artist ||
      currentSong?.artist_name ||
      currentSong?.artistName ||
      "Hidden Tunes"
  );

  const artwork = getArtwork(currentSong, params);

  const playbackPositionMs =
    Number(
      player?.positionMillis ??
        player?.position ??
        player?.positionMs ??
        player?.playbackPosition ??
        0
    ) || 0;

  const durationMs =
    Number(
      player?.durationMillis ??
        player?.duration ??
        player?.durationMs ??
        currentSong?.durationMillis ??
        0
    ) || 0;

  const initialLyrics = useMemo(() => {
    const fromCache = songId ? lyricsMemoryCache.get(songId) : null;

    if (fromCache) return fromCache;

    return getBestLyricsPayload({
      synced_lrc:
        currentSong?.syncedLyrics ||
        currentSong?.synced_lyrics ||
        currentSong?.lrc,
      plain_lyrics: currentSong?.lyrics,
    });
  }, [currentSong, songId]);

  const [loading, setLoading] = useState(
    !initialLyrics.synced && !initialLyrics.plain
  );
  const [error, setError] = useState("");
  const [syncedLrc, setSyncedLrc] = useState(initialLyrics.synced);
  const [plainLyrics, setPlainLyrics] = useState(initialLyrics.plain);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listRef = useRef<FlatList<LyricLine>>(null);
  const lastScrolledIndex = useRef(-1);
  const lastActiveIndex = useRef(-1);
  const lastActiveUpdatePosition = useRef(0);

  useEffect(() => {
    const cached = songId ? lyricsMemoryCache.get(songId) : null;
    const best = cached || initialLyrics;

    setSyncedLrc(best.synced);
    setPlainLyrics(best.plain);
    setError("");
    setLoading(!best.synced && !best.plain);

    lastScrolledIndex.current = -1;
    lastActiveIndex.current = -1;
    lastActiveUpdatePosition.current = 0;
    setActiveIndex(-1);

    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: false,
      });
    });
  }, [songId, initialLyrics]);

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

  const syncedLines = useMemo(() => parseLrc(syncedLrc), [syncedLrc]);
  const plainLines = useMemo(() => plainToLines(plainLyrics), [plainLyrics]);

  const hasSyncedLyrics = syncedLines.length > 0;
  const lines = hasSyncedLyrics ? syncedLines : plainLines;

  useEffect(() => {
    if (!hasSyncedLyrics || !lines.length) return;

    if (
      Math.abs(playbackPositionMs - lastActiveUpdatePosition.current) <
      MIN_ACTIVE_UPDATE_MS
    ) {
      return;
    }

    lastActiveUpdatePosition.current = playbackPositionMs;

    const activePosition = playbackPositionMs + LYRICS_SYNC_OFFSET_MS;
    const nextIndex = findActiveIndex(lines, activePosition);

    if (nextIndex === lastActiveIndex.current) return;

    lastActiveIndex.current = nextIndex;
    setActiveIndex(nextIndex);
  }, [hasSyncedLyrics, lines, playbackPositionMs]);

  useEffect(() => {
    if (!hasSyncedLyrics) return;

    if (playbackPositionMs < 900) {
      lastScrolledIndex.current = -1;
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: false,
      });
      return;
    }

    if (activeIndex < 0) return;
    if (activeIndex === lastScrolledIndex.current) return;

    if (
      lastScrolledIndex.current >= 0 &&
      Math.abs(activeIndex - lastScrolledIndex.current) < MIN_SCROLL_INDEX_JUMP
    ) {
      return;
    }

    lastScrolledIndex.current = activeIndex;

    const centeredIndex = Math.max(0, activeIndex - 3);

    listRef.current?.scrollToOffset({
      offset: centeredIndex * ITEM_HEIGHT,
      animated: false,
    });
  }, [activeIndex, hasSyncedLyrics, playbackPositionMs]);

  const progress =
    durationMs > 0
      ? Math.min(1, Math.max(0, playbackPositionMs / durationMs))
      : 0;

  const renderItem = useCallback(
    ({ item, index }: { item: LyricLine; index: number }) => (
      <LyricRow
        item={item}
        active={hasSyncedLyrics ? index === activeIndex : false}
        passed={hasSyncedLyrics ? index < activeIndex : true}
      />
    ),
    [activeIndex, hasSyncedLyrics]
  );

  return (
    <LinearGradient
      colors={["#050505", "#17110B", "#050505"]}
      style={styles.root}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-down" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTextWrap}>
            <Text style={styles.headerLabel}>Lyrics</Text>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {title}
            </Text>
          </View>

          <View style={styles.iconButton}>
            <Ionicons name="musical-notes" size={21} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.songCard}>
          {artwork ? (
            <Image source={{ uri: String(artwork) }} style={styles.artwork} />
          ) : (
            <LinearGradient
              colors={["#2E1A0B", "#070707"]}
              style={styles.artworkFallback}
            >
              <Ionicons name="musical-note" size={30} color="#F7D77A" />
            </LinearGradient>
          )}

          <View style={styles.songMeta}>
            <Text numberOfLines={1} style={styles.songTitle}>
              {title}
            </Text>
            <Text numberOfLines={1} style={styles.songArtist}>
              {artist}
            </Text>

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
          </View>
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>

          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(playbackPositionMs)}</Text>
            <Text style={styles.timeText}>
              {durationMs ? formatTime(durationMs) : "--:--"}
            </Text>
          </View>
        </View>

        <View style={styles.lyricsPanel}>
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
              <Ionicons name="document-text-outline" size={34} color="#F7D77A" />
              <Text style={styles.centerTitle}>No lyrics found</Text>
              <Text style={styles.centerText}>
                Upload synced LRC or plain lyrics for this song.
              </Text>
            </View>
          ) : (
            <>
              {loading && (
                <View style={styles.loadingPill}>
                  <ActivityIndicator color="#F7D77A" size="small" />
                  <Text style={styles.loadingPillText}>Refreshing lyrics</Text>
                </View>
              )}

              <FlatList
                ref={listRef}
                data={lines}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.lyricsContent}
                removeClippedSubviews={Platform.OS === "android"}
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                windowSize={5}
                updateCellsBatchingPeriod={120}
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? 34 : 0,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
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
    fontSize: 14,
    fontWeight: "800",
    marginTop: 3,
  },
  songCard: {
    marginHorizontal: 18,
    marginTop: 4,
    padding: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.075)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: 15,
    backgroundColor: "#111",
  },
  artworkFallback: {
    width: 56,
    height: 56,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  songMeta: {
    flex: 1,
    marginLeft: 11,
  },
  songTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  songArtist: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },
  syncBadge: {
    alignSelf: "flex-start",
    marginTop: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  },
  progressWrap: {
    marginHorizontal: 22,
    marginTop: 12,
  },
  progressBar: {
    height: 4,
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
    marginTop: 7,
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
    marginTop: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "rgba(0,0,0,0.34)",
    overflow: "hidden",
  },
  lyricsContent: {
    paddingTop: 95,
    paddingBottom: 140,
    paddingHorizontal: 24,
  },
  lineWrap: {
    height: ITEM_HEIGHT,
    justifyContent: "center",
  },
  activeLineWrap: {
    paddingLeft: 3,
  },
  lineText: {
    color: "rgba(255,255,255,0.34)",
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  passedLineText: {
    color: "rgba(255,255,255,0.50)",
  },
  activeLineText: {
    color: "#F7D77A",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
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
    zIndex: 10,
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
});