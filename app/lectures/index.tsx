import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HTImage from "@/components/HTImage";
import { LECTURES_DEFAULT_CATEGORY_SLUG } from "@/constants/lecturesCatalog";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { useMountedRef } from "@/hooks/useMountedRef";
import {
  dedupeLectureItemsById,
  fetchEducationalCategories,
  fetchEducationalCategoryPage,
  filterEducationalBrowseItems,
  formatEducationalDuration,
  LECTURES_DEFAULT_PAGE_LIMIT,
  searchEducationalPrograms,
  type HiddenTunesLectureItem,
} from "@/services/lecturesCatalogApi";
import { listContinueLearningEntries } from "@/services/educationalProgress";
import { listEducationalRecentlyPlayed } from "@/services/educationalRecentlyPlayed";
import type { EducationalCategory } from "@/types/education";
import { openEducationalProgramDetail } from "@/utils/educationalVideoPlayback";
import { goBackWithinLectures } from "@/utils/lectureNavigation";
import { joinLectureRequest, lecturePageTrace } from "@/utils/lectureRequestJoin";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "@/utils/performanceMode";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "@/utils/tapPressGuard";

const SEARCH_DEBOUNCE_MS = 350;
const LANE_LIMIT = 12;
const openProgramTapGuard = createTapGuardState();

function hasAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function openLectureProgram(item: HiddenTunesLectureItem) {
  const key = String(item.id || item.slug || "").trim();
  if (!key || shouldIgnoreDuplicateTap(openProgramTapGuard, `lecture-open:${key}`)) return;
  openEducationalProgramDetail(item);
}

