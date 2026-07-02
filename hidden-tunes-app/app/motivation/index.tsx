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
import { MOTIVATION_SUBCATEGORIES } from "../../constants/motivationCatalog";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import {
  fetchMotivationCatalogPage,
  formatMotivationDuration,
  MOTIVATION_DEFAULT_PAGE_LIMIT,
  type HiddenTunesMotivationItem,
} from "../../services/motivationCatalogApi";
import { openHiddenTunesMotivationItem } from "../../utils/openHiddenTunesMotivationItem";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";
import { useMountedRef } from "../../utils/useMountedRef";

export default function MotivationScreen() {
  const mountedRef = useMountedRef();
  const [items, setItems] = useState<HiddenTunesMotivationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const loadPage = useCallback(
    async (options?: {
      cursor?: string | null;
      reset?: boolean;
      subcategory?: string | null;
    }) => {
      const reset = options?.reset === true;
      const subcategory = options?.subcategory ?? activeSubcategory;

      try {
        setLoadError(null);
        const response = await fetchMotivationCatalogPage({
          limit: MOTIVATION_DEFAULT_PAGE_LIMIT,
          cursor: reset ? null : options?.cursor,
          subcategory: subcategory || undefined,
        });

        if (!mountedRef.current) return;

        setItems((current) =>
          reset ? response.items : [...current, ...response.items]
        );
        setNextCursor(response.pagination.nextCursor);
        setHasMore(response.pagination.hasMore);
      } catch {
        if (!mountedRef.current) return;
        setLoadError("Motivation content could not be loaded right now.");
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        setHasLoadedOnce(true);
      }
    },
    [activeSubcategory, mountedRef]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadPage({ reset: true });
  }, [loadPage]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loadingMore || loading || !nextCursor) return;
    setLoadingMore(true);
    void loadPage({ cursor: nextCursor });
  }, [hasMore, loadingMore, loading, nextCursor, loadPage]);

  const onSelectSubcategory = useCallback(
    (value: string | null) => {
      setActiveSubcategory(value);
      setLoading(true);
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      void loadPage({ reset: true, subcategory: value });
    },
    [loadPage]
  );

  const onOpenItem = useCallback(async (item: HiddenTunesMotivationItem) => {
    setOpeningId(item.id);
    const result = await openHiddenTunesMotivationItem(item);
    setOpeningId(null);
    if (!result.ok) {
      setLoadError(result.error);
    }
  }, []);

  useEffect(() => {
    void loadPage({ reset: true });
  }, [loadPage]);

  const listPerformance = useMemo(
    () => getListPerformanceSettings(items.length),
    [items.length]
  );
  const keyExtractor = useMemo(
    () => createStableKeyExtractor("hidden-tunes-motivation-item"),
    []
  );

  const showEmpty = hasLoadedOnce && !loading && !refreshing && items.length === 0;

  const renderItem = useCallback(
    ({ item }: { item: HiddenTunesMotivationItem }) => {
      const duration = formatMotivationDuration(item.duration_seconds);
      const isOpening = openingId === item.id;

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          disabled={isOpening}
          onPress={() => void onOpenItem(item)}
        >
          <HTImage source={{ uri: item.artwork || undefined }} style={styles.artwork} />
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {[item.channel_name, item.subcategory, duration].filter(Boolean).join(" · ")}
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
    [onOpenItem, openingId]
  );

  return (
    <LinearGradient colors={["#170d20", "#050308"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>HIDDEN TUNES</Text>
          <Text style={styles.title}>Motivation</Text>
          <Text style={styles.subtitle}>
            Verified speeches, mindset sessions, and focus streams.
          </Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, !activeSubcategory && styles.chipActive]}
              onPress={() => onSelectSubcategory(null)}
            >
              <Text style={[styles.chipText, !activeSubcategory && styles.chipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {MOTIVATION_SUBCATEGORIES.map((label) => (
              <TouchableOpacity
                key={label}
                style={[styles.chip, activeSubcategory === label && styles.chipActive]}
                onPress={() => onSelectSubcategory(label)}
              >
                <Text
                  style={[styles.chipText, activeSubcategory === label && styles.chipTextActive]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : showEmpty ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Verified motivation is still growing</Text>
              <Text style={styles.emptyText}>
                {loadError || TESTER_COPY.videoDiscoveryEmpty}
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
    backgroundColor: "rgba(255,0,51,0.18)",
  },
  chipText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: {
    color: COLORS.text,
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
