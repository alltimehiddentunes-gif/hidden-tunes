import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import {
  PodcastCategoryCard,
  PodcastEpisodeCard,
  PodcastShowCard,
} from "../../../components/podcast/PodcastCards";
import MaturePodcastConsentModal from "../../../components/podcast/MaturePodcastConsentModal";
import {
  getPodcastCategory,
  PODCAST_ROOT_SECTIONS,
  resolvePodcastCategoryId,
  type PodcastCategoryDef,
} from "../../../constants/podcastCategories";
import { COLORS } from "../../../constants/theme";
import { useMaturePodcastGate } from "../../../hooks/useMaturePodcastGate";
import { usePlaybackRouter } from "../../../hooks/usePlaybackRouter";
import { getPodcastEpisodes, getPodcastShowsByCategory } from "../../../services/podcastService";
import type { PodcastEpisode, PodcastShow } from "../../../types/podcast";
import { shouldIncludeMaturePodcasts } from "../../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../../utils/safeNavigation";

export default function PodcastCategoryScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const categoryId = resolvePodcastCategoryId(String(params.id || ""));
  const category = useMemo(() => getPodcastCategory(categoryId), [categoryId]);
  const parentSection = useMemo(
    () => PODCAST_ROOT_SECTIONS.find((section) => section.id === categoryId),
    [categoryId]
  );

  const { playPodcastEpisode } = usePlaybackRouter();
  const { consentVisible, runWithMaturePodcastConsent, cancelConsent, confirmConsent } =
    useMaturePodcastGate();

  const [shows, setShows] = useState<PodcastShow[]>([]);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const includeMature = shouldIncludeMaturePodcasts();
    const childIds =
      parentSection?.children?.map((child) => child.id) ||
      (category && !parentSection ? [category.id] : []);

    const ids = childIds.length ? childIds : [categoryId];
    const showLists = await Promise.all(
      ids.map((id) => getPodcastShowsByCategory(id, includeMature))
    );
    const mergedShows = showLists.flat();

    const latestEpisodes: PodcastEpisode[] = [];
    for (const show of mergedShows.slice(0, 6)) {
      const result = await getPodcastEpisodes(show.id, {
        offset: 0,
        limit: 2,
        includeMature,
      });
      latestEpisodes.push(...result.episodes);
    }

    setShows(mergedShows);
    setEpisodes(latestEpisodes);
    setLoading(false);
  }, [category, categoryId, parentSection]);

  useEffect(() => {
    if (category?.matureOnly && !shouldIncludeMaturePodcasts()) {
      router.replace("/podcasts/mature" as any);
      return;
    }
    void load();
  }, [category, load]);

  const playEpisode = useCallback(
    (episode: PodcastEpisode) => {
      runWithMaturePodcastConsent(episode, () => {
        void playPodcastEpisode(episode).then((result) => {
          if (!result.ok) Alert.alert("Unavailable", result.error);
        });
      });
    },
    [playPodcastEpisode, runWithMaturePodcastConsent]
  );

  if (!category && !parentSection) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Category not found</Text>
      </View>
    );
  }

  const title = parentSection?.title || category?.title || "Podcasts";
  const description = parentSection?.description || category?.description || "";

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>PODCASTS</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{description}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
      >
        {loading ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : null}

        {parentSection?.children?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Browse</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {parentSection.children.map((child: PodcastCategoryDef) => (
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
            </ScrollView>
          </View>
        ) : null}

        {shows.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Shows</Text>
            {shows.map((show) => (
              <PodcastShowCard
                key={show.id}
                show={show}
                onPress={() =>
                  safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: show.id } })
                }
              />
            ))}
          </View>
        ) : !loading ? (
          <Text style={styles.emptyText}>No shows in this room yet.</Text>
        ) : null}

        {episodes.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Latest Episodes</Text>
            {episodes.map((episode) => (
              <PodcastEpisodeCard
                key={episode.id}
                episode={episode}
                onPress={() => playEpisode(episode)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <MaturePodcastConsentModal
        visible={consentVisible}
        onCancel={cancelConsent}
        onConfirm={confirmConsent}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", padding: 18, gap: 8 },
  backButton: { padding: 4 },
  headerText: { flex: 1 },
  kicker: { color: COLORS.primaryGlow, fontSize: 10, fontWeight: "800" },
  title: { color: COLORS.text, fontSize: 24, fontWeight: "900" },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  content: { paddingHorizontal: 18, paddingBottom: 120, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  loadingPanel: { paddingVertical: 30, alignItems: "center" },
  emptyText: { color: COLORS.textMuted, textAlign: "center", paddingVertical: 24 },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  fallbackText: { color: COLORS.textMuted },
});
