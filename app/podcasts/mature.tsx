import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { PodcastCategoryCard, PodcastShowCard } from "../../components/podcast/PodcastCards";
import PodcastScreenHeader from "../../components/podcast/PodcastScreenHeader";
import PodcastSearchBar from "../../components/podcast/PodcastSearchBar";
import { COLORS } from "../../constants/theme";
import { useMaturePodcastCatalog } from "../../hooks/useMaturePodcastCatalog";
import { getMaturePodcastPageSections } from "../../services/podcastService";
import {
  disableMaturePodcasts,
  lockMaturePodcastSession,
  shouldIncludeMaturePodcasts,
  subscribeMaturePodcastSettings,
} from "../../utils/maturePodcastSettings";
import { authenticateForMaturePodcasts } from "../../utils/maturePodcastAuthentication";
import { getListPerformanceSettings } from "../../utils/performanceMode";
import { safeRouterPush } from "../../utils/safeNavigation";
import type { PodcastShow } from "../../types/podcast";

export default function MaturePodcastsScreen() {
  const [enabled, setEnabled] = useState(shouldIncludeMaturePodcasts());
  const [privacyCovered, setPrivacyCovered] = useState(false);
  const [query, setQuery] = useState("");
  const [deferredQuery, setDeferredQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDeferredQuery(query), 220);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const unsubscribe = subscribeMaturePodcastSettings(() => {
      setEnabled(shouldIncludeMaturePodcasts());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!shouldIncludeMaturePodcasts()) router.replace("/podcasts" as any);
    return () => lockMaturePodcastSession();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        setPrivacyCovered(true);
        lockMaturePodcastSession();
        setEnabled(false);
      } else if (!shouldIncludeMaturePodcasts()) {
        router.replace("/podcasts" as any);
      }
    });
    return () => subscription.remove();
  }, []);

  const catalog = useMaturePodcastCatalog({
    enabled,
    query: deferredQuery,
  });

  const pageData = useMemo(
    () => getMaturePodcastPageSections(enabled),
    [enabled]
  );

  const listPerf = useMemo(
    () => getListPerformanceSettings(Math.max(catalog.shows.length, 24)),
    [catalog.shows.length]
  );

  const handleDisable = useCallback(async () => {
    const result = await authenticateForMaturePodcasts();
    if (!result.success) {
      if (result.reason === "native_module_missing") {
        Alert.alert("App Update Required", "Install the latest Hidden Tunes development build to change Mature Podcasts access.");
      } else if (result.reason === "device_security_missing") {
        Alert.alert("Device Security Required", "Set up device security before changing Mature Podcasts access.");
      }
      return;
    }
    await disableMaturePodcasts();
    setQuery("");
    setDeferredQuery("");
    router.replace("/podcasts" as any);
  }, []);

  const openShow = useCallback((showId: string) => {
    safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: showId } });
  }, []);

  const hasQuery = query.trim().length >= 2;

  const renderShow = useCallback(
    ({ item }: { item: PodcastShow }) => (
      <PodcastShowCard show={item} onPress={() => openShow(item.id)} />
    ),
    [openShow]
  );

  const keyExtractor = useCallback((item: PodcastShow) => item.id, []);

  const loadMore = catalog.loadMore;
  const onEndReached = useCallback(() => {
    loadMore();
  }, [loadMore]);

  const renderHeader = useCallback(
    () => (
      <>
        {enabled ? (
          <>
            {!hasQuery && pageData.categories.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Mature Categories</Text>
                <View style={styles.chipWrap}>
                  {pageData.categories.map((child) => (
                    <PodcastCategoryCard
                      key={child.id}
                      category={child}
                      onPress={() =>
                        safeRouterPush({
                          pathname: "/podcasts/category/[id]",
                          params: { id: child.id },
                        })
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.sectionTitleWrap}>
              <Text style={styles.sectionTitle}>
                {hasQuery ? "Search Results" : "Mature Catalog"}
              </Text>
              {catalog.total > 0 ? (
                <Text style={styles.countText}>
                  {catalog.shows.length}
                  {catalog.hasMore ? "+" : ""} of {catalog.total}
                </Text>
              ) : null}
            </View>

            {catalog.loading && catalog.shows.length === 0 ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={COLORS.primary} size="large" />
                <Text style={styles.stateText}>Loading mature podcasts...</Text>
              </View>
            ) : null}

            {catalog.error && catalog.shows.length === 0 ? (
              <View style={styles.centerState}>
                <Text style={styles.stateTitle}>{catalog.error}</Text>
                <Text style={styles.retryHint} onPress={catalog.refresh}>
                  Tap to retry
                </Text>
              </View>
            ) : null}

            {!catalog.loading && !catalog.error && catalog.shows.length === 0 ? (
              <View style={styles.centerState}>
                <Text style={styles.stateText}>
                  {hasQuery
                    ? "No mature podcasts matched that search."
                    : "No mature podcasts available right now."}
                </Text>
              </View>
            ) : null}
            <Pressable style={styles.disableButton} onPress={() => void handleDisable()}>
              <Ionicons name="lock-closed-outline" size={16} color={COLORS.danger} />
              <Text style={styles.disableText}>Disable Mature Podcasts</Text>
            </Pressable>
          </>
        ) : null}
      </>
    ),
    [
      catalog.error,
      catalog.hasMore,
      catalog.loading,
      catalog.refresh,
      catalog.shows.length,
      catalog.total,
      enabled,
      handleDisable,
      hasQuery,
      pageData.categories,
    ]
  );

  const renderFooter = useCallback(() => {
    if (!enabled || !catalog.loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={COLORS.primary} size="small" />
      </View>
    );
  }, [catalog.loadingMore, enabled]);

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <PodcastScreenHeader
        kicker="18+"
        title="Mature Podcasts"
        subtitle="Explicit and adult podcast content stays locked until you confirm your age."
      >
        {enabled ? <PodcastSearchBar value={query} onChangeText={setQuery} /> : null}
      </PodcastScreenHeader>

      <FlatList
        data={enabled ? catalog.shows : []}
        renderItem={renderShow}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onEndReached={enabled ? onEndReached : undefined}
        onEndReachedThreshold={0.4}
        initialNumToRender={listPerf.initialNumToRender}
        maxToRenderPerBatch={listPerf.maxToRenderPerBatch}
        windowSize={listPerf.windowSize}
        updateCellsBatchingPeriod={listPerf.updateCellsBatchingPeriod}
        removeClippedSubviews={Platform.OS === "android"}
      />
      {privacyCovered ? (
        <View style={styles.privacyCover}>
          <Ionicons name="musical-notes" size={28} color={COLORS.primary} />
          <Text style={styles.privacyTitle}>Hidden Tunes</Text>
          <Text style={styles.privacyText}>Private content locked</Text>
        </View>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 120, gap: 12 },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  settingCopy: { flex: 1 },
  settingTitle: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  settingSubtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  lockedPanel: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 36,
    paddingHorizontal: 18,
  },
  lockedTitle: { color: COLORS.text, fontWeight: "800", fontSize: 16 },
  lockedText: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
  section: { marginBottom: 8 },
  sectionTitleWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 4,
  },
  sectionTitle: { color: COLORS.text, fontWeight: "800", fontSize: 16 },
  countText: { color: COLORS.textMuted, fontSize: 12 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    gap: 10,
  },
  stateText: { color: COLORS.textMuted, fontSize: 13 },
  stateTitle: { color: COLORS.text, fontWeight: "700", textAlign: "center" },
  retryHint: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  footer: { paddingVertical: 16, alignItems: "center" },
  disableButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 20, paddingVertical: 14, borderRadius: 16,
    backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
  },
  disableText: { color: COLORS.danger, fontWeight: "800", fontSize: 13 },
  privacyCover: {
    ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center",
    backgroundColor: "#030008", zIndex: 100,
  },
  privacyTitle: { color: COLORS.text, fontSize: 20, fontWeight: "900", marginTop: 10 },
  privacyText: { color: COLORS.textMuted, fontSize: 13, marginTop: 6 },
});
