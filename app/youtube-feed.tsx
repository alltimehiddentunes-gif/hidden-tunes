import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PremiumContentGrid } from "@/components/catalog/PremiumContentGrid";
import AppShell from "../components/navigation/AppShell";
import { getMobileScrollTailPadding } from "../components/navigation/navigationConfig";
import TvBrowseCategories from "../components/tv/TvBrowseCategories";
import TvVideoCard from "../components/tv/TvVideoCard";
import type { TvBrowseCategory } from "@/constants/tvBrowseCategories";
import { COLORS, GRADIENTS } from "@/constants/theme";
import {
  fetchArchiveConcertLane,
  fetchTvCategories,
  fetchTvCategoryLane,
  fetchTvHomeLanes,
  fetchTvSearchVideos,
  filterAdminHomeLanes,
  loadTvHomeCache,
  TV_SEARCH_PAGE_LIMIT,
  type HiddenTunesTvVideo,
  type TvHomeLane,
} from "@/services/tvCatalogApi";
import { openVideoItemWithAlert } from "@/services/videos/openVideoItem";
import { getListPerformanceSettings, markFastScrolling } from "@/utils/performanceMode";
import { buildTvDiscoveryLaunchContext } from "@/utils/tvDiscoveryLaunchContext";
import { navigateTvHomeBack } from "@/utils/tvNavigation";
import { warmTvPlaybackFailureStore } from "@/utils/tvPlaybackFailureStore";

type TvLane = TvHomeLane;
const TV_LANE_PREVIEW_LIMIT = 8;
const ARCHIVE_DEFER_SCROLL_Y = 420;
const SKELETON_CARD_COUNT = 6;

type FeedRow =
  | { key: string; kind: "categories" }
  | { key: string; kind: "skeleton" }
  | { key: string; kind: "status"; title: string; subtitle?: string; retry?: boolean }
  | { key: string; kind: "featured"; video: HiddenTunesTvVideo; lane?: TvLane }
  | {
      key: string;
      kind: "lane";
      lane: TvLane;
      maxItems?: number;
      categoryMeta?: { slug: string; title: string; query?: string };
    }
  | { key: string; kind: "load-more" }
  | { key: string; kind: "loading"; label: string };

function displayLaneTitle(title: string) {
  if (title === "Documentary Nights") return "Documentary";
  if (title === "Live Performances") return "Live Performance";
  return title;
}

const TvSkeletonCards = () => (
  <View style={styles.skeletonSection}>
    <View style={styles.skeletonTitle} />
    <View style={styles.skeletonGrid}>
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <View key={`tv-sk-${index}`} style={styles.skeletonCard} />
      ))}
    </View>
  </View>
);

