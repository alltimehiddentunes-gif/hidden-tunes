import { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { RadioStationCard } from "../../components/radio/RadioBrowserCards";
import MatureContentConsentModal from "../../components/mature/MatureContentConsentModal";
import { getRadioCategory, resolveRadioCategoryId } from "../../constants/radioCategories";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import { useLazyRadioStationList } from "../../hooks/useLazyRadioStationList";
import { useMatureContentGate } from "../../hooks/useMatureContentGate";
import { usePlaybackRouter } from "../../hooks/usePlaybackRouter";
import { loadRadioCategoryPage } from "../../services/radio/radioBrowserApi";
import { normalizeRadioStation } from "../../services/radio/radioNormalizer";
import type { RadioStationListItem } from "../../types/radio";
import { logRadioDiscoveryRender } from "../../utils/radioDiscoveryDiagnostics";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";

export default function RadioCategoryScreen() {
  const { playRadioStation } = usePlaybackRouter();
  const { consentVisible, runWithMatureConsent, cancelConsent, confirmConsent } =
    useMatureContentGate();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = resolveRadioCategoryId(String(params.categoryId || "").trim());
  const category = useMemo(() => getRadioCategory(categoryId), [categoryId]);

  const loadPage = useCallback(
    (offset: number, options: { append: boolean; forceRefresh: boolean }) =>
      loadRadioCategoryPage(categoryId, {
        offset,
        append: options.append,
        forceRefresh: options.forceRefresh,
      }),
    [categoryId]
  );

  const {
    listItems,
    loading,
    refreshing,
    loadingMore,
    hasLoadedOnce,
    onRefresh,
    loadMore,
    resolveStation,
    listCountLabel,
  } = useLazyRadioStationList({
    cacheKey: categoryId,
    requestKey: `category:${categoryId}`,
    enabled: Boolean(categoryId),
    loadPage,
  });

  const playStation = useCallback(
    async (item: RadioStationListItem) => {
      const station = resolveStation(item.id);
      if (!station) {
        Alert.alert("Unavailable", "This station is unavailable right now.");
        return;
      }

      const result = await playRadioStation(normalizeRadioStation(station));

      if (!result.ok) {
        Alert.alert(
          "Unavailable",
          result.error || "This station is unavailable right now."
        );
      }
    },
    [playRadioStation, resolveStation]
  );

  const handleStationPress = useCallback(
    (item: RadioStationListItem) => {
      runWithMatureConsent(item, () => {
        void playStation(item);
      });
    },
    [playStation, runWithMatureConsent]
  );

  const listPerformance = useMemo(
    () => getListPerformanceSettings(listItems.length),
    [listItems.length]
  );

  const keyExtractor = useMemo(
    () => createStableKeyExtractor("radio-station"),
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: RadioStationListItem }) => (
      <RadioStationCard
        item={item}
        variant="premium"
        onPress={() => handleStationPress(item)}
      />
    ),
    [handleStationPress]
  );

  useEffect(() => {
    logRadioDiscoveryRender(`radio-category:${categoryId}`);
  }, [categoryId]);

  useEffect(() => {
    if (!hasLoadedOnce || loading || refreshing || listItems.length > 0) return;
    router.replace("/stations" as any);
  }, [hasLoadedOnce, listItems.length, loading, refreshing]);

  if (!category) {
    return (
      <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>This room is not available</Text>
          <Text style={styles.emptyText}>Try another search.</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Back to Live Stations</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>HIDDEN TUNES RADIO</Text>
          <Text style={styles.title}>{category.title}</Text>
          <Text style={styles.subtitle}>{category.subtitle}</Text>
        </View>
      </View>

      {loading && listItems.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{TESTER_COPY.radioStationsLoading}</Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          onEndReachedThreshold={0.35}
          onEndReached={loadMore}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {listCountLabel || "Live stations"}
            </Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={styles.footerSpinner}
                color={COLORS.primary}
              />
            ) : null
          }
          renderItem={renderItem}
          {...listPerformance}
          removeClippedSubviews
        />
      )}

      <MatureContentConsentModal
        visible={consentVisible}
        onCancel={cancelConsent}
        onConfirm={confirmConsent}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 4,
  },
  headerText: { flex: 1 },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 12,
    marginTop: 8,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  footerSpinner: {
    marginVertical: 16,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
  },
  fallbackButton: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  fallbackButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  backLink: {
    marginTop: 16,
  },
  backLinkText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700",
  },
});
