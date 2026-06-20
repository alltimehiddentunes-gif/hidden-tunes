import { useCallback, useEffect, useMemo, useState } from "react";
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

import { RadioStationCard } from "../../components/radio/RadioBrowserCards";
import { COLORS } from "../../constants/theme";
import { TESTER_COPY } from "../../constants/testerExperience";
import {
  getRadioStationsForCategory,
  type HiddenTunesStation,
} from "../../services/radioStationApi";
import { readCachedRadioStations } from "../../utils/radioStationCache";
import {
  getLaunchRadioCategory,
} from "../../utils/launchRadioCategories";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";

function stationSubtitle(station: HiddenTunesStation) {
  const parts = [
    station.country,
    station.language,
    station.tags.slice(0, 2).join(" · "),
  ].filter(Boolean);

  return parts.join(" · ") || "Hidden Tunes station";
}

export default function RadioCategoryScreen() {
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = String(params.categoryId || "").trim();
  const category = useMemo(
    () => getLaunchRadioCategory(categoryId),
    [categoryId]
  );

  const [stations, setStations] = useState<HiddenTunesStation[]>(() =>
    readCachedRadioStations(categoryId) || []
  );
  const [loading, setLoading] = useState(() => stations.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedFallbacks, setHasCheckedFallbacks] = useState(false);

  const loadStations = useCallback(
    async (forceRefresh = false) => {
      if (!categoryId) return;

      try {
        const next = await getRadioStationsForCategory(categoryId, {
          forceRefresh,
        });
        setStations(next);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setHasCheckedFallbacks(true);
      }
    },
    [categoryId]
  );

  useEffect(() => {
    if (!categoryId) return;
    void loadStations(false);
  }, [categoryId, loadStations]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadStations(true);
  }, [loadStations]);

  const openStation = useCallback(
    (station: HiddenTunesStation) => {
      router.push({
        pathname: "/stations/detail",
        params: {
          categoryId,
          stationId: station.id,
          name: station.name,
        },
      } as any);
    },
    [categoryId]
  );

  const openListeningRoom = useCallback(() => {
    if (!category) return;

    router.push({
      pathname: "/radio",
      params: {
        title: category.title,
        query: category.listeningRoomQuery,
        genre: category.tag || "",
      },
    } as any);
  }, [category]);

  const listPerformance = useMemo(
    () => getListPerformanceSettings(stations.length),
    [stations.length]
  );

  const keyExtractor = useMemo(
    () => createStableKeyExtractor("radio-station"),
    []
  );

  const showEmpty =
    hasCheckedFallbacks && !loading && !refreshing && stations.length === 0;

  if (!category) {
    return (
      <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Category not found</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Back to Radio Browser</Text>
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

      {loading && stations.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{TESTER_COPY.radioStationsLoading}</Text>
        </View>
      ) : (
        <FlatList
          data={stations}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {stations.length > 0
                ? `${stations.length} stations in this room`
                : "Stations in this room"}
            </Text>
          }
          ListEmptyComponent={
            showEmpty ? (
              <View style={styles.emptyBox}>
                <Ionicons
                  name="radio-outline"
                  size={48}
                  color={COLORS.textMuted}
                />
                <Text style={styles.emptyTitle}>{category.emptyTitle}</Text>
                <Text style={styles.emptyText}>{category.emptyMessage}</Text>
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.fallbackButton}
                  onPress={openListeningRoom}
                >
                  <Text style={styles.fallbackButtonText}>
                    Open Hidden Tunes listening room
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <RadioStationCard
              name={item.name}
              subtitle={stationSubtitle(item)}
              favicon={item.favicon}
              onPress={() => openStation(item)}
            />
          )}
          {...listPerformance}
          removeClippedSubviews
        />
      )}
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