const ProgramRow = memo(function ProgramRow({ item }: { item: HiddenTunesLectureItem }) {
  const meta = [
    item.instructor_name || item.speaker_name || item.creator_name,
    formatEducationalDuration(item.duration_seconds),
    item.category_slug,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.9}
      onPress={() => openLectureProgram(item)}
    >
      <HTImage
        uri={item.artwork_url || item.cover_url || undefined}
        style={styles.artwork}
        contentFit="cover"
        maxDecodeWidth={144}
        maxDecodeHeight={144}
      />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {meta ? (
          <Text style={styles.cardMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
});

const LaneSection = memo(function LaneSection({
  title,
  items,
}: {
  title: string;
  items: HiddenTunesLectureItem[];
}) {
  const uniqueItems = dedupeLectureItemsById(items, `LaneSection:${title}`);
  if (!uniqueItems.length) return null;

  return (
    <View style={styles.laneSection}>
      <Text style={styles.laneTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneRow}>
        {uniqueItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.laneCard}
            activeOpacity={0.9}
            onPress={() => openLectureProgram(item)}
          >
            <HTImage
              uri={item.artwork_url || item.cover_url || undefined}
              style={styles.laneArt}
              contentFit="cover"
              maxDecodeWidth={120}
              maxDecodeHeight={120}
            />
            <Text style={styles.laneCardTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

export default function LecturesHomeScreen() {
  const mountedRef = useMountedRef();
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<EducationalCategory[]>([]);
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>(LECTURES_DEFAULT_CATEGORY_SLUG);
  const [items, setItems] = useState<HiddenTunesLectureItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchItems, setSearchItems] = useState<HiddenTunesLectureItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [featuredItems, setFeaturedItems] = useState<HiddenTunesLectureItem[]>([]);
  const [continueItems, setContinueItems] = useState<HiddenTunesLectureItem[]>([]);
  const [recentItems, setRecentItems] = useState<HiddenTunesLectureItem[]>([]);

  const categoryRequestRef = useRef(0);
  const searchRequestRef = useRef(0);
  const searchPagingRequestRef = useRef(0);
  const browseAbortRef = useRef<AbortController | null>(null);
  const railsAbortRef = useRef<AbortController | null>(null);
  const searchPagingAbortRef = useRef<AbortController | null>(null);
  const hasBrowseContentRef = useRef(false);
  const browseKeyRef = useRef<string | null>(null);

  const isSearching = searchQuery.trim().length > 0;
  const listItems = isSearching ? searchItems : items;
  const canLoadMore = isSearching ? searchHasMore : hasMore;

  useEffect(() => {
    lecturePageTrace("mount", { screen: "lectures/index" });
    return () => lecturePageTrace("unmount", { screen: "lectures/index" });
  }, []);

  const loadBrowsePage = useCallback(
    async (options?: { page?: number; reset?: boolean; categorySlug?: string }) => {
      const reset = options?.reset === true;
      const categorySlug = options?.categorySlug ?? selectedCategorySlug;
      const nextPage = reset ? 1 : options?.page ?? 1;
      const requestId = ++categoryRequestRef.current;
      const requestKey = `lecture-category:${categorySlug}:${nextPage}`;

      // Abort only when the resource key changes — same-key callers join the in-flight promise.
      if (browseKeyRef.current && browseKeyRef.current !== requestKey) {
        browseAbortRef.current?.abort();
      }
      browseKeyRef.current = requestKey;
      const controller = new AbortController();
      browseAbortRef.current = controller;

      try {
        setLoadError(null);
        // Keep cached browse rows visible during refresh — no full-list spinner flash.
        if (reset && !hasBrowseContentRef.current) {
          setLoading(true);
        }

        const result = await joinLectureRequest(requestKey, () =>
          fetchEducationalCategoryPage(categorySlug, {
            page: nextPage,
            limit: LECTURES_DEFAULT_PAGE_LIMIT,
            signal: controller.signal,
          })
        );
        const responseItems = filterEducationalBrowseItems(result.items);

        if (!mountedRef.current || requestId !== categoryRequestRef.current) return;
        setItems((current) =>
          dedupeLectureItemsById(
            reset ? responseItems : [...current, ...responseItems],
            reset ? "browse:reset" : "browse:append"
          )
        );
        hasBrowseContentRef.current = true;
        setPage(result.pagination.page);
        setHasMore(result.pagination.hasMore);

        // Featured rail reuses default-category browse — avoid a second network fetch.
        if (reset && categorySlug === LECTURES_DEFAULT_CATEGORY_SLUG) {
          setFeaturedItems(
            dedupeLectureItemsById(
              responseItems.filter((item) => item.is_featured).slice(0, LANE_LIMIT),
              "home:featured"
            )
          );
        }
      } catch (error) {
        if (hasAbortError(error)) {
          lecturePageTrace("fetch_aborted", { key: requestKey });
          return;
        }
        if (!mountedRef.current || requestId !== categoryRequestRef.current) return;
        setLoadError("Lectures could not be loaded right now.");
      } finally {
        if (!mountedRef.current || requestId !== categoryRequestRef.current) return;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [mountedRef, selectedCategorySlug]
  );

  const loadHomeRails = useCallback(async () => {
    railsAbortRef.current?.abort();
    const controller = new AbortController();
    railsAbortRef.current = controller;
    try {
      // Categories + local rails only. Featured comes from browse (same default slug).
      const [categoriesResult, continueResult, recentResult] = await Promise.all([
        joinLectureRequest("lecture:categories", () =>
          fetchEducationalCategories({ signal: controller.signal })
        ),
        listContinueLearningEntries(8),
        listEducationalRecentlyPlayed(8),
      ]);

      if (!mountedRef.current || controller.signal.aborted) return;
      setCategories(categoriesResult);
      setContinueItems(
        dedupeLectureItemsById(
          continueResult.map((entry) => ({
            id: entry.programId,
            slug: entry.programId,
            title: entry.programTitle,
            artwork_url: entry.programArtwork,
            instructor_name: entry.educatorName,
            subtitle: entry.sessionTitle,
          })),
          "home:continue"
        )
      );
      setRecentItems(
        dedupeLectureItemsById(
          recentResult.map((entry) => ({
            id: entry.programId,
            slug: entry.programId,
            title: entry.programTitle,
            artwork_url: entry.programArtwork,
            instructor_name: entry.educatorName,
            subtitle: entry.sessionTitle,
          })),
          "home:recent"
        )
      );
    } catch (error) {
      if (hasAbortError(error)) return;
      // Optional home rails.
    }
  }, [mountedRef]);

  useEffect(() => {
    void loadHomeRails();
    void loadBrowsePage({ reset: true });
    return () => {
      browseAbortRef.current?.abort();
      railsAbortRef.current?.abort();
      searchPagingAbortRef.current?.abort();
    };
  }, [loadBrowsePage, loadHomeRails]);

  useEffect(() => {
    if (!isSearching) return undefined;
    const controller = new AbortController();
    const requestId = ++searchRequestRef.current;
    const timer = setTimeout(() => {
      setSearchLoading(true);
      void searchEducationalPrograms(searchQuery.trim(), {
        page: 1,
        signal: controller.signal,
      })
        .then((result) => {
          if (requestId !== searchRequestRef.current) return;
          setSearchItems(
            dedupeLectureItemsById(
              filterEducationalBrowseItems(result.items),
              "search:reset"
            )
          );
          setSearchHasMore(result.pagination.hasMore);
          setSearchPage(result.pagination.page);
        })
        .catch((error) => {
          if (hasAbortError(error) || requestId !== searchRequestRef.current) return;
          setSearchItems([]);
          setSearchHasMore(false);
          setLoadError("Lectures search could not be completed right now.");
        })
        .finally(() => {
          if (requestId === searchRequestRef.current) setSearchLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isSearching, searchQuery]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadHomeRails();
    void loadBrowsePage({ reset: true });
  }, [loadBrowsePage, loadHomeRails]);

  const onEndReached = useCallback(() => {
    if (!canLoadMore || loadingMore || loading) return;
    setLoadingMore(true);

    if (isSearching) {
      const requestId = ++searchPagingRequestRef.current;
      searchPagingAbortRef.current?.abort();
      const controller = new AbortController();
      searchPagingAbortRef.current = controller;
      void searchEducationalPrograms(searchQuery.trim(), {
        page: searchPage + 1,
        signal: controller.signal,
      })
        .then((result) => {
          if (requestId !== searchPagingRequestRef.current || controller.signal.aborted) return;
          setSearchItems((current) =>
            dedupeLectureItemsById(
              filterEducationalBrowseItems([...current, ...result.items]),
              "search:append"
            )
          );
          setSearchHasMore(result.pagination.hasMore);
          setSearchPage(result.pagination.page);
        })
        .catch((error) => {
          if (hasAbortError(error)) return;
        })
        .finally(() => {
          if (requestId === searchPagingRequestRef.current) setLoadingMore(false);
        });
      return;
    }

    void loadBrowsePage({ page: page + 1 });
  }, [canLoadMore, isSearching, loadBrowsePage, loading, loadingMore, page, searchPage, searchQuery]);

  const onSelectCategory = useCallback(
    (slug: string) => {
      if (slug === selectedCategorySlug && !isSearching) return;
      setSelectedCategorySlug(slug);
      setSearchQuery("");
      setPage(1);
      setHasMore(false);
      // Keep previous rows visible until the new category page arrives.
      void loadBrowsePage({ reset: true, categorySlug: slug });
    },
    [isSearching, loadBrowsePage, selectedCategorySlug]
  );

  const listPerformance = useMemo(
    () => getListPerformanceSettings(listItems.length),
    [listItems.length]
  );
  const keyExtractor = useMemo(
    () => createStableKeyExtractor("hidden-tunes-educational-program"),
    []
  );

  const listHeader = useMemo(
    () => (
      <View>
        <View style={[styles.header, { paddingTop: Math.max(12, insets.top) }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={goBackWithinLectures}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>HIDDEN TUNES</Text>
            <Text style={styles.title}>Lectures & Learning</Text>
            <Text style={styles.subtitle}>
              Courses, tutorials, and educational sessions — metadata first, play on tap.
            </Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search courses, educators, subjects"
            placeholderTextColor={COLORS.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>

        {continueItems.length ? <LaneSection title="Continue Learning" items={continueItems} /> : null}
        {recentItems.length ? <LaneSection title="Recently Played" items={recentItems} /> : null}
        <LaneSection title="Featured Courses" items={featuredItems} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {categories.map((category) => (
            <TouchableOpacity
              key={category.slug}
              style={[styles.chip, selectedCategorySlug === category.slug && styles.chipActive]}
              onPress={() => onSelectCategory(category.slug)}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedCategorySlug === category.slug && styles.chipTextActive,
                ]}
              >
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.browseTitle}>{isSearching ? "Search Results" : "Browse Courses"}</Text>
      </View>
    ),
    [
      categories,
      continueItems,
      featuredItems,
      insets.top,
      isSearching,
      onSelectCategory,
      recentItems,
      searchQuery,
      selectedCategorySlug,
    ]
  );

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <FlatList
        data={listItems}
        keyExtractor={keyExtractor}
        renderItem={({ item }) => <ProgramRow item={item} />}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          loading || searchLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>
                {loadError ? "Lectures unavailable" : "No lectures found"}
              </Text>
              <Text style={styles.emptyText}>{loadError || "Try another subject or search."}</Text>
            </View>
          )
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
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  headerText: { flex: 1 },
  kicker: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: { color: COLORS.text, fontSize: 30, fontWeight: "900", marginTop: 4 },
  subtitle: { color: COLORS.textMuted, fontSize: 14, marginTop: 6, lineHeight: 20 },
  searchWrap: {
    marginHorizontal: 18,
    marginBottom: 12,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15 },
  chipRow: { paddingHorizontal: 18, gap: 8, paddingBottom: 12 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipActive: { backgroundColor: "rgba(56,189,248,0.18)" },
  chipText: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: COLORS.text },
  browseTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  laneSection: { marginBottom: 14 },
  laneTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  laneRow: { paddingHorizontal: 18, gap: 10 },
  laneCard: { width: 132 },
  laneArt: {
    width: 132,
    height: 132,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  laneCardTitle: { color: COLORS.text, fontSize: 12, fontWeight: "700", marginTop: 8 },
  listContent: { paddingBottom: 120 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  artwork: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cardBody: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  cardMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  center: { paddingVertical: 48, alignItems: "center", gap: 8 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  footerLoader: { paddingVertical: 18, alignItems: "center" },
});
