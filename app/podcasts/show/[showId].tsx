import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { PodcastEpisodeRow } from "../../../components/podcast/PodcastDiscoveryCards";
import MatureContentConsentModal from "../../../components/mature/MatureContentConsentModal";
import { COLORS } from "../../../constants/theme";
import { TESTER_COPY } from "../../../constants/testerExperience";
import { useMatureContentGate } from "../../../hooks/useMatureContentGate";
import { useMatureContentSettings } from "../../../hooks/useMatureContentSettings";
import { usePlaybackRouter } from "../../../hooks/usePlaybackRouter";
import {
  getPodcastEpisodesForShow,
} from "../../../services/podcastDiscoveryApi";
import type { HiddenTunesPodcastEpisode } from "../../../services/podcastCatalogApi";
import { normalizePodcastEpisode } from "../../../services/podcasts/podcastNormalizer";
import {
  podcastDiscoveryDisplayName,
  podcastEpisodeSubtitle,
} from "../../../utils/openHiddenTunesPodcast";
import {
  readCachedPodcastEpisodes,
  hydrateCachedPodcastEpisodes,
} from "../../../utils/podcastDiscoveryCache";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../../utils/performanceMode";
import {
  enrichEpisodesWithShowMaturity,
  filterVisiblePodcastEpisodes,
  isMaturePodcastEpisode,
} from "../../../utils/maturePodcastVisibility";

