import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  MOTIVATION_DEFAULT_PAGE_LIMIT,
} from "@/services/motivationCatalogApi";
import {
  groupMotivationItemsIntoPrograms,
  stashMotivationGroupedProgram,
  type MotivationGroupedProgram,
} from "@/utils/motivationGrouping";

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function goBackWithinMotivation() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/motivation" as never);
}

const ProgramCard = memo(function ProgramCard({
  group,
  onPress,
}: {
  group: MotivationGroupedProgram;
  onPress: () => void;
}) {
  const meta = [
    group.speakerName,
    group.episodeCount > 1 ? `${group.episodeCount} episodes` : "1 episode",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={onPress}>
      <HTImage
        uri={group.program.artwork_url || undefined}
        style={styles.cardArt}
        contentFit="cover"
      />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {group.program.title}
      </Text>
      {meta ? (
        <Text style={styles.cardMeta} numberOfLines={2}>
          {meta}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

export default function MotivationCategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const mountedRef = useMountedRef();
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [groups, setGroups] = useState<MotivationGroupedProgram[]>([]);
  const [rawItems, setRawItems] = useState<
    Awaited<ReturnType<typeof fetchMotivationCategoryPage>>["items"]
  >([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Motivation");

  const rebuildGroups = useCallback((items: typeof rawItems) => {
    setGroups(groupMotivationItemsIntoPrograms(items));
  }, []);

  const loadPage = useCallback(
    async (nextPage: number, mode: "replace" | "append" = "replace") => {
      const cleanSlug = String(slug || "").trim();
      if (!cleanSlug) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestRef.current;

      if (mode === "append") setLoadingMore(true);
      else if (nextPage === 1 && !refreshing) setLoading(true);
      if (mode === "replace") setError(null);

      try {
        const result = await fetchMotivationCategoryPage(cleanSlug, {
          page: nextPage,
          limit: MOTIVATION_DEFAULT_PAGE_LIMIT,
          signal: controller.signal,
        });
        if (!mountedRef.current || requestId !== requestRef.current || controller.signal.aborted) {
          return;
        }
        setTitle(cleanSlug.replace(/-/g, " "));
        setPage(nextPage);
        setHasMore(Boolean(result.pagination?.hasMore));
        setRawItems((current) => {
          const next = mode === "append" ? [...current, ...result.items] : result.items;
          rebuildGroups(next);
          return next;
        });
      } catch (err) {
        if (!mountedRef.current || requestId !== requestRef.current || isAbortError(err)) return;
        if (mode === "replace") {
          setError("Couldn't load this category. Pull to retry.");
          setRawItems([]);
          setGroups([]);
        }
      } finally {
        if (mountedRef.current && requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [mountedRef, rebuildGroups, refreshing, slug]
  );

  useEffect(() => {
    void loadPage(1, "replace");
    return () => abortRef.current?.abort();
  }, [loadPage]);

  const openProgram = useCallback((group: MotivationGroupedProgram) => {
    stashMotivationGroupedProgram(group);
    router.push(`/motivation/program/${encodeURIComponent(group.id)}` as never);
  }, []);

  const listData = useMemo(() => groups, [groups]);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <FlatList
          data={listData}
          numColumns={2}
          key="motivation-category-programs"
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
              <TouchableOpacity
                style={styles.backButton}
                onPress={goBackWithinMotivation}
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-back" size={24} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>Programs and series in this category</Text>
              {error ? (
                <TouchableOpacity
                  style={styles.errorBanner}
                  onPress={() => {
                    setRefreshing(true);
                    void loadPage(1, "replace");
                  }}
                >
                  <Text style={styles.errorText}>{error}</Text>
                  <Text style={styles.retryText}>Tap to retry</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <ProgramCard group={item} onPress={() => openProgram(item)} />
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
              <Text style={styles.emptyText}>
                {error ? "Pull to retry." : "No programs in this category yet."}
              </Text>
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "900", textTransform: "capitalize" },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 8 },
  errorBanner: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(251,146,60,0.12)",
    borderWidth: 1,
    borderColor: "rgba(251,146,60,0.35)",
  },
  errorText: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  retryText: { color: COLORS.primary, fontSize: 13, fontWeight: "800", marginTop: 6 },
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
