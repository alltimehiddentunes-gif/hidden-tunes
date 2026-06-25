import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import {
  PodcastCategoryCard,
  PodcastShowRailCard,
} from "../../../components/podcast/PodcastDiscoveryCards";
import { RadioCategoryCard, RadioStationRailCard } from "../../../components/radio/RadioBrowserCards";
import MatureContentConsentModal from "../../../components/mature/MatureContentConsentModal";
import { MATURE_PODCAST_HUB_LANE_PAGE_SIZE } from "../../../constants/maturePodcastHubLanes";
import { MATURE_RADIO_HEADLINE_MIN_STATIONS } from "../../../constants/matureDiscoveryFoundation";
import type { PodcastCategory } from "../../../constants/podcastCategories";
import type { RadioCategory } from "../../../constants/radioCategories";
import { COLORS } from "../../../constants/theme";
import { TESTER_COPY } from "../../../constants/testerExperience";
import { useMatureContentGate } from "../../../hooks/useMatureContentGate";
import { useMatureContentSettings } from "../../../hooks/useMatureContentSettings";
import { useMaturePodcastCategoryAvailability } from "../../../hooks/useMaturePodcastCategoryAvailability";
import { useMaturePodcastHubDiscovery } from "../../../hooks/useMaturePodcastHubDiscovery";
import { useMatureRadioCategoryAvailability } from "../../../hooks/useMatureRadioCategoryAvailability";
import { useMatureRadioHubDiscovery } from "../../../hooks/useMatureRadioHubDiscovery";
import { usePlaybackRouter } from "../../../hooks/usePlaybackRouter";
import type { HiddenTunesPodcastShow } from "../../../services/podcastCatalogApi";
import { normalizeRadioStation } from "../../../services/radio/radioNormalizer";
import type { PodcastShowListItem } from "../../../types/podcastDiscovery";
import type { RadioStationListItem } from "../../../types/radio";
import { safeRouterPush } from "../../../utils/safeNavigation";
import { isValidPodcastShowId } from "../../../utils/podcastShowId";
import { getHorizontalListPerformanceSettings } from "../../../utils/performanceMode";

type MatureHubSection =
  | {
      key: string;
      kind: "rail";
      eyebrow: string;
      title: string;
      shows: PodcastShowListItem[];
    }
  | {
      key: string;
      kind: "radio-rail";
      stations: RadioStationListItem[];
    }
  | { key: string; kind: "radio-browse"; categories: RadioCategory[] }
  | { key: string; kind: "browse"; categories: PodcastCategory[] };

type ShowRailSectionProps = {
  title: string;
  eyebrow: string;
  shows: PodcastShowListItem[];
  onPressShow: (item: PodcastShowListItem) => void;
};

function ShowRailSection({ title, eyebrow, shows, onPressShow }: ShowRailSectionProps) {
  if (!shows.length) return null;
  const railPerformance = getHorizontalListPerformanceSettings(shows.length);

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionMeta}>
            {Math.min(shows.length, MATURE_PODCAST_HUB_LANE_PAGE_SIZE)} shows
          </Text>
        </View>
      </View>
      <FlatList
        horizontal
        data={shows}
        keyExtractor={(item) => `${eyebrow}-${item.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
        {...railPerformance}
        renderItem={({ item }) => (
          <PodcastShowRailCard item={item} onPress={() => onPressShow(item)} />
        )}
      />
    </View>
  );
}

function RadioRailSection({
  stations,
  onPressStation,
}: {
  stations: RadioStationListItem[];
  onPressStation: (item: RadioStationListItem) => void;
}) {
  if (!stations.length) return null;
  const railPerformance = getHorizontalListPerformanceSettings(stations.length);

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionEyebrow}>LIVE</Text>
          <Text style={styles.sectionTitle}>Live Mature Talk</Text>
          <Text style={styles.sectionMeta}>{stations.length} stations</Text>
        </View>
      </View>
      <FlatList
        horizontal
        data={stations}
        keyExtractor={(item) => `live-radio-${item.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
        {...railPerformance}
        renderItem={({ item }) => (
          <RadioStationRailCard item={item} onPress={() => onPressStation(item)} />
        )}
      />
    </View>
  );
}