export default function PodcastShowScreen() {
  const { playPodcastEpisode } = usePlaybackRouter();
  const { hasConsent, includeMatureInApi } = useMatureContentSettings();
  const { consentVisible, runWithMatureConsent, cancelConsent, confirmConsent } =
    useMatureContentGate();
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const params = useLocalSearchParams<{ showId?: string; title?: string; isMature?: string }>();
  const showId = String(params.showId || "").trim();
  const showTitle = podcastDiscoveryDisplayName(params.title);
  const showIsMature = params.isMature === "1";

  const normalizeVisibleEpisodes = useCallback(
    (items: HiddenTunesPodcastEpisode[]) => {
      const enriched = enrichEpisodesWithShowMaturity(items, showIsMature);
      return filterVisiblePodcastEpisodes(enriched, { showIsMature });
    },
    [showIsMature]
  );

  const [episodes, setEpisodes] = useState<HiddenTunesPodcastEpisode[]>(() =>
    normalizeVisibleEpisodes(readCachedPodcastEpisodes(showId) || [])
  );
  const [loading, setLoading] = useState(() => episodes.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedFallbacks, setHasCheckedFallbacks] = useState(false);

  const loadEpisodes = useCallback(
    async (forceRefresh = false) => {
      if (!showId) return;

      if (!forceRefresh) {
        const cached = readCachedPodcastEpisodes(showId);
        if (cached?.length) {
          const visible = normalizeVisibleEpisodes(cached);
          setEpisodes((current) =>
            current.length === visible.length &&
            current.every((item, index) => item.id === visible[index]?.id)
              ? current
              : visible
          );
          setLoading(false);
          setHasCheckedFallbacks(true);
          return;
        }

        const storageHit = await hydrateCachedPodcastEpisodes(showId);
        if (storageHit?.length) {
          const visible = normalizeVisibleEpisodes(storageHit);
          setEpisodes((current) =>
            current.length === visible.length &&
            current.every((item, index) => item.id === visible[index]?.id)
              ? current
              : visible
          );
          setLoading(false);
          setHasCheckedFallbacks(true);
          return;
        }
      }

      try {
        const next = await getPodcastEpisodesForShow(showId, { forceRefresh });
        const visible = normalizeVisibleEpisodes(next);
        setEpisodes((current) =>
          current.length === visible.length &&
          current.every((item, index) => item.id === visible[index]?.id)
            ? current
            : visible
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
        setHasCheckedFallbacks(true);
      }
    },
    [normalizeVisibleEpisodes, showId]
  );

  useEffect(() => {
    if (!showId) return;
    void loadEpisodes(false);
  }, [showId, loadEpisodes]);

  useEffect(() => {
    setEpisodes((current) => normalizeVisibleEpisodes(current));
  }, [includeMatureInApi, normalizeVisibleEpisodes]);

  const deepLinkGateRef = useRef(false);
  useEffect(() => {
    if (!showId || !showIsMature || hasConsent || deepLinkGateRef.current) return;

    deepLinkGateRef.current = true;
    runWithMatureConsent({ is_mature: true, content_rating: "adult" }, () => {
      // Deep-linked mature show — consent granted, stay on page.
    });
  }, [hasConsent, runWithMatureConsent, showId, showIsMature]);

  const handleCancelConsent = useCallback(() => {
    cancelConsent();
    if (showIsMature && !hasConsent) {
      router.back();
    }
  }, [cancelConsent, hasConsent, showIsMature]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadEpisodes(true);
  }, [loadEpisodes]);

  const playbackQueue = useMemo(
    () =>
      episodes
        .map((item) => normalizePodcastEpisode(item, showTitle))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [episodes, showTitle]
  );

  const openEpisode = useCallback(
    async (episode: HiddenTunesPodcastEpisode) => {
      const normalized = normalizePodcastEpisode(episode, showTitle);

      if (!normalized) {
        setPlaybackError("This episode is unavailable right now.");
        return;
      }

      const result = await playPodcastEpisode(normalized, playbackQueue);

      if (!result.ok) {
        setPlaybackError(
          result.error || "This episode is unavailable right now."
        );
        return;
      }

      setPlaybackError(null);
    },
    [playbackQueue, playPodcastEpisode, showTitle]
  );

  const handleEpisodePress = useCallback(
    (episode: HiddenTunesPodcastEpisode) => {
      const matureItem = {
        is_mature: isMaturePodcastEpisode(episode, showIsMature),
        content_rating: episode.content_rating,
      };

      runWithMatureConsent(matureItem, () => {
        void openEpisode(episode);
      });
    },
    [openEpisode, runWithMatureConsent, showIsMature]
  );

  const renderEpisodeRow = useCallback(
    ({ item }: { item: HiddenTunesPodcastEpisode }) => (
      <PodcastEpisodeRow
        episode={item}
        showIsMature={showIsMature}
        subtitle={podcastEpisodeSubtitle(item)}
        onPress={() => handleEpisodePress(item)}
      />
    ),
    [handleEpisodePress, showIsMature]
  );

  const listPerformance = useMemo(
    () => getListPerformanceSettings(episodes.length),
    [episodes.length]
  );

  const keyExtractor = useMemo(
    () => createStableKeyExtractor("hidden-tunes-podcast-episode"),
    []
  );

  const showEmpty =
    hasCheckedFallbacks && !loading && !refreshing && episodes.length === 0;

  if (!showId) {
    return (
      <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>This show is not available</Text>
          <Text style={styles.emptyText}>{TESTER_COPY.podcastDiscoveryEmpty}</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Back to Hidden Tunes Podcasts</Text>
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
          <Text style={styles.kicker}>HIDDEN TUNES PODCASTS</Text>
          <Text style={styles.title} numberOfLines={2}>
            {showTitle}
          </Text>
          <Text style={styles.subtitle}>Episodes in this show</Text>
        </View>
      </View>

      {playbackError ? (
        <Text style={styles.errorText}>{playbackError}</Text>
      ) : null}

      {loading && episodes.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{TESTER_COPY.podcastDiscoveryLoading}</Text>
        </View>
      ) : (
        <FlatList
          data={episodes}
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
              {episodes.length > 0
                ? `${episodes.length} Hidden Tunes episodes`
                : "Hidden Tunes episodes"}
            </Text>
          }
          ListEmptyComponent={
            showEmpty ? (
              <View style={styles.emptyBox}>
                <Ionicons name="play-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>Episodes are warming up</Text>
                <Text style={styles.emptyText}>{TESTER_COPY.podcastEpisodesEmpty}</Text>
              </View>
            ) : null
          }
          renderItem={renderEpisodeRow}
          {...listPerformance}
          removeClippedSubviews
        />
      )}

      <Text style={styles.note}>
        Podcast playback stays separate from song playback so your queue, MiniPlayer,
        and auto-next stay stable.
      </Text>

      <MatureContentConsentModal
        visible={consentVisible}
        onCancel={handleCancelConsent}
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
    fontSize: 24,
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
    paddingBottom: 88,
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
  backLink: {
    marginTop: 16,
  },
  backLinkText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  note: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  errorText: {
    color: "#F87171",
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: 20,
    marginBottom: 8,
    textAlign: "center",
    fontWeight: "600",
  },
});
