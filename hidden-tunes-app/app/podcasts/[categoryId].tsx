import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { PodcastEpisodeRow } from "../../components/podcast/PodcastDiscoveryCards";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import { usePlaybackRouter } from "../../hooks/usePlaybackRouter";
import { isMaturePodcastsEnabled } from "../../services/maturePodcastPreferences";
import {
  fetchPodcastCategoryEpisodes,
  fetchPodcastEpisodePlay,
  fetchPodcastTree,
  formatPodcastEpisodeDuration,
  PODCAST_BACKEND_PAGE_LIMIT,
  type HiddenTunesPodcastCategory,
  type HiddenTunesPodcastEpisode,
} from "../../services/podcastCatalogApi";
import type { PodcastEpisode } from "../../types/podcast";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";
import { useMountedRef } from "../../utils/useMountedRef";

export default function PodcastCategoryScreen() {
  const mountedRef = useMountedRef();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = String(params.categoryId || "").trim();
  const { playPodcastEpisode } = usePlaybackRouter();

  const [category, setCategory] = useState<HiddenTunesPodcastCategory | null>(null);
  const [episodes, setEpisodes] = useState<HiddenTunesPodcastEpisode[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedFallbacks, setHasCheckedFallbacks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [matureEnabled, setMatureEnabled] = useState(false);

  const categoryTitle = category?.title || categoryId.replace(/-/g, " ");
  const categorySubtitle = category?.subtitle || "Playable Hidden Tunes podcast episodes";

  const toPlayableEpisode = useCallback(
    (
      play: Awaited<ReturnType<typeof fetchPodcastEpisodePlay>>,
      metadata?: HiddenTunesPodcastEpisode
    ): PodcastEpisode => ({
      id: play.id,
      title: play.title,
      podcastTitle: play.podcast_title || metadata?.podcast_title || "Hidden Tunes Podcast",
      audioUrl: play.audio_url,
      artworkUrl: play.artwork_url || metadata?.artwork_url || undefined,
      duration: play.duration_seconds || metadata?.duration_seconds,
      publishedAt: metadata?.published_at,
      source: "podcast",
    }),
    []
  );

  const playEpisode = useCallback(
    async (episode: HiddenTunesPodcastEpisode) => {
      const play = await fetchPodcastEpisodePlay(episode.id, {
        includeMature: matureEnabled,
      });
      if (!play.audio_url) return;

      const playable = toPlayableEpisode(play, episode);
      await playPodcastEpisode(playable, [playable]);
      router.push("/player" as any);
    },
    [matureEnabled, playPodcastEpisode, toPlayableEpisode]
  );

  const loadEpisodes = useCallback(
    async (nextPage = 1, mode: "replace" | "append" = "replace") => {
      if (!categoryId) return;

      try {
        setLoadError(null);
        const next = await fetchPodcastCategoryEpisodes(categoryId, {
          page: nextPage,
          limit: PODCAST_BACKEND_PAGE_LIMIT,
          includeMature: matureEnabled,
        });
        if (!mountedRef.current) return;
        setEpisodes((current) =>
          mode === "append" ? [...current, ...next.items] : next.items
        );
        setPage(next.page);
        setHasMore(next.hasMore);
      } catch {
        if (!mountedRef.current) return;
        setLoadError("Podcasts could not be loaded right now.");
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
        setHasCheckedFallbacks(true);
      }
    },
    [categoryId, matureEnabled, mountedRef]
  );

  useEffect(() => {
    void isMaturePodcastsEnabled()
      .then((enabled) => {
        if (!mountedRef.current) return;
        setMatureEnabled(enabled);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setMatureEnabled(false);
      });
  }, [mountedRef]);

  useEffect(() => {
    if (!categoryId) return;

    void fetchPodcastTree({ includeMature: matureEnabled })
      .then((tree) => {
        if (!mountedRef.current) return;
        setCategory(tree.find((item) => item.slug === categoryId) || null);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setCategory(null);
      });
  }, [categoryId, matureEnabled, mountedRef]);

  useEffect(() => {
    if (!categoryId) return;
    setLoading(true);
    setEpisodes([]);
    setPage(1);
    setHasMore(false);
    void loadEpisodes(1, "replace");
  }, [categoryId, loadEpisodes]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadEpisodes(1, "replace");
  }, [loadEpisodes]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    void loadEpisodes(page + 1, "append");
  }, [hasMore, loadEpisodes, loadingMore, page]);

  const renderEpisodeRow = useCallback(
    ({ item }: { item: HiddenTunesPodcastEpisode }) => (
      <PodcastEpisodeRow
        episode={item}
        subtitle={[
          item.podcast_title,
          formatPodcastEpisodeDuration(item.duration_seconds) || undefined,
        ]
          .filter(Boolean)
          .join(" - ")}
        onPress={() => {
          void playEpisode(item);
        }}
      />
    ),
    [playEpisode]
  );

  const listPerformance = useMemo(
    () => getListPerformanceSettings(episodes.length),
    [episodes.length]
  );

  const keyExtractor = useMemo(
    () => createStableKeyExtractor("hidden-tunes-podcast-episode"),
    []
  );

  const showEmpty =
    hasCheckedFallbacks && !loading && !refreshing && episodes.length === 0;

  if (!categoryId) {
    return (
      <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>This room is not available</Text>
          <Text style={styles.emptyText}>{TESTER_COPY.podcastDiscoveryEmpty}</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Back to Hidden Tunes Podcasts</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>HIDDEN TUNES PODCASTS</Text>
          <Text style={styles.title}>{categoryTitle}</Text>
          <Text style={styles.subtitle}>{categorySubtitle}</Text>
        </View>
      </View>

      {loading && episodes.length === 0 && !loadError ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{TESTER_COPY.podcastDiscoveryLoading}</Text>
        </View>
      ) : loadError && episodes.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>{loadError}</Text>
          <Text style={styles.emptyText}>Try again.</Text>
          <TouchableOpacity
            activeOpacity={0.86}
            style={styles.retryButton}
            onPress={() => {
              setLoading(true);
              void loadEpisodes(1, "replace");
            }}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={episodes}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {episodes.length > 0
                ? `${episodes.length} Hidden Tunes episodes in this room`
                : "Hidden Tunes episodes in this room"}
            </Text>
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                activeOpacity={0.86}
                style={styles.fallbackButton}
                onPress={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Text style={styles.fallbackButtonText}>Load more</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            showEmpty ? (
              <View style={styles.emptyBox}>
                <Ionicons name="mic-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No episodes are available here yet</Text>
                <Text style={styles.emptyText}>{TESTER_COPY.podcastDiscoveryEmpty}</Text>
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.fallbackButton}
                  onPress={() => router.push("/podcasts" as any)}
                >
                  <Text style={styles.fallbackButtonText}>
                    Search Hidden Tunes Podcasts
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={renderEpisodeRow}
          {...listPerformance}
          removeClippedSubviews
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 4,
  },
  headerText: { flex: 1 },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 4,
    textTransform: "capitalize",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 12,
    marginTop: 8,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
  },
  fallbackButton: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.14)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.28)",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
  },
  fallbackButtonText: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 13,
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  retryButtonText: {
    color: "#09030F",
    fontWeight: "900",
    fontSize: 13,
  },
  backLink: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backLinkText: {
    color: COLORS.primary,
    fontWeight: "800",
  },
});
