import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  joinLectureRequest,
  lecturePageTrace,
} from "@/utils/lectureRequestJoin";
import { getPremiumGridLayout } from "@/utils/premiumGridLayout";
import { getListPerformanceSettings } from "@/utils/performanceMode";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "@/utils/tapPressGuard";

const SEARCH_DEBOUNCE_MS = 350;
const LANE_LIMIT = 12;
const GRID_GUTTER = 12;
const GRID_PADDING = 18;
const openProgramTapGuard = createTapGuardState();

function hasAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function openLectureProgram(item: HiddenTunesLectureItem) {
  const key = String(item.id || item.slug || "").trim();
  if (!key || shouldIgnoreDuplicateTap(openProgramTapGuard, `lecture-open:${key}`)) return;
  openEducationalProgramDetail(item);
}

type LecturePageRow =
  | { type: "section-header"; id: string; title: string }
  | {
      type: "grid-row";
      id: string;
      items: [HiddenTunesLectureItem] | [HiddenTunesLectureItem, HiddenTunesLectureItem];
    };

function chunkPairs(items: HiddenTunesLectureItem[]): LecturePageRow[] {
  const rows: LecturePageRow[] = [];
  for (let index = 0; index < items.length; index += 2) {
    const left = items[index];
    const right = items[index + 1];
    rows.push({
      type: "grid-row",
      id: `grid-${left.id}-${right?.id || "solo"}`,
      items: right ? [left, right] : [left],
    });
  }
  return rows;
}

function appendSection(
  rows: LecturePageRow[],
  title: string,
  sectionId: string,
  items: HiddenTunesLectureItem[]
) {
  if (!items.length) return;
  rows.push({ type: "section-header", id: `section-${sectionId}`, title });
  rows.push(...chunkPairs(items));
}

