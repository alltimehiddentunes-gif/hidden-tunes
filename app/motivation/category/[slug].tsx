import { memo, useCallback, useEffect, useRef, useState } from "react";
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

import HTImage from "@/components/HTImage";
import AppShell from "@/components/navigation/AppShell";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { useMountedRef } from "@/hooks/useMountedRef";
import {
  fetchMotivationCategoryPage,
  formatMotivationDuration,
  MOTIVATION_DEFAULT_PAGE_LIMIT,
} from "@/services/motivationCatalogApi";
import type { MotivationItem } from "@/types/motivation";

const CategoryItemCard = memo(function CategoryItemCard({
  item,
  onPress,
}: {
  item: MotivationItem;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={onPress}>
      <HTImage uri={item.artwork || undefined} style={styles.cardArt} contentFit="cover" />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {[item.speaker_name || item.channel_name, formatMotivationDuration(item.duration_seconds)]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </TouchableOpacity>
  );
});

export default function MotivationCategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const mountedRef = useMountedRef();
  const requestRef = useRef(0);
  const [items, setItems] = useState<MotivationItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [title, setTitle] = useState("Motivation");

  const loadPage = useCallback(
    async (nextPage: number, mode: "replace" | "append" = "replace") => {
      const cleanSlug = String(slug || "").trim();
      if (!cleanSlug) return;
      const requestId = ++requestRef.current;
      if (mode === "append") setLoadingMore(true);
      else if (nextPage === 1 && !refreshing) setLoading(true);

      try {
        const result = await fetchMotivationCategoryPage(cleanSlug, {
          page: nextPage,
          limit: MOTIVATION_DEFAULT_PAGE_LIMIT,
        });
        if (!mountedRef.current || requestId !== requestRef.current) return;
        setTitle(String(result.pagination?.total ? cleanSlug.replace(/-/g, " ") : title));
        setPage(nextPage);
        setHasMore(Boolean(result.pagination?.hasMore));
        setItems((current) =>
          mode === "append" ? [...current, ...result.items] : result.items
        );
      } finally {
        if (mountedRef.current && requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [mountedRef, refreshing, slug, title]
  );

  useEffect(() => {
    void loadPage(1, "replace");
  }, [loadPage]);

  const openItem = useCallback((itemId: string) => {
    router.push(`/motivation/program/${itemId}` as never);
  }, []);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <FlatList
          data={items}
          numColumns={2}
          key="motivation-category-grid"
          columnWrapperStyle={styles.columnWrap}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadPage(1, "replace");
              }}
              tintColor={COLORS.primary}
            />
          }
          onEndReached={() => {
            if (!loadingMore && hasMore) void loadPage(page + 1, "append");
          }}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <View style={styles.header}>
              <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={22} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>Vertical catalog grid · 40 items per page</Text>
            </View>
          }
          renderItem={({ item }) => (
            <CategoryItemCard item={item} onPress={() => openItem(item.id)} />
          )}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color={COLORS.primary} />
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={COLORS.primary} style={styles.emptyLoader} />
            ) : (
              <Text style={styles.emptyText}>No motivationals in this category yet.</Text>
            )
          }
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 12, paddingBottom: 120 },
  columnWrap: { gap: 12, marginBottom: 12 },
  header: { paddingTop: 56, paddingHorizontal: 4, paddingBottom: 16 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "900", textTransform: "capitalize" },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 8 },
  card: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardArt: { width: "100%", aspectRatio: 1, borderRadius: 14, marginBottom: 10 },
  cardTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  cardMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  footerLoader: { marginVertical: 18 },
  emptyLoader: { marginTop: 40 },
  emptyText: { color: COLORS.textMuted, textAlign: "center", marginTop: 40 },
});
