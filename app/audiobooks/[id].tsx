import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { COLORS } from "../../constants/theme";
import { useAudiobookPlaybackActions } from "../../hooks/useAudiobookPlayback";
import { usePlayerState } from "../../context/PlayerContext";
import {
  fetchAudiobookChapterQueuePlay,
  fetchAudiobookDetail,
  formatAudiobookDuration,
} from "../../services/audiobooksApi";
import type { AudiobookChapter, AudiobookDetail } from "../../types/audiobooks";
import { playAudiobookChapterQueue } from "../../utils/audiobookPlayback";
import {
  isAudiobookChapterAppSong,
} from "../../utils/audiobookPlaybackAdapter";

function hasAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

const ChapterRow = memo(function ChapterRow({
  chapter,
  isPlaying,
  isLoading,
  onPress,
}: {
  chapter: AudiobookChapter;
  isPlaying: boolean;
  isLoading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={[styles.chapterRow, isPlaying && styles.chapterRowActive]}
      onPress={onPress}
      disabled={isLoading}
    >
      <View style={[styles.chapterBadge, isPlaying && styles.chapterBadgeActive]}>
        {isLoading ? (
          <ActivityIndicator size="small" color={isPlaying ? "#00130D" : COLORS.primary} />
        ) : isPlaying ? (
          <Ionicons name="volume-high" size={16} color="#00130D" />
        ) : (
          <Text style={styles.chapterNumber}>
            {chapter.chapter_number ? String(chapter.chapter_number) : "-"}
          </Text>
        )}
      </View>
      <View style={styles.chapterCopy}>
        <Text numberOfLines={2} style={[styles.chapterTitle, isPlaying && styles.chapterTitleActive]}>
          {chapter.title}
        </Text>
        <Text style={styles.chapterMeta}>
          {formatAudiobookDuration(chapter.duration_seconds) || "Chapter"}
        </Text>
      </View>
      <Ionicons
        name={isPlaying ? "pause-circle" : "play-circle"}
        size={24}
        color={isPlaying ? COLORS.primary : COLORS.textMuted}
      />
    </TouchableOpacity>
  );
});

