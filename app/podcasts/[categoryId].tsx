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

import { safeRouterPush } from "../../utils/safeNavigation";
import { isValidPodcastShowId } from "../../utils/podcastShowId";

import { PodcastShowCard } from "../../components/podcast/PodcastDiscoveryCards";
import MatureContentConsentModal from "../../components/mature/MatureContentConsentModal";
import {
  getLaunchPodcastCategory,
  resolvePodcastCategoryId,
} from "../../utils/launchPodcastCategories";
import { PODCAST_MATURE_HUB_ID } from "../../constants/podcastMatureCategories";
import { MATURE_MIN_CATEGORY_RESULTS } from "../../constants/matureDiscoveryFoundation";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import { useMountedRef } from "../../hooks/useMountedRef";
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
  const mountedRef = useMountedRef();

  useEffect(() => {
    if (!mountedRef.current) return;
    if (category?.tier === "mature-hub" || categoryId === PODCAST_MATURE_HUB_ID) {
      router.replace("/podcasts/mature" as any);
    }
  }, [category?.tier, categoryId, mountedRef]);

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
      if (!isValidPodcastShowId(show.id) || !String(show.title || "").trim()) return;

      runWithMatureConsent(show, () => {
        safeRouterPush({
          pathname: "/podcasts/show/[showId]",
          params: {
            showId: show.id,
            title: show.title,
            isMature: show.is_mature ? "1" : "0",
          },
        });
      });
    },
    [runWithMatureConsent]
  );

  const renderShowRow = useCallback(
    ({ item }: { item: HiddenTunesPodcastShow }) => {
      if (!isValidPodcastShowId(item.id)) return null;
      return (
        <PodcastShowCard
          show={item}
          variant="premium"
          subtitle={podcastShowSubtitle(item)}
          onPress={() => openShow(item)}
        />
      );
    },
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

  const visibleShows = useMemo(
    () => shows.filter((show) => isValidPodcastShowId(show.id)),
    [shows]
  );

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

      {loading && visibleShows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{TESTER_COPY.podcastDiscoveryLoading}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleShows}
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
              {listCountLabel || (visibleShows.length ? "Shows in this category" : "")}
            </Text>
          }
          ListEmptyComponent={
            hasLoadedOnce && !loading && !refreshing ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No playable shows in this category</Text>
                <Text style={styles.emptyText}>
                  Try another category or search for a podcast show.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            <>
              {loadingMore ? (
                <ActivityIndicator style={styles.footerSpinner} color={COLORS.primary} />
              ) : null}
              {category.tier === "mature" &&
              visibleShows.length > 0 &&
              visibleShows.length < MATURE_MIN_CATEGORY_RESULTS ? (
                <View style={styles.supplementBox}>
                  <Text style={styles.supplementTitle}>More Mature Podcasts</Text>
                  <Text style={styles.supplementText}>
                    This room is still growing. Related mature shows from adjacent categories are
                    included when the primary catalog is sparse.
                  </Text>
                </View>
              ) : null}
              {category.tier === "mature" && hasLoadedOnce && !loading && visibleShows.length === 0 ? (
                <View style={styles.supplementBox}>
                  <Text style={styles.supplementTitle}>Mature podcasts are syncing</Text>
                  <Text style={styles.supplementText}>
                    Try Dating, Relationships, or After Dark from the mature hub, or pull to refresh.
                  </Text>
                  <TouchableOpacity
                    style={styles.backLink}
                    onPress={() => router.push("/podcasts/mature" as any)}
                  >
                    <Text style={styles.backLinkText}>Browse all mature rooms</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
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
  emptyBox: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
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
  supplementBox: {
    marginTop: 8,
    marginBottom: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(168,85,247,0.08)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.2)",
  },
  supplementTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 6,
  },
  supplementText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
