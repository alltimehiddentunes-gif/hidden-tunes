import { useCallback, useEffect, useMemo, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";

import { PodcastShowCard } from "../../../components/podcast/PodcastDiscoveryCards";
import { COLORS } from "../../../constants/theme";
import { getMatureShowsByCategory } from "../../../services/podcastService";
import type { HiddenTunesPodcastShow } from "../../../services/podcastCatalogApi";
import { isMaturePodcastsEnabled } from "../../../services/maturePodcastPreferences";
import { getMaturePodcastCategory } from "../../../utils/maturePodcastCategories";
import { podcastShowSubtitle } from "../../../utils/openHiddenTunesPodcast";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../../utils/performanceMode";

export default function MaturePodcastCategoryScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const categoryId = String(params.id || "").trim();
  const category = useMemo(
    () => getMaturePodcastCategory(categoryId),
    [categoryId]
  );

  const [matureEnabled, setMatureEnabled] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [shows, setShows] = useState<HiddenTunesPodcastShow[]>([]);

  useEffect(() => {
    void isMaturePodcastsEnabled().then((enabled) => {
      setMatureEnabled(enabled);
      setLoadingPrefs(false);

      if (!enabled) {
        setShows([]);
        return;
      }

      setShows(getMatureShowsByCategory(categoryId, true));
    });
  }, [categoryId]);

  const openShow = useCallback((show: HiddenTunesPodcastShow) => {
    router.push({
      pathname: "/podcasts/show/[showId]",
      params: {
        showId: show.id,
        title: show.title,
        hostName: show.host_name || "",
        artworkUrl: show.artwork_url || "",
        description: show.description || "",
      },
    } as any);
  }, []);

  const renderShowRow = useCallback(
    ({ item }: { item: HiddenTunesPodcastShow }) => (
      <PodcastShowCard
        show={item}
        subtitle={podcastShowSubtitle(item)}
        onPress={() => openShow(item)}
      />
    ),
    [openShow]
  );

  const listPerformance = useMemo(
    () => getListPerformanceSettings(shows.length),
    [shows.length]
  );

  const keyExtractor = useMemo(
    () => createStableKeyExtractor("hidden-tunes-mature-podcast-show"),
    []
  );

  if (!category) {
    return (
      <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>This mature room is not available</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Back to Mature Podcasts</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  if (!loadingPrefs && !matureEnabled) {
    return (
      <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Mature podcasts are hidden</Text>
          <Text style={styles.emptyText}>
            Enable Mature Podcasts 18+ to open this room.
          </Text>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.push("/podcasts/mature" as any)}
          >
            <Text style={styles.backLinkText}>Open Mature Podcasts settings</Text>
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
          <Text style={styles.kicker}>MATURE PODCASTS 18+</Text>
          <Text style={styles.title}>{category.title}</Text>
          <Text style={styles.subtitle}>{category.subtitle}</Text>
        </View>
      </View>

      {loadingPrefs ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={shows}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {shows.length > 0
                ? `${shows.length} mature Hidden Tunes shows`
                : "Mature Hidden Tunes shows"}
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="mic-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No shows in this room yet</Text>
              <Text style={styles.emptyText}>
                This category is hidden until seeded shows are available.
              </Text>
            </View>
          }
          renderItem={renderShowRow}
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
  backLink: {
    marginTop: 16,
  },
  backLinkText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700",
  },
});