export default function AudiobookDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const audiobookId = String(params.id || "").trim();
  const { playSong, seekTo } = useAudiobookPlaybackActions();
  const { currentSong } = usePlayerState();
  const [detail, setDetail] = useState<AudiobookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [playError, setPlayError] = useState(false);
  const [loadingChapterId, setLoadingChapterId] = useState<string | null>(null);
  const playControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!audiobookId) {
      setLoading(false);
      setError(true);
      return undefined;
    }

    const controller = new AbortController();
    playControllerRef.current?.abort();
    setLoading(true);
    setError(false);

    void fetchAudiobookDetail(audiobookId, controller.signal)
      .then(setDetail)
      .catch((loadError) => {
        if (hasAbortError(loadError)) return;
        setDetail(null);
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [audiobookId]);

  useEffect(
    () => () => {
      playControllerRef.current?.abort();
    },
    []
  );

  const audiobook = detail?.audiobook;
  const chapters = detail?.chapters || [];
  const firstChapter = chapters[0] || null;
  const activeChapterId = useMemo(() => {
    if (!isAudiobookChapterAppSong(currentSong)) return null;
    const id = String(currentSong?.id || "");
    return id.startsWith("audiobook-chapter-")
      ? id.slice("audiobook-chapter-".length)
      : null;
  }, [currentSong]);

  const meta = useMemo(
    () =>
      [
        audiobook?.author_name,
        formatAudiobookDuration(audiobook?.duration_seconds),
        audiobook?.chapter_count ? `${audiobook.chapter_count} chapters` : null,
        audiobook?.language?.toUpperCase(),
      ]
        .filter(Boolean)
        .join(" · "),
    [audiobook]
  );

  const playChapter = useCallback(
    async (chapterId: string, startPositionMillis = 0) => {
      if (!audiobookId || !audiobook || !chapterId || loadingChapterId) return;

      playControllerRef.current?.abort();
      const controller = new AbortController();
      playControllerRef.current = controller;
      setLoadingChapterId(chapterId);
      setPlayError(false);

      try {
        const queue = await fetchAudiobookChapterQueuePlay(
          audiobookId,
          chapterId,
          controller.signal
        );
        if (controller.signal.aborted) return;

        const result = await playAudiobookChapterQueue({
          book: queue.audiobook,
          chapters: queue.chapters,
          startChapterId: chapterId,
          playSong,
          seekTo,
          startPositionMillis,
        });

        if (!result.ok) {
          setPlayError(true);
          return;
        }

        router.push("/player" as any);
      } catch (playLoadError) {
        if (hasAbortError(playLoadError)) return;
        setPlayError(true);
      } finally {
        if (!controller.signal.aborted) setLoadingChapterId(null);
        if (playControllerRef.current === controller) {
          playControllerRef.current = null;
        }
      }
    },
    [audiobook, audiobookId, loadingChapterId, playSong, seekTo]
  );

  const playFromBeginning = useCallback(() => {
    if (!firstChapter) return;
    void playChapter(firstChapter.id, 0);
  }, [firstChapter, playChapter]);

  const renderChapter = useCallback(
    ({ item }: { item: AudiobookChapter }) => (
      <ChapterRow
        chapter={item}
        isPlaying={activeChapterId === item.id}
        isLoading={loadingChapterId === item.id}
        onPress={() => void playChapter(item.id, 0)}
      />
    ),
    [activeChapterId, loadingChapterId, playChapter]
  );

  const listHeader = useMemo(
    () => (
      <View>
        <View style={styles.topBar}>
          <TouchableOpacity
            activeOpacity={0.84}
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.kicker}>AUDIOBOOK</Text>
        </View>

        {audiobook ? (
          <>
            <View style={styles.hero}>
              <View style={styles.coverAura} pointerEvents="none" />
              <View style={styles.coverWrap}>
                {audiobook.cover_url ? (
                  <Image
                    source={{ uri: audiobook.cover_url }}
                    style={styles.coverImage}
                    contentFit="cover"
                    transition={120}
                    recyclingKey={audiobook.id}
                  />
                ) : (
                  <Ionicons name="book-outline" size={42} color={COLORS.primary} />
                )}
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.title}>{audiobook.title}</Text>
                {audiobook.subtitle ? (
                  <Text style={styles.subtitle}>{audiobook.subtitle}</Text>
                ) : null}
                {meta ? <Text style={styles.meta}>{meta}</Text> : null}
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.playButton}
              onPress={playFromBeginning}
              disabled={!firstChapter || Boolean(loadingChapterId)}
            >
              {loadingChapterId && firstChapter && loadingChapterId === firstChapter.id ? (
                <ActivityIndicator color="#00130D" />
              ) : (
                <Ionicons name="play" size={18} color="#00130D" />
              )}
              <Text style={styles.playButtonText}>Play From Beginning</Text>
            </TouchableOpacity>

            {playError ? (
              <Text style={styles.playStatus}>This chapter could not be played right now.</Text>
            ) : null}

            {audiobook.description ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={styles.description}>{audiobook.description}</Text>
              </View>
            ) : null}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Chapters</Text>
              <Text style={styles.sectionMeta}>{chapters.length} total</Text>
            </View>
          </>
        ) : null}
      </View>
    ),
    [
      audiobook,
      chapters.length,
      firstChapter,
      loadingChapterId,
      meta,
      playError,
      playFromBeginning,
    ]
  );

  if (loading) {
    return (
      <LinearGradient colors={["#101514", "#050706"]} style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </LinearGradient>
    );
  }

  if (error || !audiobook) {
    return (
      <LinearGradient colors={["#101514", "#050706"]} style={styles.container}>
        <View style={styles.centerState}>
          <Ionicons name="book-outline" size={30} color={COLORS.textMuted} />
          <Text style={styles.stateText}>This audiobook could not be loaded.</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#101514", "#050706"]} style={styles.container}>
      <FlatList
        data={chapters}
        keyExtractor={(item) => item.id}
        renderItem={renderChapter}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews
        ListEmptyComponent={
          <Text style={styles.stateText}>No chapter metadata available.</Text>
        }
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingTop: 62,
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  kicker: {
    marginLeft: 14,
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  hero: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  coverAura: {
    position: "absolute",
    left: 8,
    top: 8,
    width: 118,
    height: 118,
    borderRadius: 16,
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  coverWrap: {
    width: 118,
    height: 118,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  heroCopy: {
    flex: 1,
    marginLeft: 18,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 8,
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    marginTop: 10,
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },
  playButton: {
    marginTop: 24,
    minHeight: 52,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
  },
  playButtonText: {
    color: "#00130D",
    fontSize: 15,
    fontWeight: "900",
  },
  playStatus: {
    marginTop: 10,
    color: "#fca5a5",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  section: {
    marginTop: 28,
  },
  sectionHeader: {
    marginTop: 28,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  description: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  chapterRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  chapterRowActive: {
    backgroundColor: "rgba(168,85,247,0.14)",
    borderColor: "rgba(168,85,247,0.34)",
  },
  chapterBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chapterBadgeActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chapterNumber: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  chapterCopy: {
    flex: 1,
    marginHorizontal: 12,
  },
  chapterTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  chapterTitleActive: {
    color: COLORS.primaryGlow,
  },
  chapterMeta: {
    marginTop: 4,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  stateText: {
    marginTop: 10,
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
});
