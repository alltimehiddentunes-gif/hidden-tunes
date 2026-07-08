import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { router } from "expo-router";

import HTImage from "../../components/HTImage";
import { COLORS } from "../../constants/theme";
import {
  fetchAudiobookCategory,
  fetchAudiobookTree,
  formatAudiobookDuration,
  searchAudiobooks,
} from "../../services/audiobooksApi";
import type { AudiobookCategory, AudiobookItem } from "../../types/audiobooks";

const PAGE_LIMIT = 40;
const SEARCH_DEBOUNCE_MS = 350;

function itemKey(item: AudiobookItem) {
  return item.id || item.slug;
}

function hasAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

const AudiobookRow = memo(function AudiobookRow({ item }: { item: AudiobookItem }) {
  const meta = [
    item.author_name,
    formatAudiobookDuration(item.duration_seconds),
    item.chapter_count ? `${item.chapter_count} chapters` : null,
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.bookRow}
      onPress={() => router.push(`/audiobooks/${encodeURIComponent(item.slug || item.id)}` as any)}
    >
      <View style={styles.coverWrap}>
        {item.cover_url ? (
          <HTImage
            uri={item.cover_url}
            style={styles.coverImage}
            contentFit="cover"
            maxDecodeWidth={136}
            maxDecodeHeight={136}
          />
        ) : (
          <Ionicons name="book-outline" size={26} color={COLORS.primary} />
        )}
      </View>
      <View style={styles.bookCopy}>
        <Text numberOfLines={2} style={styles.bookTitle}>
          {item.title}
        </Text>
        {meta ? (
          <Text numberOfLines={1} style={styles.bookMeta}>
            {meta}
          </Text>
        ) : null}
        {item.description ? (
          <Text numberOfLines={2} style={styles.bookDescription}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
});

export default function AudiobooksHomeScreen() {
  const [categories, setCategories] = useState<AudiobookCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("fiction");
  const [items, setItems] = useState<AudiobookItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchItems, setSearchItems] = useState<AudiobookItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const categoryRequestRef = useRef(0);
  const searchRequestRef = useRef(0);
  const categoryPaginationRequestRef = useRef(0);
  const searchPaginationRequestRef = useRef(0);
  const selectedCategoryRef = useRef(selectedCategory);
  const searchQueryRef = useRef(searchQuery);

  const isSearching = searchQuery.trim().length > 0;
  const listItems = isSearching ? searchItems : items;
  const canLoadMore = isSearching ? searchHasMore : hasMore;
  const isLoadingMore = isSearching ? searchLoadingMore : loadingMore;

  useEffect(() => {
    selectedCategoryRef.current = selectedCategory;
  }, [selectedCategory]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingCategories(true);

    void fetchAudiobookTree(controller.signal)
      .then((nextCategories) => {
        setCategories(nextCategories);
        if (nextCategories.length > 0) {
          setSelectedCategory((current) => {
            if (
              nextCategories.some((category) => category.slug === current) &&
              (nextCategories.find((category) => category.slug === current)?.item_count || 0) > 0
            ) {
              return current;
            }

            const firstPopulated =
              nextCategories.find((category) => category.item_count > 0) ||
              nextCategories[0];
            return firstPopulated.slug;
          });
        }
      })
      .catch((error) => {
        if (hasAbortError(error)) return;
        setCategories([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCategories(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedCategory) return undefined;
    const controller = new AbortController();
    const requestId = ++categoryRequestRef.current;

    setLoadingItems(true);
    setLoadError(false);
    setPage(1);

    void fetchAudiobookCategory(selectedCategory, {
      page: 1,
      limit: PAGE_LIMIT,
      signal: controller.signal,
    })
      .then((result) => {
        if (requestId !== categoryRequestRef.current) return;
        setItems(result.items);
        setHasMore(result.pagination.hasMore);
        setPage(result.pagination.page);
      })
      .catch((error) => {
        if (hasAbortError(error) || requestId !== categoryRequestRef.current) return;
        setItems([]);
        setHasMore(false);
        setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === categoryRequestRef.current) {
          setLoadingItems(false);
        }
      });

    return () => controller.abort();
  }, [selectedCategory]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchItems([]);
      setSearchPage(1);
      setSearchHasMore(false);
      setSearchLoading(false);
      setSearchError(false);
      return undefined;
    }

    const controller = new AbortController();
    const requestId = ++searchRequestRef.current;
    setSearchLoading(true);
    setSearchError(false);
    const timer = setTimeout(() => {
      void searchAudiobooks(query, {
        page: 1,
        limit: PAGE_LIMIT,
        signal: controller.signal,
      })
        .then((result) => {
          if (requestId !== searchRequestRef.current) return;
          setSearchItems(result.items);
          setSearchHasMore(result.pagination.hasMore);
          setSearchPage(result.pagination.page);
        })
        .catch((error) => {
          if (hasAbortError(error) || requestId !== searchRequestRef.current) return;
          setSearchItems([]);
          setSearchHasMore(false);
          setSearchError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted && requestId === searchRequestRef.current) {
            setSearchLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const selectedCategoryTitle = useMemo(
    () =>
      categories.find((category) => category.slug === selectedCategory)?.title ||
      "Audiobooks",
    [categories, selectedCategory]
  );

  const loadMore = useCallback(() => {
    if (!canLoadMore || isLoadingMore) return;

    if (isSearching) {
      const query = searchQuery.trim();
      if (!query) return;
      const nextPage = searchPage + 1;
      const requestId = ++searchPaginationRequestRef.current;
      setSearchLoadingMore(true);
      void searchAudiobooks(query, { page: nextPage, limit: PAGE_LIMIT })
        .then((result) => {
          if (
            requestId !== searchPaginationRequestRef.current ||
            query !== searchQueryRef.current.trim()
          ) {
            return;
          }
          setSearchItems((current) => {
            const seen = new Set(current.map(itemKey));
            return [
              ...current,
              ...result.items.filter((item) => {
                const key = itemKey(item);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              }),
            ];
          });
          setSearchHasMore(result.pagination.hasMore);
          setSearchPage(result.pagination.page);
        })
        .catch(() => {
          if (requestId === searchPaginationRequestRef.current) {
            setSearchHasMore(false);
          }
        })
        .finally(() => {
          if (requestId === searchPaginationRequestRef.current) {
            setSearchLoadingMore(false);
          }
        });
      return;
    }

    const nextPage = page + 1;
    const categorySlug = selectedCategory;
    const requestId = ++categoryPaginationRequestRef.current;
    setLoadingMore(true);
    void fetchAudiobookCategory(categorySlug, {
      page: nextPage,
      limit: PAGE_LIMIT,
    })
      .then((result) => {
        if (
          requestId !== categoryPaginationRequestRef.current ||
          categorySlug !== selectedCategoryRef.current
        ) {
          return;
        }
        setItems((current) => {
          const seen = new Set(current.map(itemKey));
          return [
            ...current,
            ...result.items.filter((item) => {
              const key = itemKey(item);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            }),
          ];
        });
        setHasMore(result.pagination.hasMore);
        setPage(result.pagination.page);
      })
      .catch(() => {
        if (requestId === categoryPaginationRequestRef.current) {
          setHasMore(false);
        }
      })
      .finally(() => {
        if (requestId === categoryPaginationRequestRef.current) {
          setLoadingMore(false);
        }
      });
  }, [
    canLoadMore,
    isLoadingMore,
    isSearching,
    page,
    searchPage,
    searchQuery,
    selectedCategory,
  ]);
  const renderItem = useCallback(
    ({ item }: { item: AudiobookItem }) => <AudiobookRow item={item} />,
    []
  );
  const keyExtractor = useCallback((item: AudiobookItem) => itemKey(item), []);

  return (
    <LinearGradient colors={["#101514", "#050706"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.84}
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>HIDDEN TUNES AUDIOBOOKS</Text>
          <Text style={styles.title}>Browse Audiobooks</Text>
          <Text style={styles.subtitle}>Metadata-first discovery for public audiobook listening.</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search audiobooks..."
          placeholderTextColor={COLORS.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearButton}>
            <Ionicons name="close" size={16} color={COLORS.text} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loadingCategories ? (
        <ActivityIndicator color={COLORS.primary} style={styles.categoryLoader} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRail}
        >
          {categories.map((category) => {
            const active = category.slug === selectedCategory && !isSearching;
            return (
              <TouchableOpacity
                key={category.slug}
                activeOpacity={0.85}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => {
                  setSearchQuery("");
                  setSelectedCategory(category.slug);
                }}
              >
                <Ionicons
                  name="book-outline"
                  size={15}
                  color={active ? "#00130D" : COLORS.textMuted}
                />
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {category.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>
          {isSearching ? `Search: ${searchQuery.trim()}` : selectedCategoryTitle}
        </Text>
        <Text style={styles.sectionMeta}>{listItems.length} loaded</Text>
      </View>

      {(loadingItems && !isSearching) || searchLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : loadError || searchError ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={28} color={COLORS.textMuted} />
          <Text style={styles.stateText}>Audiobooks are unavailable right now.</Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.45}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={60}
          windowSize={7}
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Ionicons name="book-outline" size={28} color={COLORS.textMuted} />
              <Text style={styles.stateText}>No audiobooks found.</Text>
            </View>
          }
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator color={COLORS.primary} style={styles.footerLoader} />
            ) : null
          }
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 62,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
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
  headerCopy: {
    flex: 1,
    marginLeft: 14,
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  title: {
    marginTop: 4,
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 6,
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  searchWrap: {
    marginTop: 20,
    marginHorizontal: 20,
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  clearButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  categoryLoader: {
    marginTop: 18,
  },
  categoryRail: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  categoryChip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  categoryTextActive: {
    color: "#00130D",
  },
  listHeader: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    flex: 1,
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 10,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  bookRow: {
    minHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  coverWrap: {
    width: 68,
    height: 68,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  bookCopy: {
    flex: 1,
    marginHorizontal: 13,
  },
  bookTitle: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  bookMeta: {
    marginTop: 5,
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  bookDescription: {
    marginTop: 5,
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  centerState: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  stateText: {
    marginTop: 10,
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  footerLoader: {
    paddingVertical: 22,
  },
});
