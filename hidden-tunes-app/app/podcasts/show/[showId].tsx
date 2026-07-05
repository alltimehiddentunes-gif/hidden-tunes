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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { PodcastShowEpisodeCard } from "../../../components/podcast/PodcastShowEpisodeCard";
import { PodcastShowHeader } from "../../../components/podcast/PodcastShowHeader";
import { RelatedPodcastShows } from "../../../components/podcast/RelatedPodcastShows";
import { COLORS } from "../../../constants/theme";
import { TESTER_COPY } from "../../../constants/testerExperience";
import { usePlaybackRouter } from "../../../hooks/usePlaybackRouter";
import {
  isPodcastShowFollowed,
  togglePodcastShowFollow,
} from "../../../services/podcastLibrary";
import {
  getMaturePodcastShowById,
  getMaturePodcastSeedById,
} from "../../../services/podcastService";
import { isMaturePodcastsEnabled } from "../../../services/maturePodcastPreferences";
import {
  getPodcastEpisodesForShow,
} from "../../../services/podcastDiscoveryApi";
import type {
  HiddenTunesPodcastEpisode,
  HiddenTunesPodcastShow,
} from "../../../services/podcastCatalogApi";
import { fetchPodcastEpisodePlay } from "../../../services/podcastCatalogApi";
import type { PodcastEpisode } from "../../../types/podcast";
import { cleanPodcastDescription } from "../../../utils/podcastDescription";
import {
  findCachedPodcastShowById,
  hydrateCachedPodcastEpisodes,
  readCachedPodcastEpisodes,
} from "../../../utils/podcastDiscoveryCache";
import { getRelatedPodcastShows } from "../../../utils/podcastRelatedShows";
import {
  isMatureSeedShowId,
} from "../../../utils/podcastPerformanceLimits";
import { useMountedRef } from "../../../utils/useMountedRef";
import { podcastDiscoveryDisplayName } from "../../../utils/openHiddenTunesPodcast";
import {
  createStableKeyExtractor,
  getListPerformanceSettings,
} from "../../../utils/performanceMode";

