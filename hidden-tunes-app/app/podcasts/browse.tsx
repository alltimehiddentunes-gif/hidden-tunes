import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { router } from "expo-router";

import { PodcastShowCard } from "../../components/podcast/PodcastDiscoveryCards";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import { getPodcastBrowseAllShows } from "../../services/podcastDiscoveryApi";
import type { HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import { openPodcastShow } from "../../utils/podcastNavigation";
import { podcastShowSubtitle } from "../../utils/openHiddenTunesPodcast";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
  markFastScrolling,
} from "../../utils/performanceMode";
import { useMountedRef } from "../../utils/useMountedRef";

export default function PodcastBrowseAllScreen() {
  const mountedRef = useMountedRef();
  const [shows, setShows] = useState<HiddenTunesPodcastShow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const loadPage = useCallback(
    async (nextPage: number, forceRefresh = false) => {
      const requestId = ++loadRequestRef.current;

      try {
        setLoadError(null);
        const result = await getPodcastBrowseAllShows(nextPage, { forceRefresh });

        if (!mountedRef.current || requestId !== loadRequestRef.current) return;

        setShows((current) =>
          nextPage === 1 ? result.shows : [...current, ...result.shows]
        );
        setPage(nextPage);
        setHasMore(Boolean(result.pagination.hasMore) && result.shows.length > 0);
      } catch {
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        setLoadError("Podcasts could not be loaded right now.");
      } finally {
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [mountedRef]
  );

  useEffect(() => {
    void loadPage(1, false);
  }, [loadPage]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadPage(1, true);
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    void loadPage(page + 1, false);
  }, [hasMore, loadPage, loading, loadingMore, page]);

  const openShow = useCallback((show: HiddenTunesPodcastShow) => {
    openPodcastShow(show);
  }, []);

  const renderShowRow = useCallback(
    ({ item }: { item: HiddenTunesPodcastShow }) => (
      <PodcastShowCard
        show={item}
        subtitle={podcastShowSubtitle(item)}
        onPress={() => openShow(item)}
      />
    ),
    [openShow]
  );

  const listPerformance = useMemo(
    () => getListPerformanceSettings(shows.length),
    [shows.length]
  );

  const keyExtractor = useMemo(
    () => createStableKeyExtractor("hidden-tunes-podcast-browse"),
    []
  );

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
          <Text style={styles.title}>Browse All Shows</Text>
          <Text style={styles.subtitle}>
            Explore Hidden Tunes podcasts — loaded in small pages
          </Text>
        </View>
      </View>

      {loading && shows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{TESTER_COPY.podcastDiscoveryLoading}</Text>
        </View>
      ) : (
        <FlatList
          data={shows}
          keyExtractor={keyExtractor}
          renderItem={renderShowRow}
          contentContainerStyle={styles.listContent}
          onScrollBeginDrag={() => markFastScrolling(true)}
          onMomentumScrollBegin={() => markFastScrolling(true)}
          onMomentumScrollEnd={() => markFastScrolling(false)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {shows.length > 0
                ? `${shows.length} Hidden Tunes shows loaded`
                : "Hidden Tunes shows"}
            </Text>
          }
          ListEmptyComponent={
            loadError ? (
              <View style={styles.emptyBox}>
                <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>{loadError}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
                  <Text style={styles.retryButtonText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="mic-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No shows yet</Text>
                <Text style={styles.emptyText}>{TESTER_COPY.podcastDiscoveryEmpty}</Text>
              </View>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            ) : null
          }
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
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
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
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  footerLoader: {
    paddingVertical: 18,
    alignItems: "center",
  },
});
