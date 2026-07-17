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
import { router } from "expo-router";

import HTImage from "../../components/HTImage";
import { COLORS } from "../../constants/theme";
import { usePlaybackRouter } from "../../hooks/usePlaybackRouter";
import {
  fetchLectureCatalogPage,
  fetchLectureCategories,
  formatLectureDuration,
  LECTURE_DEFAULT_PAGE_LIMIT,
  type HiddenTunesLectureSeries,
} from "../../services/lectureCatalogApi";
import { openHiddenTunesLectureSeries } from "../../utils/openHiddenTunesLectureItem";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";
import { useMountedRef } from "../../utils/useMountedRef";

export default function LecturesScreen() {
  const mountedRef = useMountedRef();
  const { playLectureSession } = usePlaybackRouter();
  const [categories, setCategories] = useState<
    { id: string; slug: string; name: string }[]
  >([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [series, setSeries] = useState<HiddenTunesLectureSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const loadPage = useCallback(
    async (options?: {
      page?: number;
      reset?: boolean;
      category?: string | null;
    }) => {
      const reset = options?.reset === true;
      const nextPage = options?.page ?? 1;
      const category = options?.category ?? activeCategory;

      try {
        setLoadError(null);
        const response = await fetchLectureCatalogPage({
          page: nextPage,
          limit: LECTURE_DEFAULT_PAGE_LIMIT,
          category,
        });

        if (!mountedRef.current) return;

        setSeries((current) =>
          reset ? response.series : [...current, ...response.series]
        );
        setPage(response.pagination.page);
        setHasMore(response.pagination.hasMore);
      } catch {
        if (!mountedRef.current) return;
        setLoadError("Lectures could not be loaded right now.");
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        setHasLoadedOnce(true);
      }
    },
    [activeCategory, mountedRef]
  );

  useEffect(() => {
    let active = true;
    void fetchLectureCategories()
      .then((rows) => {
        if (!active) return;
        setCategories(rows);
        setActiveCategory((current) => current || rows[0]?.slug || null);
      })
      .catch(() => {
        if (!active) return;
        setCategories([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeCategory) return;
    setLoading(true);
    setSeries([]);
    setPage(1);
    setHasMore(false);
    void loadPage({ reset: true, page: 1, category: activeCategory });
    // loadPage closes over activeCategory; intentionally key only on category slug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadPage({ reset: true, page: 1 });
  }, [loadPage]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    void loadPage({ page: page + 1, reset: false });
  }, [hasMore, loadingMore, loading, loadPage, page]);

  const onOpenSeries = useCallback(
    async (item: HiddenTunesLectureSeries) => {
      setOpeningId(item.id);
      setLoadError(null);
      const result = await openHiddenTunesLectureSeries(item, {
        playLectureSession,
      });
      if (!mountedRef.current) return;
      setOpeningId(null);
      if (!result.ok) {
        setLoadError(result.error);
      }
    },
    [mountedRef, playLectureSession]
  );

  const listPerformance = useMemo(
    () => getListPerformanceSettings(series.length),
    [series.length]
  );
  const keyExtractor = useMemo(
    () => createStableKeyExtractor("hidden-tunes-lecture-series"),
    []
  );

  const showEmpty =
    hasLoadedOnce && !loading && !refreshing && series.length === 0;

  const renderItem = useCallback(
    ({ item }: { item: HiddenTunesLectureSeries }) => {
      const duration = formatLectureDuration(item.duration_seconds);
      const isOpening = openingId === item.id;
      const meta = [
        item.speaker_name || item.instructor_name,
        item.lesson_count ? `${item.lesson_count} sessions` : null,
        duration,
      ]
        .filter(Boolean)
        .join(" · ");

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          disabled={isOpening}
          onPress={() => void onOpenSeries(item)}
        >
          <HTImage
            source={{ uri: item.artwork_url || undefined }}
            style={styles.artwork}
          />
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {meta || "Lecture"}
            </Text>
          </View>
          {isOpening ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <Ionicons name="play-circle" size={28} color={COLORS.primary} />
          )}
        </TouchableOpacity>
      );
    },
    [onOpenSeries, openingId]
  );

  return (
    <LinearGradient colors={["#0d1524", "#050308"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>HIDDEN TUNES</Text>
          <Text style={styles.title}>Lectures</Text>
          <Text style={styles.subtitle}>
            Courses and educational sessions — tap to play.
          </Text>
        </View>
      </View>

      <FlatList
        data={series}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View>
            {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
            <View style={styles.chipRow}>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.slug}
                  style={[
                    styles.chip,
                    activeCategory === category.slug && styles.chipActive,
                  ]}
                  onPress={() => setActiveCategory(category.slug)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      activeCategory === category.slug && styles.chipTextActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : showEmpty ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No lectures in this subject</Text>
              <Text style={styles.emptyText}>
                {loadError || "Try another category or pull to refresh."}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : null
        }
        {...listPerformance}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  headerText: { flex: 1 },
  kicker: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipActive: {
    backgroundColor: "rgba(96,165,250,0.22)",
  },
  chipText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: {
    color: COLORS.text,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 10,
  },
  artwork: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cardBody: { flex: 1 },
  cardTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  cardMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  center: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  footerLoader: {
    paddingVertical: 18,
    alignItems: "center",
  },
});
