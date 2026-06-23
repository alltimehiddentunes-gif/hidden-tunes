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
import FavoriteButton from "../../../components/FavoriteButton";
import MatureContentConsentModal from "../../../components/mature/MatureContentConsentModal";
import { COLORS } from "../../../constants/theme";
import { TESTER_COPY } from "../../../constants/testerExperience";
import { useMatureContentGate } from "../../../hooks/useMatureContentGate";
import { useMountedRef } from "../../../hooks/useMountedRef";
import { useLazyPodcastEpisodeList } from "../../../hooks/useLazyPodcastEpisodeList";
import { useMatureContentSettings } from "../../../hooks/useMatureContentSettings";
import { usePlaybackRouter } from "../../../hooks/usePlaybackRouter";
import { loadPodcastEpisodesPage } from "../../../services/podcastDiscoveryApi";
import type { HiddenTunesPodcastEpisode } from "../../../services/podcastCatalogApi";
import { normalizePodcastEpisode } from "../../../services/podcasts/podcastNormalizer";
import {
  podcastDiscoveryDisplayName,
  podcastEpisodeSubtitle,
} from "../../../utils/openHiddenTunesPodcast";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../../utils/performanceMode";
import { isMaturePodcastEpisode } from "../../../utils/maturePodcastVisibility";
import { buildPodcastShowFavoriteItem } from "../../../services/favorites/favoriteItemBuilders";
import { logPodcastRuntime } from "../../../utils/podcastRuntimeDiagnostics";

export default function PodcastShowScreen() {
  const { playPodcastEpisode } = usePlaybackRouter();
  const { hasConsent } = useMatureContentSettings();
  const { consentVisible, runWithMatureConsent, cancelConsent, confirmConsent } =
    useMatureContentGate();
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const mountedRef = useMountedRef();
  const params = useLocalSearchParams<{ showId?: string; title?: string; isMature?: string }>();
  const showId = String(params.showId || "").trim();
  const showTitle = podcastDiscoveryDisplayName(params.title);
  const showIsMature = params.isMature === "1";

  useEffect(() => {
    if (!showId) return;
    logPodcastRuntime("show_open", { showId, title: showTitle });
  }, [showId, showTitle]);

  const loadPage = useCallback(
    (offset: number, options: { append: boolean; forceRefresh: boolean }) =>
      loadPodcastEpisodesPage(showId, offset, {
        append: options.append,
        forceRefresh: options.forceRefresh,
      }),
    [showId]
  );

  const {
    episodes,
    loading,
    refreshing,
    loadingMore,
    hasLoadedOnce: hasCheckedFallbacks,
    onRefresh,
    loadMore,
  } = useLazyPodcastEpisodeList({
    showId,
    showIsMature,
    enabled: Boolean(showId),
    loadPage,
  });

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
        if (!mountedRef.current) return;
        setPlaybackError("This episode is unavailable right now.");
        return;
      }

      const result = await playPodcastEpisode(normalized, playbackQueue);
      if (!mountedRef.current) return;

      if (!result.ok) {
        setPlaybackError(
          result.error || "This episode is unavailable right now."
        );
        return;
      }

      setPlaybackError(null);
    },
    [mountedRef, playbackQueue, playPodcastEpisode, showTitle]
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

        <FavoriteButton
          item={buildPodcastShowFavoriteItem({
            id: showId,
            slug: showId,
            title: showTitle,
            categories: [],
            sourceName: "Hidden Tunes",
            is_mature: showIsMature,
          })}
          size={20}
        />
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
          onEndReachedThreshold={0.35}
          onEndReached={loadMore}
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
                <Text style={styles.emptyTitle}>No playable episodes yet</Text>
                <Text style={styles.emptyText}>
                  This show has no HTTPS audio episodes right now. Try another show or search Hidden
                  Tunes Podcasts.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerSpinner} color={COLORS.primary} />
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
  footerSpinner: {
    marginVertical: 16,
  },
});