const LectureGridCard = memo(function LectureGridCard({
  item,
  width,
}: {
  item: HiddenTunesLectureItem;
  width: number;
}) {
  const meta = [
    item.instructor_name || item.speaker_name || item.creator_name,
    formatEducationalDuration(item.duration_seconds),
    item.category_slug,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TouchableOpacity
      style={[styles.gridCard, { width }]}
      activeOpacity={0.9}
      onPress={() => openLectureProgram(item)}
    >
      <HTImage
        uri={item.artwork_url || item.cover_url || undefined}
        style={[styles.gridArt, { width, height: width }]}
        contentFit="cover"
        maxDecodeWidth={220}
        maxDecodeHeight={220}
      />
      <Text style={styles.gridTitle} numberOfLines={2}>
        {item.title}
      </Text>
      {meta ? (
        <Text style={styles.gridMeta} numberOfLines={2}>
          {meta}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

export default function LecturesHomeScreen() {
  const mountedRef = useMountedRef();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const gridLayout = useMemo(
    () =>
      getPremiumGridLayout({
        windowWidth,
        columns: 2,
        gutter: GRID_GUTTER,
        horizontalPadding: GRID_PADDING,
      }),
    [windowWidth]
  );
  const cardWidth = gridLayout.itemWidth;

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
  const searchPagingAbortRef = useRef<AbortController | null>(null);
  const hasBrowseContentRef = useRef(false);
  const browseKeyRef = useRef<string | null>(null);
  const landingGenerationRef = useRef(0);

  const isSearching = searchQuery.trim().length > 0;
  const listItems = isSearching ? searchItems : items;
  const canLoadMore = isSearching ? searchHasMore : hasMore;
  const bottomPad = 120 + Math.max(insets.bottom, 8);

  useEffect(() => {
    lecturePageTrace("landing_mount", {
      route: "/lectures",
      hasCachedBrowse: hasBrowseContentRef.current,
    });
    return () =>
      lecturePageTrace("landing_unmount", {
        route: "/lectures",
        hasCachedBrowse: hasBrowseContentRef.current,
      });
  }, []);

  const loadBrowsePage = useCallback(
    async (options?: { page?: number; reset?: boolean; categorySlug?: string }) => {
      const reset = options?.reset === true;
      const categorySlug = options?.categorySlug ?? selectedCategorySlug;
      const nextPage = reset ? 1 : options?.page ?? 1;
      const requestId = ++categoryRequestRef.current;
      const requestKey = `lecture-category:${categorySlug}:${nextPage}`;
      const generation = landingGenerationRef.current;

      // Abort only when the resource key changes — never on Strict Mode remount.
      if (browseKeyRef.current && browseKeyRef.current !== requestKey) {
        browseAbortRef.current?.abort();
      }
      browseKeyRef.current = requestKey;
      const controller = new AbortController();
      browseAbortRef.current = controller;

      try {
        setLoadError(null);
        // Keep cached cards visible during refresh; skeleton only on first paint.
        if (reset && !hasBrowseContentRef.current) {
          setLoading(true);
        }

        const result = await joinLectureRequest(
          requestKey,
          () =>
            fetchEducationalCategoryPage(categorySlug, {
              page: nextPage,
              limit: LECTURES_DEFAULT_PAGE_LIMIT,
              signal: controller.signal,
            }),
          {
            tracePrefix: "landing_fetch",
            payload: {
              route: "/lectures",
              categoryId: categorySlug,
              generation,
              hasCachedData: hasBrowseContentRef.current,
            },
          }
        );
        // Preserve API order — only drop duplicate ids, never shuffle.
        const responseItems = filterEducationalBrowseItems(result.items);

        if (
          !mountedRef.current ||
          requestId !== categoryRequestRef.current ||
          generation !== landingGenerationRef.current
        ) {
          return;
        }
        setItems((current) =>
          dedupeLectureItemsById(
            reset ? responseItems : [...current, ...responseItems],
            reset ? "browse:reset" : "browse:append"
          )
        );
        hasBrowseContentRef.current = true;
        setPage(result.pagination.page);
        setHasMore(result.pagination.hasMore);

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
          lecturePageTrace("landing_fetch_aborted", { key: requestKey, generation });
          return;
        }
        if (
          !mountedRef.current ||
          requestId !== categoryRequestRef.current ||
          generation !== landingGenerationRef.current
        ) {
          return;
        }
        setLoadError("Lectures could not be loaded right now.");
      } finally {
        if (
          !mountedRef.current ||
          requestId !== categoryRequestRef.current ||
          generation !== landingGenerationRef.current
        ) {
          return;
        }
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [mountedRef, selectedCategorySlug]
  );

  const loadHomeRails = useCallback(async () => {
    const generation = landingGenerationRef.current;
    try {
      // Join shared category request — do not abort on remount; local lists are cheap.
      const [categoriesResult, continueResult, recentResult] = await Promise.all([
        joinLectureRequest(
          "lecture:categories",
          () => fetchEducationalCategories(),
          {
            tracePrefix: "landing_fetch",
            payload: {
              route: "/lectures",
              generation,
              hasCachedData: hasBrowseContentRef.current,
            },
          }
        ),
        listContinueLearningEntries(8),
        listEducationalRecentlyPlayed(8),
      ]);

      if (!mountedRef.current || generation !== landingGenerationRef.current) return;
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
    }
  }, [mountedRef]);

  useEffect(() => {
    // Mount-only. Category changes load via onSelectCategory — do not also
    // depend on loadBrowsePage or selecting a chip starts a second full fetch.
    void loadHomeRails();
    void loadBrowsePage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only
  }, []);

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
      void loadBrowsePage({ reset: true, categorySlug: slug });
    },
    [isSearching, loadBrowsePage, selectedCategorySlug]
  );

  const pageRows = useMemo(() => {
    const rows: LecturePageRow[] = [];
    if (!isSearching) {
      appendSection(rows, "Continue Learning", "continue", continueItems);
      appendSection(rows, "Recently Played", "recent", recentItems);
      appendSection(rows, "Featured Courses", "featured", featuredItems);
    }
    appendSection(
      rows,
      isSearching ? "Search Results" : "Browse Courses",
      isSearching ? "search" : "browse",
      listItems
    );
    return rows;
  }, [continueItems, featuredItems, isSearching, listItems, recentItems]);

  const listPerformance = useMemo(
    () => getListPerformanceSettings(pageRows.length),
    [pageRows.length]
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

        <View style={styles.chipWrap}>
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
        </View>
      </View>
    ),
    [categories, insets.top, onSelectCategory, searchQuery, selectedCategorySlug]
  );

  const renderRow = useCallback(
    ({ item }: { item: LecturePageRow }) => {
      if (item.type === "section-header") {
        return (
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {item.title}
          </Text>
        );
      }

      return (
        <View style={[styles.gridRow, { gap: GRID_GUTTER, paddingHorizontal: GRID_PADDING }]}>
          {item.items.map((card) => (
            <LectureGridCard key={card.id} item={card} width={cardWidth} />
          ))}
          {item.items.length === 1 ? <View style={{ width: cardWidth }} /> : null}
        </View>
      );
    },
    [cardWidth]
  );

  const keyExtractor = useCallback((row: LecturePageRow) => row.id, []);

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <FlatList
        data={pageRows}
        keyExtractor={keyExtractor}
        renderItem={renderRow}
        ListHeaderComponent={listHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
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
          ) : (
            <View style={styles.footerSpacer} />
          )
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
  chipWrap: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipActive: { backgroundColor: "rgba(56,189,248,0.18)" },
  chipText: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: COLORS.text },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    paddingHorizontal: 18,
    marginTop: 10,
    marginBottom: 10,
  },
  gridRow: {
    flexDirection: "row",
    marginBottom: GRID_GUTTER,
  },
  gridCard: {
    overflow: "hidden",
  },
  gridArt: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  gridTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 8,
    minHeight: 36,
  },
  gridMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    minHeight: 32,
  },
  listContent: { flexGrow: 1 },
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
  footerSpacer: { height: 8 },
});
