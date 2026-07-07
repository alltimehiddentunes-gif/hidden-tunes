import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
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
import { usePlaybackRouter } from "../../hooks/usePlaybackRouter";
import {
  fetchAudiobookDetail,
  fetchAudiobookPlay,
  formatAudiobookDuration,
} from "../../services/audiobooksApi";
import type { AudiobookDetail, AudiobookPlayResponse } from "../../types/audiobooks";
import type { PodcastEpisode } from "../../types/podcast";

function hasAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function toPlayableAudiobook(
  play: AudiobookPlayResponse,
  audiobookId: string,
  metadata?: AudiobookDetail["audiobook"]
): PodcastEpisode {
  const showTitle =
    metadata?.author_name || metadata?.series_title || "Hidden Tunes Audiobooks";
  const id = play.audiobook_id || metadata?.id || audiobookId;

  return {
    id,
    showId: id,
    showTitle,
    publisher: metadata?.publisher || showTitle,
    title: play.title || metadata?.title || "Hidden Tunes Audiobook",
    description: metadata?.description || "",
    artworkUrl: metadata?.cover_url || "",
    audioUrl: play.audio_url,
    durationSeconds: play.file?.duration_seconds || metadata?.duration_seconds || undefined,
    publishedAt: metadata?.published_at || undefined,
    language: metadata?.language || "en",
    categories: metadata?.categories || [],
    isExplicit: false,
    matureLevel: "safe",
    source: "podcast_rss",
  };
}

export default function AudiobookDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const audiobookId = String(params.id || "").trim();
  const { playPodcastEpisode } = usePlaybackRouter();
  const [detail, setDetail] = useState<AudiobookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [playLoading, setPlayLoading] = useState(false);
  const [playError, setPlayError] = useState(false);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | null>(null);
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
    setResolvedAudioUrl(null);

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
  const meta = useMemo(
    () =>
      [
        audiobook?.author_name,
        formatAudiobookDuration(audiobook?.duration_seconds),
        audiobook?.chapter_count ? `${audiobook.chapter_count} chapters` : null,
        audiobook?.language?.toUpperCase(),
      ]
        .filter(Boolean)
        .join(" - "),
    [audiobook]
  );

  const resolvePlayUrl = useCallback(async () => {
    if (!audiobookId || playLoading) return;
    playControllerRef.current?.abort();
    const controller = new AbortController();
    playControllerRef.current = controller;
    setPlayLoading(true);
    setPlayError(false);

    try {
      const play = await fetchAudiobookPlay(audiobookId, controller.signal);
      if (controller.signal.aborted) return;
      setResolvedAudioUrl(play.audio_url);
      const playable = toPlayableAudiobook(play, audiobookId, audiobook);
      const result = await playPodcastEpisode(playable, [playable]);
      if (!result.ok) {
        setPlayError(true);
        setResolvedAudioUrl(null);
        return;
      }
      router.push("/player" as any);
    } catch (playLoadError) {
      if (hasAbortError(playLoadError)) return;
      setPlayError(true);
      setResolvedAudioUrl(null);
    } finally {
      if (!controller.signal.aborted) setPlayLoading(false);
      if (playControllerRef.current === controller) {
        playControllerRef.current = null;
      }
    }
  }, [audiobook, audiobookId, playLoading, playPodcastEpisode]);

  return (
    <LinearGradient colors={["#101514", "#050706"]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <TouchableOpacity
            activeOpacity={0.84}
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.kicker}>AUDIOBOOK DETAIL</Text>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : error || !audiobook ? (
          <View style={styles.centerState}>
            <Ionicons name="book-outline" size={30} color={COLORS.textMuted} />
            <Text style={styles.stateText}>This audiobook could not be loaded.</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
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
              onPress={resolvePlayUrl}
              disabled={playLoading}
            >
              {playLoading ? (
                <ActivityIndicator color="#00130D" />
              ) : (
                <Ionicons name="play" size={18} color="#00130D" />
              )}
              <Text style={styles.playButtonText}>
                {playLoading ? "Resolving audio..." : "Play"}
              </Text>
            </TouchableOpacity>

            {playError ? (
              <Text style={styles.playStatus}>Audio is unavailable for this audiobook.</Text>
            ) : resolvedAudioUrl ? (
              <Text style={styles.playStatus}>Audio URL resolved after tap.</Text>
            ) : null}

            {audiobook.description ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={styles.description}>{audiobook.description}</Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Chapters</Text>
              {detail.chapters.length > 0 ? (
                detail.chapters.map((chapter) => (
                  <View key={chapter.id} style={styles.chapterRow}>
                    <Text style={styles.chapterNumber}>
                      {chapter.chapter_number ? String(chapter.chapter_number) : "-"}
                    </Text>
                    <View style={styles.chapterCopy}>
                      <Text numberOfLines={2} style={styles.chapterTitle}>
                        {chapter.title}
                      </Text>
                      <Text style={styles.chapterMeta}>
                        {formatAudiobookDuration(chapter.duration_seconds) || "Chapter"}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.stateText}>No chapter metadata available.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
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
  },
  coverWrap: {
    width: 118,
    height: 118,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
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
    minHeight: 50,
    borderRadius: 25,
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
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },
  description: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  chapterRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  chapterNumber: {
    width: 34,
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  chapterCopy: {
    flex: 1,
  },
  chapterTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  chapterMeta: {
    marginTop: 4,
    color: COLORS.textMuted,
    fontSize: 12,
  },
  centerState: {
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
  },
  stateText: {
    marginTop: 10,
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
});
