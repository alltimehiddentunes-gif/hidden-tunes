import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
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
import MatureContentConsentModal from "../../../components/mature/MatureContentConsentModal";
import { MATURE_PODCAST_HUB_LANE_PAGE_SIZE } from "../../../constants/maturePodcastHubLanes";
import type { PodcastCategory } from "../../../constants/podcastCategories";
import { COLORS } from "../../../constants/theme";
import { TESTER_COPY } from "../../../constants/testerExperience";
import { useMatureContentGate } from "../../../hooks/useMatureContentGate";
import { useMatureContentSettings } from "../../../hooks/useMatureContentSettings";
import { useMaturePodcastCategoryAvailability } from "../../../hooks/useMaturePodcastCategoryAvailability";
import { useMaturePodcastHubDiscovery } from "../../../hooks/useMaturePodcastHubDiscovery";
import type { HiddenTunesPodcastShow } from "../../../services/podcastCatalogApi";
import type { PodcastShowListItem } from "../../../types/podcastDiscovery";
import { safeRouterPush } from "../../../utils/safeNavigation";
import {
  getHorizontalListPerformanceSettings,
} from "../../../utils/performanceMode";

type MatureHubSection =
  | {
      key: string;
      kind: "rail";
      eyebrow: string;
      title: string;
      shows: PodcastShowListItem[];
      seeAllCategoryId?: string;
    }
  | { key: string; kind: "browse"; categories: PodcastCategory[] };

type ShowRailSectionProps = {
  title: string;
  eyebrow: string;
  shows: PodcastShowListItem[];
  onPressShow: (item: PodcastShowListItem) => void;
  seeAllCategoryId?: string;
};

function ShowRailSection({
  title,
  eyebrow,
  shows,
  onPressShow,
  seeAllCategoryId,
}: ShowRailSectionProps) {
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
        {seeAllCategoryId ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.seeAllButton}
            onPress={() => {
              safeRouterPush({
                pathname: "/podcasts/[categoryId]",
                params: { categoryId: seeAllCategoryId },
              });
            }}
          >
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        ) : null}
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

export default function PodcastMatureHubScreen() {
  const { includeMatureInApi } = useMatureContentSettings();
  const { consentVisible, runWithMatureConsent, cancelConsent, confirmConsent } =
    useMatureContentGate();

  const { laneShows, populatedLanes, loading: loadingLanes, resolveShow } =
    useMaturePodcastHubDiscovery(includeMatureInApi);
  const { categories: availableCategories, loadingCategories } =
    useMaturePodcastCategoryAvailability(includeMatureInApi);

  const loading = includeMatureInApi && (loadingLanes || loadingCategories);

  const openSubcategory = useCallback((categoryId: string) => {
    safeRouterPush({
      pathname: "/podcasts/[categoryId]",
      params: { categoryId },
    });
  }, []);

  const openShow = useCallback(
    (item: PodcastShowListItem) => {
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
        seeAllCategoryId: lane.categoryLinkId,
      });
    }

    if (availableCategories.length) {
      sections.push({
        key: "browse",
        kind: "browse",
        categories: availableCategories,
      });
    }

    return sections;
  }, [availableCategories, laneShows, populatedLanes]);

  const renderHomeSection = useCallback(
    ({ item }: { item: MatureHubSection }) => {
      if (item.kind === "rail") {
        return (
          <ShowRailSection
            eyebrow={item.eyebrow}
            title={item.title}
            shows={item.shows}
            onPressShow={openShow}
            seeAllCategoryId={item.seeAllCategoryId}
          />
        );
      }

      return (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionEyebrow}>BROWSE ROOMS</Text>
          <Text style={styles.sectionTitle}>All mature podcast categories</Text>
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
    [openShow, openSubcategory, runWithMatureConsent]
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
          <Text style={styles.title}>Adult Podcast Discovery</Text>
          <Text style={styles.subtitle}>
            Featured · Trending · Dating · Psychology · After Dark · More
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{TESTER_COPY.podcastDiscoveryLoading}</Text>
        </View>
      ) : homeSections.length > 0 ? (
        <FlatList
          data={homeSections}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          renderItem={renderHomeSection}
          {...listPerformance}
        />
      ) : (
        <View style={styles.center}>
          <Ionicons name="eye-off-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.gateTitle}>Adult podcast rooms are unavailable right now</Text>
          <Text style={styles.gateText}>Try again later or browse standard podcast categories.</Text>
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