export default function YouTubeFeedScreen() {
  const insets = useSafeAreaInsets();
  const scrollTailPadding = useMemo(
    () => getMobileScrollTailPadding(insets.bottom),
    [insets.bottom]
  );
  const [lanes, setLanes] = useState<TvLane[]>([]);
  const [browseCategories, setBrowseCategories] = useState<TvBrowseCategory[]>([]);
  const [activeCategorySlug, setActiveCategorySlug] = useState<string | null>(null);
  const [categoryLane, setCategoryLane] = useState<TvLane | null>(null);
  const [categoryLaneLoading, setCategoryLaneLoading] = useState(false);
  const [categoryLaneError, setCategoryLaneError] = useState<string | null>(null);
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryHasMore, setCategoryHasMore] = useState(false);
  const [categoryLoadingMore, setCategoryLoadingMore] = useState(false);
  const [archiveLane, setArchiveLane] = useState<TvLane | null>(null);
  const [shellReady, setShellReady] = useState(false);
  const [lanesLoading, setLanesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<HiddenTunesTvVideo[]>([]);
  const [archiveLaneLoading, setArchiveLaneLoading] = useState(false);
  const [connectingVideoId, setConnectingVideoId] = useState<string | null>(null);
  const [visibleLaneBudget, setVisibleLaneBudget] = useState(3);
  const tvSearchRequestIdRef = useRef(0);
  const categoryRequestRef = useRef(0);
  const homeAbortRef = useRef<AbortController | null>(null);
  const categoryAbortRef = useRef<AbortController | null>(null);
  const archiveAbortRef = useRef<AbortController | null>(null);
  const archiveRequestedRef = useRef(false);
  const openGuardRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const { width } = useWindowDimensions();
  const featuredWidth = Math.max(300, width - 36);

  const { featuredLane, recentlyAddedLane, channelLanes, featuredVideo } = useMemo(() => {
    const featured = lanes.find((lane) => lane.id === "featured");
    const recent = lanes.find((lane) => lane.id === "recent");
    const channels = lanes.filter((lane) => !["featured", "recent"].includes(lane.id));
    return {
      featuredLane: featured,
      recentlyAddedLane: recent,
      channelLanes: channels,
      featuredVideo: featured?.videos[0],
    };
  }, [lanes]);
  const hasSearchText = query.trim().length > 0;

  const abortHome = useCallback(() => {
    homeAbortRef.current?.abort();
    homeAbortRef.current = null;
  }, []);

  const abortCategory = useCallback(() => {
    categoryAbortRef.current?.abort();
    categoryAbortRef.current = null;
  }, []);

  const abortArchive = useCallback(() => {
    archiveAbortRef.current?.abort();
    archiveAbortRef.current = null;
  }, []);

  const loadArchiveLane = useCallback(async () => {
    if (archiveRequestedRef.current) return;
    archiveRequestedRef.current = true;
    abortArchive();
    const controller = new AbortController();
    archiveAbortRef.current = controller;
    setArchiveLaneLoading(true);
    try {
      const lane = await fetchArchiveConcertLane({ signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) return;
      setArchiveLane(lane.videos.length > 0 ? lane : null);
    } catch {
      if (mountedRef.current && !controller.signal.aborted) {
        setArchiveLane(null);
      }
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setArchiveLaneLoading(false);
      }
    }
  }, [abortArchive]);

  const loadTv = useCallback(
    async (options?: { refresh?: boolean }) => {
      abortHome();
      const controller = new AbortController();
      homeAbortRef.current = controller;

      if (options?.refresh) {
        setRefreshing(true);
      } else {
        setLanesLoading(true);
      }
      setLoadError(null);

      try {
        const cached = options?.refresh ? null : await loadTvHomeCache();
        const hasFreshCache = Boolean(cached?.lanes?.length);

        if (hasFreshCache && mountedRef.current) {
          setLanes(filterAdminHomeLanes(cached!.lanes));
          setLanesLoading(false);
          setShellReady(true);
        } else if (mountedRef.current) {
          setShellReady(true);
        }

        const categoriesPromise = fetchTvCategories({ signal: controller.signal });

        const applyHome = (home: Awaited<ReturnType<typeof fetchTvHomeLanes>>) => {
          if (!mountedRef.current || controller.signal.aborted) return;
          if (home.hasAnyVideos) {
            setLanes(filterAdminHomeLanes(home.lanes));
            setLoadError(null);
          } else if (home.transportError) {
            setLanes((current) => (current.length ? current : []));
            setLoadError(home.transportError);
          } else {
            setLanes((current) => (current.length ? current : []));
            setLoadError(null);
          }
          setLanesLoading(false);
        };

        if (!hasFreshCache) {
          const home = await fetchTvHomeLanes({
            signal: controller.signal,
            onPriorityLanes: (priority) => {
              if (!mountedRef.current || controller.signal.aborted) return;
              if (priority.some((lane) => lane.videos.length > 0)) {
                setLanes(filterAdminHomeLanes(priority));
                setLanesLoading(false);
              }
            },
          });
          applyHome(home);
        } else {
          void fetchTvHomeLanes({
            signal: controller.signal,
            onPriorityLanes: (priority) => {
              if (!mountedRef.current || controller.signal.aborted) return;
              if (priority.some((lane) => lane.videos.length > 0)) {
                setLanes(filterAdminHomeLanes(priority));
              }
            },
          }).then(applyHome);
        }

        const categories = await categoriesPromise;
        if (mountedRef.current && !controller.signal.aborted) {
          setBrowseCategories(categories);
        }
      } catch {
        if (mountedRef.current && !controller.signal.aborted) {
          setLoadError((current) => current || "TV catalog could not be loaded right now.");
          setLanesLoading(false);
          setShellReady(true);
        }
      } finally {
        if (mountedRef.current) {
          setRefreshing(false);
          setShellReady(true);
        }
      }
    },
    [abortHome]
  );

  useEffect(() => {
    mountedRef.current = true;
    void warmTvPlaybackFailureStore();
    void loadTv();
    return () => {
      mountedRef.current = false;
      abortHome();
      abortCategory();
      abortArchive();
      openGuardRef.current = null;
    };
  }, [abortArchive, abortCategory, abortHome, loadTv]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        abortCategory();
        abortArchive();
        openGuardRef.current = null;
        setConnectingVideoId(null);
      };
    }, [abortArchive, abortCategory])
  );

  const removeQuarantinedChannel = useCallback((channelId: string) => {
    setSearchResults((current) => current.filter((video) => video.id !== channelId));
    setCategoryLane((current) =>
      current
        ? {
            ...current,
            videos: current.videos.filter((video) => video.id !== channelId),
          }
        : current
    );
    setLanes((current) =>
      current.map((lane) => ({
        ...lane,
        videos: lane.videos.filter((video) => video.id !== channelId),
      }))
    );
  }, []);

  const clearTvBrowseState = useCallback(() => {
    categoryRequestRef.current += 1;
    abortCategory();
    setActiveCategorySlug(null);
    setCategoryLane(null);
    setCategoryLaneLoading(false);
    setCategoryLaneError(null);
    setCategoryPage(1);
    setCategoryHasMore(false);
    setCategoryLoadingMore(false);
    setQuery("");
    setSearchResults([]);
    setSearching(false);
  }, [abortCategory]);

  const handleTvHomeBack = useCallback(() => {
    if (query.trim().length > 0 || activeCategorySlug) {
      clearTvBrowseState();
      return;
    }
    navigateTvHomeBack();
  }, [activeCategorySlug, clearTvBrowseState, query]);

  const handleSelectCategory = useCallback(
    (category: TvBrowseCategory) => {
      const requestId = ++categoryRequestRef.current;
      abortCategory();
      const controller = new AbortController();
      categoryAbortRef.current = controller;
      setActiveCategorySlug(category.slug);
      setCategoryLaneLoading(true);
      setCategoryLane(null);
      setCategoryLaneError(null);
      setCategoryPage(1);
      setCategoryHasMore(false);
      setCategoryLoadingMore(false);

      void fetchTvCategoryLane(category, { signal: controller.signal, page: 1 })
        .then((lane) => {
          if (requestId !== categoryRequestRef.current || controller.signal.aborted) return;
          if (lane.videos.length > 0) {
            setCategoryLane(lane);
            setCategoryPage(lane.page);
            setCategoryHasMore(lane.hasMore);
            setCategoryLaneError(null);
          } else {
            setCategoryLane(null);
            setCategoryHasMore(false);
            setCategoryLaneError(lane.transportError || null);
          }
        })
        .finally(() => {
          if (requestId === categoryRequestRef.current) {
            setCategoryLaneLoading(false);
          }
        });
    },
    [abortCategory]
  );

  const loadMoreCategory = useCallback(() => {
    if (
      !activeCategorySlug ||
      !categoryHasMore ||
      categoryLoadingMore ||
      categoryLaneLoading ||
      !categoryLane
    ) {
      return;
    }

    const category = browseCategories.find((entry) => entry.slug === activeCategorySlug);
    if (!category) return;

    const requestId = categoryRequestRef.current;
    const nextPage = categoryPage + 1;
    const controller = categoryAbortRef.current || new AbortController();
    categoryAbortRef.current = controller;
    setCategoryLoadingMore(true);

    void fetchTvCategoryLane(category, { signal: controller.signal, page: nextPage })
      .then((lane) => {
        if (requestId !== categoryRequestRef.current || controller.signal.aborted) return;
        if (!lane.videos.length) {
          setCategoryHasMore(false);
          return;
        }
        setCategoryLane((current) => {
          if (!current) return lane;
          const seen = new Set(current.videos.map((video) => video.id));
          const merged = [
            ...current.videos,
            ...lane.videos.filter((video) => !seen.has(video.id)),
          ];
          return { ...current, videos: merged };
        });
        setCategoryPage(lane.page);
        setCategoryHasMore(lane.hasMore);
      })
      .finally(() => {
        if (requestId === categoryRequestRef.current) {
          setCategoryLoadingMore(false);
        }
      });
  }, [
    activeCategorySlug,
    browseCategories,
    categoryHasMore,
    categoryLane,
    categoryLaneLoading,
    categoryLoadingMore,
    categoryPage,
  ]);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const requestId = ++tvSearchRequestIdRef.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const videos = await fetchTvSearchVideos(clean, {
          signal: controller.signal,
          limit: TV_SEARCH_PAGE_LIMIT,
        });
        if (cancelled || requestId !== tvSearchRequestIdRef.current) return;
        setSearchResults(videos);
      } catch {
        if (!cancelled && requestId === tvSearchRequestIdRef.current) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled && requestId === tvSearchRequestIdRef.current) {
          setSearching(false);
        }
      }
    }, 320);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const openVideo = useCallback(
    (
      video: HiddenTunesTvVideo,
      queueVideos?: HiddenTunesTvVideo[],
      launchOptions?: {
        query?: string;
        lane?: TvLane;
        categorySlug?: string;
        categoryTitle?: string;
      }
    ) => {
      if (openGuardRef.current) return;
      openGuardRef.current = video.id;
      setConnectingVideoId(video.id);

      const queue = queueVideos?.length ? queueVideos : [video];
      const startIndex = Math.max(0, queue.findIndex((entry) => entry.id === video.id));
      const discoveryContext = buildTvDiscoveryLaunchContext(video, {
        query: launchOptions?.query,
        laneId: launchOptions?.lane?.id,
        laneTitle: launchOptions?.lane?.title,
        categorySlug: launchOptions?.categorySlug,
        categoryTitle: launchOptions?.categoryTitle,
        browseReturnPath: "/youtube-feed",
      });

      void openVideoItemWithAlert(video, {
        queueVideos: queue,
        startIndex,
        discoveryContext,
        onQuarantined: removeQuarantinedChannel,
      }).finally(() => {
        if (openGuardRef.current === video.id) {
          openGuardRef.current = null;
        }
        if (mountedRef.current) {
          setConnectingVideoId((current) => (current === video.id ? null : current));
        }
      });
    },
    [removeQuarantinedChannel]
  );

  const renderTopChrome = useCallback(
    () => (
      <>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleTvHomeBack}
            activeOpacity={0.85}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            testID="tv-home-back-button"
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerIcon}>
            <Ionicons name="tv" size={23} color={COLORS.primaryGlow} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>CURATED</Text>
            <Text style={styles.title}>Hidden Tunes TV</Text>
          </View>
        </View>

        <View style={styles.searchShell}>
          <Ionicons name="search" size={18} color={COLORS.cyan} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search TV"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {query.length > 0 ? (
            <TouchableOpacity activeOpacity={0.8} hitSlop={8} onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </>
    ),
    [handleTvHomeBack, query]
  );

  const activeCategory = useMemo(
    () => browseCategories.find((entry) => entry.slug === activeCategorySlug) || null,
    [activeCategorySlug, browseCategories]
  );

  const renderLaneCard = useCallback(
    (
      item: HiddenTunesTvVideo,
      lane: TvLane,
      categoryMeta?: { slug: string; title: string; query?: string }
    ) => (
      <View style={styles.gridCell}>
        <TvVideoCard
          video={item}
          fillWidth
          connecting={connectingVideoId === item.id}
          onPress={(pressed) =>
            openVideo(pressed, lane.videos, {
              lane,
              categorySlug: categoryMeta?.slug,
              categoryTitle: categoryMeta?.title,
              query: categoryMeta?.query,
            })
          }
        />
      </View>
    ),
    [connectingVideoId, openVideo]
  );

  const searchLane = useMemo<TvLane>(
    () => ({ id: "search", title: "Search Results", videos: searchResults }),
    [searchResults]
  );

  const hasAdminContent =
    lanes.some((lane) => lane.videos.length > 0) || Boolean(categoryLane?.videos.length);

  const feedRows = useMemo<FeedRow[]>(() => {
    if (hasSearchText) {
      if (searching) {
        return [{ key: "search-loading", kind: "loading", label: "Searching" }];
      }
      if (searchResults.length > 0) {
        return [
          {
            key: "search-lane",
            kind: "lane",
            lane: searchLane,
            maxItems: searchLane.videos.length,
            categoryMeta: {
              slug: "search",
              title: "Search Results",
              query: query.trim(),
            },
          },
        ];
      }
      if (query.trim().length >= 2) {
        return [
          {
            key: "search-empty",
            kind: "status",
            title: "No TV matches",
            subtitle: "Try another channel, genre, or show title.",
          },
        ];
      }
      return [];
    }

    const rows: FeedRow[] = [];

    if (browseCategories.length > 0) {
      rows.push({ key: "categories", kind: "categories" });
    }

    if (categoryLaneLoading) {
      rows.push({ key: "category-loading", kind: "loading", label: "Loading category" });
    } else if (categoryLane) {
      rows.push({
        key: `category-${categoryLane.id}`,
        kind: "lane",
        lane: categoryLane,
        maxItems: categoryLane.videos.length,
        categoryMeta: activeCategory
          ? { slug: activeCategory.slug, title: activeCategory.name }
          : undefined,
      });
      if (categoryHasMore) {
        rows.push({ key: "category-load-more", kind: "load-more" });
      }
    } else if (activeCategorySlug) {
      rows.push({
        key: "category-empty",
        kind: "status",
        title: categoryLaneError ? "Category unavailable" : "No stations in this category",
        subtitle: categoryLaneError || "Try another TV category.",
      });
    }

    if (!activeCategorySlug) {
      if (!shellReady || (lanesLoading && !hasAdminContent)) {
        rows.push({ key: "home-skeleton", kind: "skeleton" });
      } else if (hasAdminContent) {
        if (featuredVideo) {
          rows.push({
            key: "featured",
            kind: "featured",
            video: featuredVideo,
            lane: featuredLane,
          });
        }
        if (recentlyAddedLane?.videos.length) {
          rows.push({
            key: `lane-${recentlyAddedLane.id}`,
            kind: "lane",
            lane: recentlyAddedLane,
          });
        }
        channelLanes
          .filter((lane) => lane.videos.length > 0)
          .slice(0, visibleLaneBudget)
          .forEach((lane) => {
            rows.push({ key: `lane-${lane.id}`, kind: "lane", lane });
          });
        if (channelLanes.filter((lane) => lane.videos.length > 0).length > visibleLaneBudget) {
          rows.push({ key: "lanes-load-more", kind: "load-more" });
        }
      } else {
        rows.push({
          key: "home-empty",
          kind: "status",
          title: loadError ? "TV catalog unavailable" : "No TV stations right now",
          subtitle:
            loadError ||
            "Hidden Tunes TV loads from the admin catalog when stations are playable.",
          retry: Boolean(loadError),
        });
      }

      if (archiveLaneLoading) {
        rows.push({ key: "archive-loading", kind: "loading", label: "Loading concert vault" });
      } else if (archiveLane?.videos.length) {
        rows.push({ key: `lane-${archiveLane.id}`, kind: "lane", lane: archiveLane });
      }
    }

    return rows;
  }, [
    activeCategory,
    activeCategorySlug,
    archiveLane,
    archiveLaneLoading,
    browseCategories.length,
    categoryHasMore,
    categoryLane,
    categoryLaneError,
    categoryLaneLoading,
    channelLanes,
    featuredLane,
    featuredVideo,
    hasAdminContent,
    hasSearchText,
    lanesLoading,
    loadError,
    query,
    recentlyAddedLane,
    searchLane,
    searchResults.length,
    searching,
    shellReady,
    visibleLaneBudget,
  ]);

  const listPerf = useMemo(
    () => getListPerformanceSettings(Math.max(feedRows.length * TV_LANE_PREVIEW_LIMIT, 24)),
    [feedRows.length]
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      markFastScrolling(true);
      const y = event.nativeEvent.contentOffset.y;
      if (y > ARCHIVE_DEFER_SCROLL_Y) {
        void loadArchiveLane();
      }
      if (y > 180 && visibleLaneBudget < channelLanes.length) {
        setVisibleLaneBudget((current) => Math.min(channelLanes.length, current + 2));
      }
    },
    [channelLanes.length, loadArchiveLane, visibleLaneBudget]
  );

  const renderFeedItem = useCallback<ListRenderItem<FeedRow>>(
    ({ item }) => {
      switch (item.kind) {
        case "categories":
          return (
            <TvBrowseCategories
              categories={browseCategories}
              activeCategory={activeCategorySlug}
              onSelectCategory={handleSelectCategory}
            />
          );
        case "skeleton":
          return <TvSkeletonCards />;
        case "loading":
          return (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>{item.label}</Text>
            </View>
          );
        case "status":
          return (
            <View style={styles.emptyBox}>
              <Ionicons
                name={item.retry ? "cloud-offline-outline" : "tv"}
                size={item.retry ? 58 : 42}
                color={item.retry ? COLORS.primary : COLORS.textMuted}
              />
              <Text style={styles.emptyTitle}>{item.title}</Text>
              {item.subtitle ? <Text style={styles.emptyText}>{item.subtitle}</Text> : null}
              {item.retry ? (
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.retryButton}
                  onPress={() => void loadTv({ refresh: true })}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        case "featured":
          return (
            <View style={styles.featuredSection}>
              <Text style={styles.sectionEyebrow}>FEATURED NOW</Text>
              <TvVideoCard
                video={item.video}
                width={featuredWidth}
                connecting={connectingVideoId === item.video.id}
                onPress={(pressed) => openVideo(pressed, item.lane?.videos, { lane: item.lane })}
              />
            </View>
          );
        case "lane":
          return (
            <View style={styles.laneSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{displayLaneTitle(item.lane.title)}</Text>
                <Text style={styles.sectionMeta}>{item.lane.videos.length} ready</Text>
              </View>
              <PremiumContentGrid
                data={item.lane.videos}
                keyExtractor={(video) => video.id}
                renderItem={({ item: video }) =>
                  renderLaneCard(video, item.lane, item.categoryMeta)
                }
                maxItems={item.maxItems ?? TV_LANE_PREVIEW_LIMIT}
                scrollEnabled={false}
                horizontalPadding={0}
                listKey={`tv-lane-${item.lane.id}`}
              />
            </View>
          );
        case "load-more":
          if (item.key === "category-load-more") {
            return (
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.loadMoreButton}
                disabled={categoryLoadingMore}
                onPress={loadMoreCategory}
              >
                {categoryLoadingMore ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Text style={styles.loadMoreText}>Load more stations</Text>
                )}
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.loadMoreButton}
              onPress={() =>
                setVisibleLaneBudget((current) =>
                  Math.min(channelLanes.length, current + 3)
                )
              }
            >
              <Text style={styles.loadMoreText}>Show more categories</Text>
            </TouchableOpacity>
          );
        default:
          return null;
      }
    },
    [
      activeCategorySlug,
      browseCategories,
      categoryLoadingMore,
      channelLanes.length,
      connectingVideoId,
      featuredWidth,
      handleSelectCategory,
      loadMoreCategory,
      loadTv,
      openVideo,
      renderLaneCard,
    ]
  );

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View style={styles.glowPurple} pointerEvents="none" />
        <View style={styles.glowCyan} pointerEvents="none" />

        <FlatList
          data={feedRows}
          keyExtractor={(item) => item.key}
          renderItem={renderFeedItem}
          ListHeaderComponent={renderTopChrome}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: scrollTailPadding }}
          onScroll={onScroll}
          scrollEventThrottle={32}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (activeCategorySlug && categoryHasMore) {
              loadMoreCategory();
            } else if (!hasSearchText && !activeCategorySlug) {
              setVisibleLaneBudget((current) =>
                Math.min(channelLanes.length || current, current + 2)
              );
              void loadArchiveLane();
            }
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadTv({ refresh: true })}
              tintColor={COLORS.primary}
            />
          }
          initialNumToRender={listPerf.initialNumToRender}
          maxToRenderPerBatch={listPerf.maxToRenderPerBatch}
          windowSize={listPerf.windowSize}
          updateCellsBatchingPeriod={listPerf.updateCellsBatchingPeriod}
          removeClippedSubviews={listPerf.removeClippedSubviews}
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 52, paddingHorizontal: 18 },
  glowPurple: {
    position: "absolute",
    top: -50,
    left: -90,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  glowCyan: {
    position: "absolute",
    top: 210,
    right: -120,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(34,211,238,0.07)",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.13)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.24)",
  },
  headerCopy: { flex: 1 },
  kicker: { color: COLORS.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 1.8 },
  title: { color: COLORS.text, fontSize: 27, fontWeight: "900", marginTop: 3 },
  searchShell: {
    minHeight: 50,
    borderRadius: 23,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(12,5,24,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    marginBottom: 18,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "700", paddingVertical: 0 },
  centerBlock: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: COLORS.textMuted, fontSize: 12, fontWeight: "800" },
  featuredSection: { marginBottom: 24 },
  sectionEyebrow: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  laneSection: { marginBottom: 24 },
  gridCell: { flex: 1, minWidth: 0 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: "900" },
  sectionMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: "800" },
  emptyBox: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 14,
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.22)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  retryText: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  loadMoreButton: {
    alignSelf: "center",
    marginBottom: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  loadMoreText: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  skeletonSection: { marginBottom: 24 },
  skeletonTitle: {
    width: 140,
    height: 18,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 12,
  },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  skeletonCard: {
    width: "47%",
    aspectRatio: 16 / 11,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