export default function PodcastMatureHubScreen() {
  const { playRadioStation } = usePlaybackRouter();
  const { includeMatureInApi } = useMatureContentSettings();
  const { consentVisible, runWithMatureConsent, cancelConsent, confirmConsent } =
    useMatureContentGate();

  const { laneShows, populatedLanes, loading: loadingLanes, resolveShow, loadMoreRails, hasMoreRails } =
    useMaturePodcastHubDiscovery(includeMatureInApi);
  const { categories: availableCategories } = useMaturePodcastCategoryAvailability(includeMatureInApi);
  const { stations: liveRadioStations, resolveStation } = useMatureRadioHubDiscovery(includeMatureInApi, {
    defer: true,
  });
  const { categories: matureRadioCategories } = useMatureRadioCategoryAvailability(includeMatureInApi);

  const showInitialLoading = includeMatureInApi && loadingLanes && populatedLanes.length === 0;

  const openSubcategory = useCallback((categoryId: string) => {
    safeRouterPush({
      pathname: "/podcasts/[categoryId]",
      params: { categoryId },
    });
  }, []);

  const openShow = useCallback(
    (item: PodcastShowListItem) => {
      if (!isValidPodcastShowId(item.id) || !String(item.title || "").trim()) return;

      const show =
        resolveShow(item.id) ||
        ({
          id: item.id,
          slug: item.id,
          title: item.title,
          artwork_url: item.artworkUrl,
          host_name: item.publisher,
          categories: item.category ? [item.category] : [],
          primary_category: item.category,
          episode_count: item.episodeCount,
          language: item.language,
          is_mature: true,
          content_rating: "adult",
          sourceName: "Hidden Tunes",
        } satisfies HiddenTunesPodcastShow);

      runWithMatureConsent(show, () => {
        safeRouterPush({
          pathname: "/podcasts/show/[showId]",
          params: {
            showId: show.id,
            title: show.title,
            isMature: "1",
          },
        });
      });
    },
    [resolveShow, runWithMatureConsent]
  );

  const playStation = useCallback(
    async (item: RadioStationListItem) => {
      const station = resolveStation(item.id);
      if (!station) {
        Alert.alert("Unavailable", "This station is unavailable right now.");
        return;
      }

      const result = await playRadioStation(normalizeRadioStation(station));
      if (!result.ok) {
        Alert.alert("Unavailable", result.error || "This station is unavailable right now.");
      }
    },
    [playRadioStation, resolveStation]
  );

  const openRadioStation = useCallback(
    (item: RadioStationListItem) => {
      runWithMatureConsent(item, () => {
        void playStation(item);
      });
    },
    [playStation, runWithMatureConsent]
  );

  const openRadioCategory = useCallback((categoryId: string) => {
    safeRouterPush({
      pathname: "/stations/[categoryId]",
      params: { categoryId },
    });
  }, []);

  const showMatureRadioBrowse =
    matureRadioCategories.length > 0 && liveRadioStations.length >= MATURE_RADIO_HEADLINE_MIN_STATIONS;

  const homeSections = useMemo(() => {
    const sections: MatureHubSection[] = [];

    for (const lane of populatedLanes) {
      const shows = laneShows[lane.id] || [];
      if (!shows.length) continue;
      sections.push({
        key: lane.id,
        kind: "rail",
        eyebrow: lane.eyebrow,
        title: lane.title,
        shows,
      });
    }

    if (availableCategories.length) {
      sections.push({
        key: "browse",
        kind: "browse",
        categories: availableCategories,
      });
    }

    if (liveRadioStations.length) {
      sections.push({
        key: "live-radio",
        kind: "radio-rail",
        stations: liveRadioStations,
      });
    }

    if (showMatureRadioBrowse) {
      sections.push({
        key: "radio-browse",
        kind: "radio-browse",
        categories: matureRadioCategories,
      });
    }

    return sections;
  }, [
    availableCategories,
    laneShows,
    liveRadioStations,
    matureRadioCategories,
    populatedLanes,
    showMatureRadioBrowse,
  ]);

  const renderHomeSection = useCallback(
    ({ item }: { item: MatureHubSection }) => {
      if (item.kind === "rail") {
        return (
          <ShowRailSection
            eyebrow={item.eyebrow}
            title={item.title}
            shows={item.shows}
            onPressShow={openShow}
          />
        );
      }

      if (item.kind === "radio-rail") {
        return <RadioRailSection stations={item.stations} onPressStation={openRadioStation} />;
      }

      if (item.kind === "radio-browse") {
        return (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionEyebrow}>LIVE RADIO</Text>
            <Text style={styles.sectionTitle}>Mature talk stations</Text>
            <View style={styles.grid}>
              {item.categories.map((category) => (
                <RadioCategoryCard
                  key={category.id}
                  category={category}
                  onPress={() =>
                    runWithMatureConsent(
                      { is_mature: true, content_rating: "adult" },
                      () => openRadioCategory(category.id)
                    )
                  }
                />
              ))}
            </View>
          </View>
        );
      }

      return (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionEyebrow}>PODCASTS</Text>
          <Text style={styles.sectionTitle}>Mature podcast categories</Text>
          <View style={styles.grid}>
            {item.categories.map((category) => (
              <PodcastCategoryCard
                key={category.id}
                category={category}
                onPress={() =>
                  runWithMatureConsent(
                    { is_mature: true, content_rating: "adult" },
                    () => openSubcategory(category.id)
                  )
                }
              />
            ))}
          </View>
        </View>
      );
    },
    [openRadioCategory, openRadioStation, openShow, openSubcategory, runWithMatureConsent]
  );

  const listPerformance = useMemo(
    () => ({
      initialNumToRender: 2,
      maxToRenderPerBatch: 2,
      windowSize: 3,
      removeClippedSubviews: true,
    }),
    []
  );

  if (!includeMatureInApi) {
    return (
      <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>MATURE 18+</Text>
            <Text style={styles.title}>Adult Podcasts</Text>
          </View>
        </View>
        <View style={styles.center}>
          <Ionicons name="eye-off-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.gateTitle}>Mature podcasts are off</Text>
          <Text style={styles.gateText}>
            Enable mature content in Profile settings to browse adult podcast rooms.
          </Text>
          <TouchableOpacity style={styles.profileLink} onPress={() => router.push("/profile" as any)}>
            <Text style={styles.profileLinkText}>Open Profile settings</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>MATURE 18+</Text>
            <Text style={styles.title}>Mature Audio Discovery</Text>
          <Text style={styles.subtitle}>
            Podcasts first · Live radio when available · Dating · After Dark · More
          </Text>
        </View>
      </View>

      {showInitialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{TESTER_COPY.podcastDiscoveryLoading}</Text>
        </View>
      ) : homeSections.length > 0 || availableCategories.length > 0 ? (
        <FlatList
          data={homeSections}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          renderItem={renderHomeSection}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMoreRails) loadMoreRails();
          }}
          ListHeaderComponent={
            showInitialLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadingText}>{TESTER_COPY.podcastDiscoveryLoading}</Text>
              </View>
            ) : null
          }
          {...listPerformance}
        />
      ) : (
        <View style={styles.center}>
          <Ionicons name="eye-off-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.gateTitle}>Mature audio is unavailable right now</Text>
          <Text style={styles.gateText}>Try again later or browse standard podcast and radio categories.</Text>
        </View>
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
    lineHeight: 18,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  sectionBlock: {
    marginTop: 8,
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionEyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 4,
  },
  sectionMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingTop: 18,
  },
  seeAllText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  railContent: {
    paddingRight: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 8,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  inlineLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  gateTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
    textAlign: "center",
  },
  gateText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  profileLink: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  profileLinkText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
});