function shuffleEpisodes<T>(items: T[]) {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function buildShowFromParams(params: {
  showId: string;
  title?: string;
  hostName?: string;
  artworkUrl?: string;
  description?: string;
}): HiddenTunesPodcastShow {
  const title = podcastDiscoveryDisplayName(params.title);

  return {
    id: params.showId,
    slug: params.showId,
    title,
    description: params.description || undefined,
    artwork_url: params.artworkUrl || undefined,
    host_name: params.hostName || undefined,
    categories: [],
    sourceName: "Hidden Tunes",
  };
}

export default function PodcastShowScreen() {
  const insets = useSafeAreaInsets();
  const mountedRef = useMountedRef();
  const { playPodcastEpisode } = usePlaybackRouter();
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [playLatestBusy, setPlayLatestBusy] = useState(false);
  const [shuffleBusy, setShuffleBusy] = useState(false);
  const [matureEnabled, setMatureEnabled] = useState(false);
  const [maturePrefsLoaded, setMaturePrefsLoaded] = useState(false);

  const params = useLocalSearchParams<{
    showId?: string;
    title?: string;
    hostName?: string;
    artworkUrl?: string;
    description?: string;
  }>();

  const showId = String(params.showId || "").trim();
  const isMatureShow = isMatureSeedShowId(showId);

  const show = useMemo(() => {
    if (isMatureShow && !matureEnabled) {
      const seed = getMaturePodcastSeedById(showId);
      if (seed) {
        return buildShowFromParams({
          showId,
          title: seed.title,
          hostName: seed.publisher,
          artworkUrl: seed.artworkUrl,
          description: seed.description,
        });
      }
    }

    const cached = findCachedPodcastShowById(showId);
    if (cached) return cached;

    const matureShow = getMaturePodcastShowById(showId, matureEnabled);
    if (matureShow) return matureShow;

    return buildShowFromParams({
      showId,
      title: params.title,
    });
  }, [isMatureShow, matureEnabled, params.title, showId]);

  const showTitle = podcastDiscoveryDisplayName(show.title);

  const cleanedDescription = useMemo(
    () => cleanPodcastDescription(show.description),
    [show.description]
  );

  const [episodes, setEpisodes] = useState<HiddenTunesPodcastEpisode[]>(() =>
    readCachedPodcastEpisodes(showId) || []
  );
  const [loading, setLoading] = useState(() => episodes.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCheckedFallbacks, setHasCheckedFallbacks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const latestPlayable = episodes.length > 0;

  const relatedShows = useMemo(
    () => getRelatedPodcastShows(show, 5),
    [show]
  );

  const loadEpisodes = useCallback(
    async (forceRefresh = false) => {
      if (!showId) return;

      try {
        setLoadError(null);
        const next = await getPodcastEpisodesForShow(showId, {
          forceRefresh,
          title: showTitle,
          includeMature: matureEnabled,
        });
        if (!mountedRef.current) return;
        setEpisodes(next);
      } catch {
        if (!mountedRef.current) return;
        setLoadError("Episodes unavailable right now.");
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
        setRefreshing(false);
        setHasCheckedFallbacks(true);
      }
    },
    [matureEnabled, mountedRef, showId, showTitle]
  );

  useEffect(() => {
    void isMaturePodcastsEnabled()
      .then((enabled) => {
        if (!mountedRef.current) return;
        setMatureEnabled(enabled);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setMatureEnabled(false);
      })
      .finally(() => {
        if (!mountedRef.current) return;
        setMaturePrefsLoaded(true);
      });
  }, [mountedRef]);

  useEffect(() => {
    if (!showId || episodes.length > 0) return;

    void hydrateCachedPodcastEpisodes(showId).then((cached) => {
      if (!mountedRef.current || !cached?.length) return;
      setEpisodes(cached);
      setLoading(false);
    });
  }, [episodes.length, mountedRef, showId]);

  useEffect(() => {
    if (!showId) return;
    if (!maturePrefsLoaded) return;
    if (isMatureShow && !matureEnabled) {
      setLoading(false);
      setHasCheckedFallbacks(true);
      return;
    }
    void loadEpisodes(false);
  }, [isMatureShow, loadEpisodes, matureEnabled, maturePrefsLoaded, showId]);

  const toPlayableEpisode = useCallback(
    (
      play: Awaited<ReturnType<typeof fetchPodcastEpisodePlay>>,
      metadata?: HiddenTunesPodcastEpisode
    ): PodcastEpisode => ({
      id: play.id,
      title: play.title,
      podcastTitle: play.podcast_title || metadata?.podcast_title || showTitle,
      audioUrl: play.audio_url,
      artworkUrl: play.artwork_url || metadata?.artwork_url || undefined,
      duration: play.duration_seconds || metadata?.duration_seconds,
      publishedAt: metadata?.published_at,
      source: "podcast",
    }),
    [showTitle]
  );

  useEffect(() => {
    if (!showId) return;

    let active = true;
    void isPodcastShowFollowed(showId).then((followed) => {
      if (active) setIsFollowing(followed);
    });

    return () => {
      active = false;
    };
  }, [showId]);

  const playEpisodeAtIndex = useCallback(
    async (index: number) => {
      const episode = episodes[index];
      if (!episode) return;

      const play = await fetchPodcastEpisodePlay(episode.id, {
        includeMature: matureEnabled,
      });
      if (!play.audio_url) {
        setPlaybackError("This episode audio is unavailable right now.");
        return;
      }

      const playable = toPlayableEpisode(play, episode);
      const result = await playPodcastEpisode(playable, [playable]);

      if (!result.ok) {
        setPlaybackError(
          result.error || "This episode audio is unavailable right now."
        );
        return;
      }

      setPlaybackError(null);
    },
    [episodes, matureEnabled, playPodcastEpisode, toPlayableEpisode]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadEpisodes(true);
  }, [loadEpisodes]);

  const handleToggleFollow = useCallback(async () => {
    if (!showId || followBusy) return;

    setFollowBusy(true);
    try {
      const result = await togglePodcastShowFollow(show);
      setIsFollowing(result.followed);
    } finally {
      setFollowBusy(false);
    }
  }, [followBusy, show, showId]);

  const handlePlayLatest = useCallback(async () => {
    if (!latestPlayable || playLatestBusy) return;

    setPlayLatestBusy(true);
    try {
      await playEpisodeAtIndex(0);
    } finally {
      setPlayLatestBusy(false);
    }
  }, [latestPlayable, playEpisodeAtIndex, playLatestBusy]);

  const handleShuffle = useCallback(async () => {
    if (!episodes.length || shuffleBusy) return;

    setShuffleBusy(true);
    try {
      const shuffledEpisodes = shuffleEpisodes(episodes);
      const firstEpisode = shuffledEpisodes[0];

      if (!firstEpisode) {
        setPlaybackError("This episode audio is unavailable right now.");
        return;
      }

      const play = await fetchPodcastEpisodePlay(firstEpisode.id, {
        includeMature: matureEnabled,
      });
      if (!play.audio_url) {
        setPlaybackError("This episode audio is unavailable right now.");
        return;
      }

      const playable = toPlayableEpisode(play, firstEpisode);
      const result = await playPodcastEpisode(playable, [playable]);

      if (!result.ok) {
        setPlaybackError(
          result.error || "This episode audio is unavailable right now."
        );
        return;
      }

      setPlaybackError(null);
    } finally {
      setShuffleBusy(false);
    }
  }, [
    episodes,
    matureEnabled,
    playPodcastEpisode,
    shuffleBusy,
    toPlayableEpisode,
  ]);

  const renderEpisodeRow = useCallback(
    ({ item, index }: { item: HiddenTunesPodcastEpisode; index: number }) => (
      <PodcastShowEpisodeCard
        episode={item}
        podcastTitle={showTitle}
        onPress={() => void playEpisodeAtIndex(index)}
        onPlayPress={() => void playEpisodeAtIndex(index)}
      />
    ),
    [playEpisodeAtIndex, showTitle]
  );

  const listPerformance = useMemo(
    () => getListPerformanceSettings(episodes.length),
    [episodes.length]
  );

  const keyExtractor = useMemo(
    () => createStableKeyExtractor("hidden-tunes-podcast-episode"),
    []
  );

  const listHeader = useMemo(
    () => (
      <PodcastShowHeader
        show={show}
        cleanedDescription={cleanedDescription}
        isFollowing={isFollowing}
        followBusy={followBusy}
        latestPlayable={latestPlayable}
        playLatestBusy={playLatestBusy}
        shuffleBusy={shuffleBusy}
        hasEpisodes={episodes.length > 0}
        onToggleFollow={() => void handleToggleFollow()}
        onPlayLatest={() => void handlePlayLatest()}
        onShuffle={() => void handleShuffle()}
      />
    ),
    [
      cleanedDescription,
      episodes.length,
      followBusy,
      handlePlayLatest,
      handleShuffle,
      handleToggleFollow,
      isFollowing,
      latestPlayable,
      playLatestBusy,
      show,
      shuffleBusy,
    ]
  );

  const listFooter = useMemo(
    () => <RelatedPodcastShows shows={relatedShows} />,
    [relatedShows]
  );

  const showEmpty =
    hasCheckedFallbacks && !loading && !refreshing && episodes.length === 0;

  const headerTopPadding = Math.max(insets.top + 12, 12);

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

  if (maturePrefsLoaded && isMatureShow && !matureEnabled) {
    return (
      <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="eye-off-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Mature podcasts are hidden</Text>
          <Text style={styles.emptyText}>
            Enable Mature Podcasts 18+ in settings to open this show.
          </Text>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.push("/podcasts/mature" as any)}
          >
            <Text style={styles.backLinkText}>Open Mature Podcasts settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
      <View style={[styles.topBar, { paddingTop: headerTopPadding }]}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.85}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {playbackError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {playbackError}
        </Text>
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
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            showEmpty ? (
              <View style={styles.emptyBox}>
                <Ionicons
                  name={loadError ? "alert-circle-outline" : "play-outline"}
                  size={48}
                  color={COLORS.textMuted}
                />
                <Text style={styles.emptyTitle}>
                  {loadError || "Episodes unavailable right now."}
                </Text>
                <Text style={styles.emptyText}>
                  {loadError ? "Try again." : TESTER_COPY.podcastEpisodesEmpty}
                </Text>
                {loadError ? (
                  <TouchableOpacity
                    activeOpacity={0.86}
                    style={styles.retryButton}
                    onPress={() => {
                      setLoading(true);
                      void loadEpisodes(true);
                    }}
                  >
                    <Text style={styles.retryButtonText}>Try again</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null
          }
          renderItem={renderEpisodeRow}
          {...listPerformance}
          removeClippedSubviews
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 88,
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
  errorText: {
    color: "#F87171",
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: 20,
    marginBottom: 8,
    textAlign: "center",
    fontWeight: "600",
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
});
