import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import TvLiveHomeSections, {
  preloadMatureTvPreference,
} from "@/components/tv/TvLiveHomeSections";
import TvVideoCard from "@/components/tv/TvVideoCard";
import VideoDiscoverySection from "@/components/tv/VideoDiscoverySection";
import { TESTER_COPY } from "@/constants/testerExperience";
import { COLORS, GRADIENTS } from "@/constants/theme";
import {
  TV_DEFAULT_PAGE_LIMIT,
  buildTvPlayerQueue,
  fetchTvCatalog,
  fetchTvHomeLanes,
  loadTvHomeCache,
  type HiddenTunesTvVideo,
  type TvHomeCachePayload,
} from "@/services/tvCatalogApi";

const SEARCH_DEBOUNCE_MS = 300;

type TvLaneState = {
  id: string;
  title: string;
  videos: HiddenTunesTvVideo[];
};

function mergeUniqueVideos(
  current: HiddenTunesTvVideo[],
  incoming: HiddenTunesTvVideo[]
) {
  const seen = new Set(current.map((video) => video.id));
  const merged = [...current];

  for (const video of incoming) {
    if (seen.has(video.id)) continue;
    seen.add(video.id);
    merged.push(video);
  }

  return merged;
}

export default function HiddenTunesTVScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const params = useLocalSearchParams();
  const initialQuery = String(params.q || params.query || "").trim();
  const searchCardWidth = Math.max(280, screenWidth - 40);

  const [query, setQuery] = useState(initialQuery);
  const [lanes, setLanes] = useState<TvLaneState[]>([]);
  const [searchResults, setSearchResults] = useState<HiddenTunesTvVideo[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [isSearching, setIsSearching] = useState(Boolean(initialQuery));
  const [isRefreshingHome, setIsRefreshingHome] = useState(false);
  const [isRefreshingSearch, setIsRefreshingSearch] = useState(false);
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false);
  const [homeReady, setHomeReady] = useState(false);
  const [catalogEmpty, setCatalogEmpty] = useState(false);
  const [searchEmpty, setSearchEmpty] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [matureTvEnabled, setMatureTvEnabled] = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestRef = useRef(0);
  const hydratedFromCacheRef = useRef(false);
  const tvHomeNetworkLoadedRef = useRef(false);
  const searchLoadMoreGuardRef = useRef(false);

  const hasHomeContent = useMemo(
    () => lanes.some((lane) => lane.videos.length > 0),
    [lanes]
  );

  const openTvVideo = useCallback(
    (video: HiddenTunesTvVideo, queueVideos: HiddenTunesTvVideo[]) => {
      const queue = buildTvPlayerQueue(queueVideos);
      const startIndex = Math.max(
        0,
        queue.findIndex((item) => item.videoId === video.source_id)
      );

      router.push({
        pathname: "/youtube-player",
        params: {
          id: video.source_id,
          videoId: video.source_id,
          title: video.title,
          artist: video.channel_name || "Hidden Tunes TV",
          channelTitle: video.channel_name || "Hidden Tunes TV",
          thumbnail:
            video.thumbnail_url ||
            `https://i.ytimg.com/vi/${video.source_id}/hqdefault.jpg`,
          queue: JSON.stringify(queue),
          startIndex: String(startIndex >= 0 ? startIndex : 0),
        },
      } as any);
    },
    []
  );

  const applyHomeCache = useCallback((cache: TvHomeCachePayload | null) => {
    if (!cache?.lanes?.length) return false;

    setLanes(cache.lanes);
    setCatalogEmpty(!cache.lanes.some((lane) => lane.videos.length > 0));
    setHomeReady(true);
    hydratedFromCacheRef.current = true;
    return true;
  }, []);

  const refreshHome = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshingHome(true);

    try {
      const result = await fetchTvHomeLanes();
      setLanes(result.lanes);
      setCatalogEmpty(!result.hasAnyVideos);
      setHomeReady(true);
      setStatusMessage(null);
    } catch {
      if (!hydratedFromCacheRef.current) {
        setStatusMessage(TESTER_COPY.tvCatalogRefresh);
      }
    } finally {
      setIsRefreshingHome(false);
    }
  }, []);

  const runCatalogSearch = useCallback(
    async (searchQuery: string, page = 1, append = false) => {
      const clean = searchQuery.trim();
      const requestId = ++searchRequestRef.current;

      if (!clean) {
        setIsSearching(false);
        setSearchResults([]);
        setSearchEmpty(false);
        setSearchHasMore(false);
        setSearchPage(1);
        return;
      }

      setIsSearching(true);

      if (!append) {
        setIsRefreshingSearch(true);
      } else {
        setIsLoadingMoreSearch(true);
      }

      try {
        const response = await fetchTvCatalog({
          q: clean,
          page,
          limit: TV_DEFAULT_PAGE_LIMIT,
        });

        if (requestId !== searchRequestRef.current) return;

        if (!response.success) {
          if (!append) {
            setStatusMessage(TESTER_COPY.tvSearchUnavailable);
          }
          return;
        }

        setSearchResults((current) =>
          append ? mergeUniqueVideos(current, response.videos) : response.videos
        );
        setSearchEmpty(response.videos.length === 0 && !append);
        setSearchPage(response.pagination.page);
        setSearchHasMore(response.pagination.hasMore);
        setStatusMessage(null);
      } catch {
        if (requestId === searchRequestRef.current && !append) {
          setStatusMessage(TESTER_COPY.tvSearchUnavailable);
        }
      } finally {
        if (requestId === searchRequestRef.current) {
          setIsRefreshingSearch(false);
          setIsLoadingMoreSearch(false);
        }
      }
    },
    []
  );

  const loadMoreSearch = useCallback(() => {
    if (
      !isSearching ||
      !searchHasMore ||
      isLoadingMoreSearch ||
      searchLoadMoreGuardRef.current
    ) {
      return;
    }

    searchLoadMoreGuardRef.current = true;
    void runCatalogSearch(query, searchPage + 1, true).finally(() => {
      searchLoadMoreGuardRef.current = false;
    });
  }, [
    isSearching,
    isLoadingMoreSearch,
    query,
    runCatalogSearch,
    searchHasMore,
    searchPage,
  ]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function bootstrap() {
        const [cache, matureEnabled] = await Promise.all([
          loadTvHomeCache(),
          preloadMatureTvPreference(),
        ]);
        if (!active) return;

        setMatureTvEnabled(matureEnabled);

        if (cache) {
          applyHomeCache(cache);
        }

        if (!tvHomeNetworkLoadedRef.current) {
          tvHomeNetworkLoadedRef.current = true;
          refreshHome(!cache);
        }

        if (initialQuery) {
          runCatalogSearch(initialQuery, 1, false);
        }
      }

      let frameId: number | null = null;

      const interactionHandle = InteractionManager.runAfterInteractions(() => {
        frameId = requestAnimationFrame(() => {
          if (!active) return;
          void bootstrap();
        });
      });

      return () => {
        active = false;
        interactionHandle.cancel();
        if (frameId !== null) {
          cancelAnimationFrame(frameId);
        }
      };
    }, [applyHomeCache, initialQuery, refreshHome, runCatalogSearch])
  );

  useEffect(() => {
    const cleanQuery = query.trim();

    if (!cleanQuery) {
      setIsSearching(false);
      setSearchResults([]);
      setSearchEmpty(false);
      setSearchHasMore(false);
      setSearchPage(1);
      return;
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      runCatalogSearch(cleanQuery, 1, false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [query, runCatalogSearch]);

  const showCatalogEmpty =
    !isSearching && homeReady && !hasHomeContent && catalogEmpty;
  const showSearchEmpty =
    isSearching && !isRefreshingSearch && searchEmpty && query.trim().length > 0;

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>CURATED</Text>
          <Text style={styles.title}>Hidden Tunes TV</Text>
          <Text style={styles.subtitle}>
            Live TV channels and curated video discovery. Official streams and
            embeds only.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.iconButton}
          activeOpacity={0.85}
          onPress={() => refreshHome(true)}
        >
          <Ionicons name="refresh" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={19} color={COLORS.cyan} />

        <TextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            if (text.trim()) {
              setIsSearching(true);
            } else {
              setIsSearching(false);
              setSearchResults([]);
              setSearchEmpty(false);
            }
          }}
          placeholder="Search Hidden Tunes TV..."
          placeholderTextColor={COLORS.textDim}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.searchInput}
        />

        {query.length > 0 ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setQuery("")}
          >
            <Ionicons name="close-circle" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="tv" size={20} color={COLORS.primary} />
        )}
      </View>

      {statusMessage ? (
        <Text style={styles.statusMessage}>{statusMessage}</Text>
      ) : null}

      {isSearching ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.35}
          onEndReached={loadMoreSearch}
          ListHeaderComponent={
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Search results</Text>
              <Text style={styles.resultsSub}>
                {isRefreshingSearch && searchResults.length > 0
                  ? "Updating results..."
                  : `${searchResults.length} playable videos`}
              </Text>
            </View>
          }
          ListEmptyComponent={
            showSearchEmpty ? (
              <View style={styles.emptyBox}>
                <Ionicons name="search" size={34} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>
                  No TV results yet for this search.
                </Text>
              </View>
            ) : isRefreshingSearch ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingText}>Searching TV catalog...</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            <View style={styles.footerBox}>
              {isLoadingMoreSearch ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : searchHasMore ? (
                <TouchableOpacity
                  style={styles.loadMoreButton}
                  onPress={loadMoreSearch}
                  activeOpacity={0.88}
                >
                  <Text style={styles.loadMoreText}>Load more results</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ height: 120 }} />
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.searchRow}>
              <TvVideoCard
                video={item}
                width={searchCardWidth}
                onPress={(video) => openTvVideo(video, searchResults)}
              />
            </View>
          )}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {!homeReady && !hydratedFromCacheRef.current ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading Hidden Tunes TV...</Text>
            </View>
          ) : null}

          {isRefreshingHome && homeReady ? (
            <Text style={styles.refreshingText}>Refreshing catalog...</Text>
          ) : null}

          <TvLiveHomeSections
            matureEnabled={matureTvEnabled}
            onMatureEnabledChange={setMatureTvEnabled}
          />

          {showCatalogEmpty ? (
            <View style={styles.emptyBox}>
              <Ionicons name="tv-outline" size={38} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>
                Video Discovery catalog is being prepared. Add approved playable
                videos from admin.
              </Text>
            </View>
          ) : (
            <VideoDiscoverySection
              lanes={lanes}
              onPressVideo={openTvVideo}
            />
          )}

          <View style={{ height: 130 }} />
        </ScrollView>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  headerCopy: {
    flex: 1,
    paddingRight: 14,
  },

  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
  },

  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: "900",
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    fontWeight: "700",
  },

  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  searchBox: {
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 17,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.24)",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  searchInput: {
    flex: 1,
    color: COLORS.text,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "800",
  },

  statusMessage: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },

  scrollContent: {
    paddingBottom: 20,
  },

  listContent: {
    paddingBottom: 20,
  },

  laneSection: {
    marginBottom: 22,
  },

  laneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  laneTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },

  laneCount: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "800",
  },

  resultsHeader: {
    marginBottom: 14,
  },

  resultsTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },

  resultsSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  searchRow: {
    marginBottom: 14,
  },

  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },

  loadingText: {
    color: COLORS.textMuted,
    marginTop: 10,
    fontSize: 12,
    fontWeight: "800",
  },

  refreshingText: {
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
  },

  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  emptyTitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 12,
  },

  footerBox: {
    alignItems: "center",
    paddingVertical: 16,
  },

  loadMoreButton: {
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  loadMoreText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "900",
  },
});
