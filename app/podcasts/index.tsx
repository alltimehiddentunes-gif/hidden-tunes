import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import {
  PodcastCategoryCard,
  PodcastEmotionalWorldCard,
  PodcastShowCard,
  PodcastShowRailCard,
} from "../../components/podcast/PodcastDiscoveryCards";
import MediaSearchEmptyState from "../../components/discovery/MediaSearchEmptyState";
import MatureContentConsentModal from "../../components/mature/MatureContentConsentModal";
import { PODCAST_MATURE_HUB_ID } from "../../constants/podcastMatureCategories";
import { PODCAST_HOME_LANE_PAGE_SIZE } from "../../constants/podcastFoundation";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import { useMatureContentGate } from "../../hooks/useMatureContentGate";
import { useMatureContentSettings } from "../../hooks/useMatureContentSettings";
import { useLazyPodcastShowList } from "../../hooks/useLazyPodcastShowList";
import { usePodcastHomeDiscovery } from "../../hooks/usePodcastHomeDiscovery";
import { loadPodcastSearchPage } from "../../services/podcastDiscoveryApi";
import type { HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import type { PodcastShowListItem } from "../../types/podcastDiscovery";
import { useDebouncedSearchQuery } from "../../utils/useDebouncedValue";
import {
  logVisibleFeatureChecklist,
  logVisibleFeatureDiagnostic,
} from "../../utils/visibleFeatureDiagnostics";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";
import { PODCAST_MATURE_SEARCH_SUGGESTION } from "../../utils/mediaSearchQueryExpansion";

const PODCAST_SEARCH_DEBOUNCE_MS = 350;

type ShowRailSectionProps = {
  title: string;
  eyebrow: string;
  shows: PodcastShowListItem[];
  onPressShow: (item: PodcastShowListItem) => void;
  seeAllCategoryId?: string;
};

function ShowRailSection({
  title,
  eyebrow,
  shows,
  onPressShow,
  seeAllCategoryId,
}: ShowRailSectionProps) {
  if (!shows.length) return null;

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionMeta}>
            {Math.min(shows.length, PODCAST_HOME_LANE_PAGE_SIZE)} shows
          </Text>
        </View>
        {seeAllCategoryId ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.seeAllButton}
            onPress={() =>
              router.push({
                pathname: "/podcasts/[categoryId]",
                params: { categoryId: seeAllCategoryId },
              } as any)
            }
          >
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={shows}
        keyExtractor={(item) => `${eyebrow}-${item.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item }) => (
          <PodcastShowRailCard item={item} onPress={() => onPressShow(item)} />
        )}
      />
    </View>
  );
}

export default function PodcastDiscoveryHomeScreen() {
  const { consentVisible, runWithMatureConsent, cancelConsent, confirmConsent } =
    useMatureContentGate();
  const { includeMatureInApi } = useMatureContentSettings();
  const params = useLocalSearchParams<{ q?: string; query?: string }>();
  const initialQuery = String(params.q || params.query || "").trim();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const debouncedQuery = useDebouncedSearchQuery(searchQuery, PODCAST_SEARCH_DEBOUNCE_MS);
  const searchCacheKey = useMemo(
    () => (debouncedQuery ? `search:${debouncedQuery.toLowerCase()}` : ""),
    [debouncedQuery]
  );
  const isSearching = debouncedQuery.trim().length > 0;

  const {
    featured,
    trending,
    popular,
    recommended,
    recentlyPlayed,
    emotionalWorlds,
    browseCategories,
    matureCategories,
    loading,
    resolveShow,
  } = usePodcastHomeDiscovery();

  useEffect(() => {
    logVisibleFeatureDiagnostic("podcast_route_mounted");
  }, []);

  useEffect(() => {
    if (loading) return;

    const podcastSectionsCount = [
      featured,
      trending,
      popular,
      recommended,
      recentlyPlayed,
      emotionalWorlds,
      browseCategories,
      matureCategories,
    ].filter((section) => section.length > 0).length;

    logVisibleFeatureChecklist({
      podcastRouteMounted: true,
      podcastSectionsCount,
      featuredCount: featured.length,
      trendingCount: trending.length,
      popularCount: popular.length,
      emotionalWorldCount: emotionalWorlds.length,
      browseCategoryCount: browseCategories.length,
      matureCategoryCount: matureCategories.length,
    });
  }, [
    loading,
    featured,
    trending,
    popular,
    recommended,
    recentlyPlayed,
    emotionalWorlds,
    browseCategories,
    matureCategories,
  ]);

  const loadSearchPage = useCallback(
    (offset: number, options: { append: boolean; forceRefresh: boolean }) =>
      loadPodcastSearchPage(debouncedQuery, {
        offset,
        append: options.append,
        forceRefresh: options.forceRefresh,
      }).then((result) => ({
        shows: result.shows,
        hasMore: result.hasMore,
      })),
    [debouncedQuery]
  );

  const {
    shows: searchResults,
    loading: searchLoading,
    loadingMore: searchLoadingMore,
    hasLoadedOnce: searchChecked,
    loadMore: loadMoreSearch,
    listCountLabel: searchCountLabel,
  } = useLazyPodcastShowList({
    cacheKey: searchCacheKey,
    enabled: Boolean(searchCacheKey),
    loadPage: loadSearchPage,
  });

  const openCategory = useCallback(
    (categoryId: string) => {
      if (categoryId === PODCAST_MATURE_HUB_ID) {
        router.push("/podcasts/mature" as any);
        return;
      }
      router.push({
        pathname: "/podcasts/[categoryId]",
        params: { categoryId },
      } as any);
    },
    []
  );

  const openShow = useCallback(
    (item: PodcastShowListItem) => {
      const show =
        resolveShow(item.id) ||
        ({
          id: item.id,
          slug: item.id,
          title: item.title,
          artwork_url: item.artworkUrl,
          host_name: item.publisher,
          categories: item.category ? [item.category] : [],
          primary_category: item.category,
          episode_count: item.episodeCount,
          language: item.language,
          is_mature: item.is_mature,
          content_rating: item.content_rating,
          sourceName: "Hidden Tunes",
        } satisfies HiddenTunesPodcastShow);

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
    [resolveShow, runWithMatureConsent]
  );

  const openShowFromSearch = useCallback(
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

  useEffect(() => {
    if (!initialQuery) return;
    setSearchQuery(initialQuery);
  }, [initialQuery]);

  const searchKeyExtractor = useMemo(
    () => createStableKeyExtractor("hidden-tunes-podcast-search"),
    []
  );

  const searchPerformance = useMemo(
    () => getListPerformanceSettings(searchResults.length),
    [searchResults.length]
  );

  const renderSearchRow = useCallback(
    ({ item }: { item: HiddenTunesPodcastShow }) => (
      <PodcastShowCard
        show={item}
        variant="premium"
        onPress={() => openShowFromSearch(item)}
      />
    ),
    [openShowFromSearch]
  );

  const handleSearchSuggestion = useCallback(
    (suggestion: string) => {
      if (suggestion === PODCAST_MATURE_SEARCH_SUGGESTION) {
        openCategory(PODCAST_MATURE_HUB_ID);
        return;
      }
      setSearchQuery(suggestion);
    },
    [openCategory]
  );

  const searchEmptyComponent = useMemo(
    () => (
      <View>
        <MediaSearchEmptyState
          kind="podcast"
          query={debouncedQuery}
          includeMature={includeMatureInApi}
          onSuggestionPress={handleSearchSuggestion}
        />
        {featured.length > 0 ? (
          <ShowRailSection
            eyebrow="FEATURED"
            title="Featured Podcasts"
            shows={featured}
            onPressShow={openShow}
            seeAllCategoryId="featured"
          />
        ) : null}
        {browseCategories.length > 0 ? (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionEyebrow}>BROWSE</Text>
            <Text style={styles.sectionTitle}>Popular categories</Text>
            <View style={styles.grid}>
              {browseCategories.slice(0, 6).map((category) => (
                <PodcastCategoryCard
                  key={category.id}
                  category={category}
                  onPress={() => openCategory(category.id)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    ),
    [
      browseCategories,
      debouncedQuery,
      featured,
      handleSearchSuggestion,
      includeMatureInApi,
      openCategory,
      openShow,
    ]
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
          <Text style={styles.kicker}>HIDDEN TUNES</Text>
          <Text style={styles.title}>PODCASTS</Text>
          <Text style={styles.subtitle}>Premium podcast discovery tuned to your mood</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search Hidden Tunes Podcasts..."
          placeholderTextColor={COLORS.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {isSearching ? (
        searchLoading && searchResults.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>{TESTER_COPY.podcastDiscoveryLoading}</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={searchKeyExtractor}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <Text style={styles.sectionCountLabel}>
                {searchCountLabel || "Hidden Tunes shows"}
              </Text>
            }
            onEndReachedThreshold={0.35}
            onEndReached={loadMoreSearch}
            ListFooterComponent={
              searchLoadingMore ? (
                <ActivityIndicator style={styles.footerSpinner} color={COLORS.primary} />
              ) : null
            }
            ListEmptyComponent={searchChecked ? searchEmptyComponent : null}
            renderItem={renderSearchRow}
            {...searchPerformance}
            removeClippedSubviews
          />
        )
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{TESTER_COPY.podcastDiscoveryLoading}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ShowRailSection
            eyebrow="FEATURED"
            title="Featured Podcasts"
            shows={featured}
            onPressShow={openShow}
            seeAllCategoryId="featured"
          />
          <ShowRailSection
            eyebrow="TRENDING"
            title="Trending Podcasts"
            shows={trending}
            onPressShow={openShow}
            seeAllCategoryId="trending"
          />
          <ShowRailSection
            eyebrow="POPULAR"
            title="Popular Podcasts"
            shows={popular}
            onPressShow={openShow}
            seeAllCategoryId="popular"
          />
          <ShowRailSection
            eyebrow="RECENT"
            title="Recently Played"
            shows={recentlyPlayed}
            onPressShow={openShow}
          />
          <ShowRailSection
            eyebrow="FOR YOU"
            title="Recommended For You"
            shows={recommended}
            onPressShow={openShow}
            seeAllCategoryId="recommended"
          />

          {emotionalWorlds.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionEyebrow}>EMOTIONAL PODCASTS</Text>
              <Text style={styles.sectionTitle}>Podcasts tuned to how you feel</Text>
              <FlatList
                horizontal
                data={emotionalWorlds}
                keyExtractor={(entry) => entry.world.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railContent}
                initialNumToRender={3}
                maxToRenderPerBatch={3}
                windowSize={5}
                removeClippedSubviews
                renderItem={({ item }) => (
                  <PodcastEmotionalWorldCard
                    category={item.world}
                    onPress={() => openCategory(item.world.id)}
                  />
                )}
              />
            </View>
          ) : null}

          {browseCategories.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionEyebrow}>BROWSE CATEGORIES</Text>
              <Text style={styles.sectionTitle}>Business · Faith · African Voices · More</Text>
              <View style={styles.grid}>
                {browseCategories.map((category) => (
                  <PodcastCategoryCard
                    key={category.id}
                    category={category}
                    onPress={() => openCategory(category.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {matureCategories.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionEyebrow}>ADULT PODCASTS</Text>
              <Text style={styles.sectionTitle}>Mature conversations</Text>
              <View style={styles.grid}>
                {matureCategories.map((category) => (
                  <PodcastCategoryCard
                    key={category.id}
                    category={category}
                    onPress={() =>
                      runWithMatureConsent(
                        { is_mature: true, content_rating: "adult" },
                        () => openCategory(category.id)
                      )
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
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
  searchWrap: {
    marginHorizontal: 20,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
    padding: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  sectionBlock: {
    marginTop: 8,
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionEyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 4,
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  sectionCountLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 12,
    marginTop: 8,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingTop: 18,
  },
  seeAllText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  railContent: {
    paddingRight: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
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
  footerSpinner: {
    marginVertical: 16,
  },
});
