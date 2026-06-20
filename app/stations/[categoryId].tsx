import { useCallback, useEffect, useMemo, useState } from "react";
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
import { getRadioCategory } from "../../constants/radioCategories";
import { COLORS } from "../../constants/theme";
import { usePlayerActions } from "../../context/PlayerContext";
import {
  fetchRadioStationsPage,
  RADIO_STATION_PAGE_SIZE,
} from "../../services/radio/radioBrowserApi";
import {
  hydrateCachedRadioStations,
  readCachedRadioStations,
  writeCachedRadioStations,
} from "../../services/radio/radioCache";
import {
  normalizeRadioStation,
  radioStationToAppSong,
  stationRowSubtitle,
} from "../../services/radio/radioNormalizer";
import { getFriendlyPlaybackError } from "../../services/ui/displayMetadata";
import type { HiddenTunesStation } from "../../types/radio";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../utils/performanceMode";

export default function RadioCategoryScreen() {
  const { playSong } = usePlayerActions();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = String(params.categoryId || "").trim();
  const category = useMemo(() => getRadioCategory(categoryId), [categoryId]);

  const [stations, setStations] = useState<HiddenTunesStation[]>(() =>
    readCachedRadioStations(categoryId) || []
  );
  const [loading, setLoading] = useState(() => stations.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasCheckedNetwork, setHasCheckedNetwork] = useState(false);

  const loadInitial = useCallback(
    async (forceRefresh = false) => {
      if (!categoryId) return;

      try {
        if (!forceRefresh) {
          const cached = readCachedRadioStations(categoryId) || (await hydrateCachedRadioStations(categoryId));
          if (cached?.length) {
            setStations(cached);
            setHasMore(cached.length >= RADIO_STATION_PAGE_SIZE);
            return;
          }
        }

        const page = await fetchRadioStationsPage(categoryId, 0, RADIO_STATION_PAGE_SIZE);
        const merged = writeCachedRadioStations(categoryId, page, { append: false });
        setStations(merged);
        setHasMore(page.length >= RADIO_STATION_PAGE_SIZE);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setHasCheckedNetwork(true);
      }
    },
    [categoryId]
  );

  useEffect(() => {
    if (!categoryId) return;
    void loadInitial(false);
  }, [categoryId, loadInitial]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadInitial(true);
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!categoryId || loadingMore || !hasMore || loading) return;

    setLoadingMore(true);
    try {
      const page = await fetchRadioStationsPage(
        categoryId,
        stations.length,
        RADIO_STATION_PAGE_SIZE
      );

      if (!page.length) {
        setHasMore(false);
        return;
      }

      const merged = writeCachedRadioStations(categoryId, page, { append: true });
      setStations(merged);
      setHasMore(page.length >= RADIO_STATION_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [categoryId, hasMore, loading, loadingMore, stations.length]);

  const playStation = useCallback(
    async (station: HiddenTunesStation) => {
      try {
        const appSong = radioStationToAppSong(normalizeRadioStation(station));
        await playSong(appSong, [appSong], 0, {
          source: "radio",
          label: station.name,
        });
      } catch (error) {
        Alert.alert("Unavailable", getFriendlyPlaybackError(error));
      }
    },
    [playSong]
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
    hasCheckedNetwork && !loading && !refreshing && stations.length === 0;

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

      {loading && stations.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Finding stations...</Text>
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
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            void loadMore();
          }}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {stations.length > 0
                ? `${stations.length} live stations`
                : "Live stations"}
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
          ListEmptyComponent={
            showEmpty ? (
              <View style={styles.emptyBox}>
                <Ionicons name="radio-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>{category.emptyTitle}</Text>
                <Text style={styles.emptyText}>{category.emptyMessage}</Text>
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.fallbackButton}
                  onPress={openListeningRoom}
                >
                  <Text style={styles.fallbackButtonText}>
                    Open listening room
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <RadioStationCard
              name={item.name}
              subtitle={stationRowSubtitle(item)}
              favicon={item.favicon}
              onPress={() => playStation(item)}
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
