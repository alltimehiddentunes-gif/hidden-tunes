import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { PodcastCategoryCard, PodcastShowCard } from "../../components/podcast/PodcastCards";
import MaturePodcastConsentModal from "../../components/podcast/MaturePodcastConsentModal";
import PodcastScreenHeader from "../../components/podcast/PodcastScreenHeader";
import PodcastSearchBar from "../../components/podcast/PodcastSearchBar";
import { COLORS } from "../../constants/theme";
import { useMaturePodcastCatalog } from "../../hooks/useMaturePodcastCatalog";
import { getMaturePodcastPageSections } from "../../services/podcastService";
import {
  disableMaturePodcasts,
  enableMaturePodcastsWithConsent,
  shouldIncludeMaturePodcasts,
  subscribeMaturePodcastSettings,
} from "../../utils/maturePodcastSettings";
import { getListPerformanceSettings } from "../../utils/performanceMode";
import { safeRouterPush } from "../../utils/safeNavigation";
import type { PodcastShow } from "../../types/podcast";

export default function MaturePodcastsScreen() {
  const [enabled, setEnabled] = useState(shouldIncludeMaturePodcasts());
  const [consentVisible, setConsentVisible] = useState(false);
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

  const handleToggle = (value: boolean) => {
    if (value) {
      setConsentVisible(true);
    } else {
      void disableMaturePodcasts();
    }
  };

  const handleConfirm = () => {
    void enableMaturePodcastsWithConsent().then(() => {
      setEnabled(true);
      setConsentVisible(false);
    });
  };

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
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>Enable Mature Podcasts 18+</Text>
            <Text style={styles.settingSubtitle}>
              I am 18 or older and understand this may contain explicit/adult content.
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            trackColor={{ false: "rgba(255,255,255,0.12)", true: "rgba(239,68,68,0.45)" }}
            thumbColor={enabled ? COLORS.danger : "#f4f3f4"}
          />
        </View>

        {!enabled ? (
          <View style={styles.lockedPanel}>
            <Ionicons name="lock-closed-outline" size={28} color={COLORS.danger} />
            <Text style={styles.lockedTitle}>Mature podcasts are locked</Text>
            <Text style={styles.lockedText}>
              Turn on the setting above and confirm you are 18+ to browse mature podcast categories.
            </Text>
          </View>
        ) : null}

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

      <MaturePodcastConsentModal
        visible={consentVisible}
        onCancel={() => setConsentVisible(false)}
        onConfirm={handleConfirm}
      />
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
});
