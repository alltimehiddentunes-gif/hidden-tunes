import { useCallback, useEffect, useMemo } from "react";
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
import MatureContentConsentModal from "../../components/mature/MatureContentConsentModal";
import {
  getLaunchPodcastCategory,
  resolvePodcastCategoryId,
} from "../../utils/launchPodcastCategories";
import { PODCAST_MATURE_HUB_ID } from "../../constants/podcastMatureCategories";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import { useLazyPodcastShowList } from "../../hooks/useLazyPodcastShowList";
import { useMatureContentGate } from "../../hooks/useMatureContentGate";
import { loadPodcastCategoryPage } from "../../services/podcastDiscoveryApi";
import type { HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import { podcastShowSubtitle } from "../../utils/openHiddenTunesPodcast";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";

export default function PodcastCategoryScreen() {
  const { consentVisible, runWithMatureConsent, cancelConsent, confirmConsent } =
    useMatureContentGate();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = resolvePodcastCategoryId(String(params.categoryId || "").trim());
  const category = useMemo(() => getLaunchPodcastCategory(categoryId), [categoryId]);

  useEffect(() => {
    if (category?.tier === "mature-hub" || categoryId === PODCAST_MATURE_HUB_ID) {
      router.replace("/podcasts/mature" as any);
    }
  }, [category?.tier, categoryId]);

  const loadPage = useCallback(
    (offset: number, options: { append: boolean; forceRefresh: boolean }) =>
      loadPodcastCategoryPage(categoryId, offset, {
        append: options.append,
        forceRefresh: options.forceRefresh,
      }).then((result) => ({
        shows: result.shows,
        hasMore: result.hasMore,
      })),
    [categoryId]
  );

  const {
    shows,
    loading,
    refreshing,
    loadingMore,
    hasLoadedOnce,
    onRefresh,
    loadMore,
    listCountLabel,
  } = useLazyPodcastShowList({
    cacheKey: categoryId,
    enabled: Boolean(categoryId) && category?.tier !== "mature-hub",
    loadPage,
  });

  const openShow = useCallback(
    (show: HiddenTunesPodcastShow) => {
      runWithMatureConsent(show, () => {
        router.push({
          pathname: "/podcasts/show/[showId]",
          params: {
            showId: show.id,
            title: show.title,
            isMature: show.is_mature ? "1" : "0",
          },
        } as any);
      });
    },
    [runWithMatureConsent]
  );

  const renderShowRow = useCallback(
    ({ item }: { item: HiddenTunesPodcastShow }) => (
      <PodcastShowCard
        show={item}
        variant="premium"
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

  useEffect(() => {
    if (!hasLoadedOnce || loading || refreshing || shows.length > 0) return;
    router.replace("/podcasts" as any);
  }, [hasLoadedOnce, shows.length, loading, refreshing]);

  if (!category) {
    return (
      <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>This room is not available</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Back to Podcasts</Text>
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
          onEndReachedThreshold={0.35}
          onEndReached={loadMore}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {listCountLabel || "Hidden Tunes shows in this room"}
            </Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerSpinner} color={COLORS.primary} />
            ) : null
          }
          renderItem={renderShowRow}
          {...listPerformance}
          removeClippedSubviews
        />
      )}

      <MatureContentConsentModal
        visible={consentVisible}
        onCancel={cancelConsent}
        onConfirm={confirmConsent}
      />
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
  footerSpinner: {
    marginVertical: 16,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
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
