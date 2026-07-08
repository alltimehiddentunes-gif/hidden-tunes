import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import AppShell from "../components/navigation/AppShell";
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
  TV_LANE_PAGE_LIMIT,
  type HiddenTunesTvVideo,
  type TvHomeLane,
} from "@/services/tvCatalogApi";
import { openVideoItem } from "@/services/videos/openVideoItem";

type TvLane = TvHomeLane;

function displayLaneTitle(title: string) {
  if (title === "Documentary Nights") return "Documentary";
  if (title === "Live Performances") return "Live Performance";
  return title;
}

export default function YouTubeFeedScreen() {
  const [lanes, setLanes] = useState<TvLane[]>([]);
  const [browseCategories, setBrowseCategories] = useState<TvBrowseCategory[]>([]);
  const [activeCategorySlug, setActiveCategorySlug] = useState<string | null>(null);
  const [categoryLane, setCategoryLane] = useState<TvLane | null>(null);
  const [categoryLaneLoading, setCategoryLaneLoading] = useState(false);
  const [archiveLane, setArchiveLane] = useState<TvLane | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<HiddenTunesTvVideo[]>([]);
  const [archiveLaneLoading, setArchiveLaneLoading] = useState(false);
  const tvSearchRequestIdRef = useRef(0);
  const categoryRequestRef = useRef(0);
  const { width } = useWindowDimensions();
  const railCardWidth = Math.min(260, Math.max(178, width * 0.58));
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

  const loadArchiveLane = useCallback(async () => {
    setArchiveLaneLoading(true);
    try {
      const lane = await fetchArchiveConcertLane();
      setArchiveLane(lane.videos.length > 0 ? lane : null);
    } catch {
      setArchiveLane(null);
    } finally {
      setArchiveLaneLoading(false);
    }
  }, []);

  const loadTv = useCallback(async () => {
    setLoading(true);
    try {
      const cached = await loadTvHomeCache();
      const hasFreshCache = Boolean(cached?.lanes?.length);

      if (hasFreshCache) {
        setLanes(filterAdminHomeLanes(cached!.lanes));
        setLoading(false);
      }

      const categoriesPromise = fetchTvCategories();

      if (!hasFreshCache) {
        const home = await fetchTvHomeLanes();
        if (home.lanes.length) {
          setLanes(filterAdminHomeLanes(home.lanes));
        } else {
          setLanes([]);
        }
      } else {
        void fetchTvHomeLanes().then((home) => {
          if (home.lanes.length) {
            setLanes(filterAdminHomeLanes(home.lanes));
          }
        });
      }

      setBrowseCategories(await categoriesPromise);
      void loadArchiveLane();
    } catch {
      setLanes([]);
    } finally {
      setLoading(false);
    }
  }, [loadArchiveLane]);

  useEffect(() => {
    void loadTv();
  }, [loadTv]);

  const handleSelectCategory = useCallback((category: TvBrowseCategory) => {
    const requestId = ++categoryRequestRef.current;
    setActiveCategorySlug(category.slug);
    setCategoryLaneLoading(true);
    setCategoryLane(null);

    void fetchTvCategoryLane(category)
      .then((lane) => {
        if (requestId !== categoryRequestRef.current) return;
        setCategoryLane(lane.videos.length > 0 ? lane : null);
      })
      .finally(() => {
        if (requestId === categoryRequestRef.current) {
          setCategoryLaneLoading(false);
        }
      });
  }, []);

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
          limit: TV_LANE_PAGE_LIMIT * 2,
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

  const openVideo = useCallback((video: HiddenTunesTvVideo, queueVideos?: HiddenTunesTvVideo[]) => {
    void openVideoItem(video, { queueVideos: queueVideos?.length ? queueVideos : [video] });
  }, []);

  const renderLane = useCallback(
    (lane: TvLane) => {
      if (!lane.videos.length) return null;
      return (
        <View key={lane.id} style={styles.laneSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{displayLaneTitle(lane.title)}</Text>
            <Text style={styles.sectionMeta}>{lane.videos.length} ready</Text>
          </View>
          <FlatList
            horizontal
            data={lane.videos}
            keyExtractor={(video) => video.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.railContent}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item }) => (
              <TvVideoCard
                video={item}
                width={railCardWidth}
                onPress={(pressed) => openVideo(pressed, lane.videos)}
              />
            )}
          />
        </View>
      );
    },
    [openVideo, railCardWidth]
  );

  const searchLane = useMemo<TvLane>(
    () => ({ id: "search", title: "Search Results", videos: searchResults }),
    [searchResults]
  );

  const hasAdminContent =
    lanes.some((lane) => lane.videos.length > 0) ||
    Boolean(categoryLane?.videos.length);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View style={styles.glowPurple} />
        <View style={styles.glowCyan} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
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

          {loading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading TV</Text>
            </View>
          ) : hasSearchText ? (
            <View style={styles.searchResultsWrap}>
              {searching ? (
                <View style={styles.centerBlock}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingText}>Searching</Text>
                </View>
              ) : searchResults.length > 0 ? (
                renderLane(searchLane)
              ) : query.trim().length >= 2 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="search" size={42} color={COLORS.textMuted} />
                  <Text style={styles.emptyTitle}>No TV matches</Text>
                  <Text style={styles.emptyText}>Try another channel, genre, or show title.</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <>
              {browseCategories.length > 0 ? (
                <TvBrowseCategories
                  categories={browseCategories}
                  activeCategory={activeCategorySlug}
                  onSelectCategory={handleSelectCategory}
                />
              ) : null}

              {categoryLaneLoading ? (
                <View style={styles.centerBlock}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingText}>Loading category</Text>
                </View>
              ) : categoryLane ? (
                renderLane(categoryLane)
              ) : activeCategorySlug ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>No stations in this category</Text>
                  <Text style={styles.emptyText}>Try another TV category.</Text>
                </View>
              ) : null}

              {hasAdminContent ? (
                <>
                  {featuredVideo ? (
                    <View style={styles.featuredSection}>
                      <Text style={styles.sectionEyebrow}>FEATURED NOW</Text>
                      <TvVideoCard
                        video={featuredVideo}
                        width={featuredWidth}
                        onPress={(item) => openVideo(item, featuredLane?.videos)}
                      />
                    </View>
                  ) : null}
                  {recentlyAddedLane ? renderLane(recentlyAddedLane) : null}
                  {channelLanes.map(renderLane)}
                </>
              ) : !categoryLaneLoading && !activeCategorySlug ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="tv" size={58} color={COLORS.primary} />
                  <Text style={styles.emptyTitle}>No TV stations right now</Text>
                  <Text style={styles.emptyText}>
                    Hidden Tunes TV loads from the admin catalog when stations are playable.
                  </Text>
                </View>
              ) : null}

              {archiveLaneLoading ? (
                <View style={styles.centerBlock}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingText}>Loading concert vault</Text>
                </View>
              ) : archiveLane ? (
                renderLane(archiveLane)
              ) : null}
            </>
          )}
        </ScrollView>
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
  scrollContent: { paddingBottom: 150 },
  header: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 16 },
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: "900" },
  sectionMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: "800" },
  railContent: { paddingRight: 18 },
  searchResultsWrap: { minHeight: 180 },
  emptyBox: { minHeight: 180, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
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
});
