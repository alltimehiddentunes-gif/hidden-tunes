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

import { PodcastShowCard } from "../../components/podcast/PodcastDiscoveryCards";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import { getPodcastShowsForCategory } from "../../services/podcastDiscoveryApi";
import type { HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import { getLaunchPodcastCategory } from "../../utils/launchPodcastCategories";
import { podcastShowSubtitle } from "../../utils/openHiddenTunesPodcast";
import {
  hydrateCachedPodcastShows,
  readCachedPodcastShows,
} from "../../utils/podcastDiscoveryCache";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";

export default function PodcastCategoryScreen() {
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = String(params.categoryId || "").trim();
  const category = useMemo(
    () => getLaunchPodcastCategory(categoryId),
    [categoryId]
  );

  const [shows, setShows] = useState<HiddenTunesPodcastShow[]>(() =>
    readCachedPodcastShows(categoryId) || []
  );
  const [loading, setLoading] = useState(() => shows.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedFallbacks, setHasCheckedFallbacks] = useState(false);

  const loadShows = useCallback(
    async (forceRefresh = false) => {
      if (!categoryId) return;

      try {
        const next = await getPodcastShowsForCategory(categoryId, { forceRefresh });
        setShows(next);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setHasCheckedFallbacks(true);
      }
    },
    [categoryId]
  );

  useEffect(() => {
    if (!categoryId || shows.length > 0) return;

    void hydrateCachedPodcastShows(categoryId).then((cached) => {
      if (!cached?.length) return;
      setShows(cached);
      setLoading(false);
    });
  }, [categoryId, shows.length]);

  useEffect(() => {
    if (!categoryId) return;
    void loadShows(false);
  }, [categoryId, loadShows]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadShows(true);
  }, [loadShows]);

  const openShow = useCallback((show: HiddenTunesPodcastShow) => {
    router.push({
      pathname: "/podcasts/show/[showId]",
      params: {
        showId: show.id,
        title: show.title,
        hostName: show.host_name || "",
        artworkUrl: show.artwork_url || "",
        description: show.description || "",
      },
    } as any);
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
    () => createStableKeyExtractor("hidden-tunes-podcast-show"),
    []
  );

  const showEmpty =
    hasCheckedFallbacks && !loading && !refreshing && shows.length === 0;

  if (!category) {
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
          <Text style={styles.title}>{category.title}</Text>
          <Text style={styles.subtitle}>{category.subtitle}</Text>
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
              {shows.length > 0
                ? `${shows.length} Hidden Tunes shows in this room`
                : "Hidden Tunes shows in this room"}
            </Text>
          }
          ListEmptyComponent={
            showEmpty ? (
              <View style={styles.emptyBox}>
                <Ionicons name="mic-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>{category.emptyTitle}</Text>
                <Text style={styles.emptyText}>{category.emptyMessage}</Text>
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
          renderItem={renderShowRow}
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
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  fallbackButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  backLink: {
    marginTop: 16,
  },
  backLinkText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700",
  },
});
