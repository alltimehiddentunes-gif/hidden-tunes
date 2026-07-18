import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import HTImage from "../../../components/HTImage";
import { PodcastEpisodeCard, PodcastShowCard } from "../../../components/podcast/PodcastCards";
import MaturePodcastConsentModal from "../../../components/podcast/MaturePodcastConsentModal";
import { PodcastReadMoreText } from "../../../components/podcast/PodcastReadMoreText";
import PodcastShowBackBar from "../../../components/podcast/PodcastShowBackBar";
import { FadeInView, ScalePressable } from "../../../components/podcast/PodcastShowAnimations";
import { COLORS } from "../../../constants/theme";
import { useMaturePodcastGate } from "../../../hooks/useMaturePodcastGate";
import { usePlaybackRouter } from "../../../hooks/usePlaybackRouter";
import {
  followPodcastShow,
  getFollowedPodcastShows,
  unfollowPodcastShow,
} from "../../../services/podcastLibrary";
import {
  fetchPodcastEpisodePlay,
  fetchPodcastEpisodesByShow,
  fetchPodcastShowById,
  isBackendPodcastShowId,
  PODCAST_CATALOG_PAGE_LIMIT,
  type PodcastCatalogEpisodeMetadata,
} from "../../../services/podcastCatalogApi";
import {
  getPodcastEpisodes,
  getRelatedPodcastShows,
  PODCAST_SHOW_EPISODE_LIMIT,
  resolvePodcastShowById,
} from "../../../services/podcastService";
import type { PodcastEpisode, PodcastShow } from "../../../types/podcast";
import { cleanPodcastDescription } from "../../../utils/podcastDescription";
import { isPlayablePodcastAudioUrl } from "../../../utils/podcastPlaybackAdapter";
import { shouldIncludeMaturePodcasts } from "../../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../../utils/safeNavigation";
import { createTapGuardState, shouldIgnoreDuplicateTap } from "../../../utils/tapPressGuard";

function shuffleEpisodes<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isEpisodePlayable(episode: PodcastEpisode) {
  return Boolean(episode.audioUrl?.trim() && isPlayablePodcastAudioUrl(episode.audioUrl));
}

const playEpisodeTapGuard = createTapGuardState();

function catalogEpisodeToDisplayEpisode(
  metadata: PodcastCatalogEpisodeMetadata,
  showTitle: string
): PodcastEpisode {
  return {
    id: metadata.id,
    showId: metadata.showId,
    showTitle,
    title: metadata.title,
    description: metadata.description || "",
    artworkUrl: metadata.artworkUrl || "",
    audioUrl: "",
    durationSeconds: metadata.durationSeconds,
    publishedAt: metadata.publishedAt,
    language: "unknown",
    categories: [],
    isExplicit: false,
    matureLevel: "safe",
    source: "podcast_rss",
  };
}

function catalogEpisodeToPlayableEpisode(
  metadata: PodcastCatalogEpisodeMetadata,
  play: NonNullable<Awaited<ReturnType<typeof fetchPodcastEpisodePlay>>["play"]>,
  showTitle: string
): PodcastEpisode {
  return {
    id: play.id,
    showId: play.showId || metadata.showId,
    showTitle,
    title: play.title || metadata.title,
    description: metadata.description || "",
    artworkUrl: metadata.artworkUrl || "",
    audioUrl: play.audioUrl,
    durationSeconds: play.durationSeconds ?? metadata.durationSeconds,
    publishedAt: play.publishedAt ?? metadata.publishedAt,
    language: "unknown",
    categories: [],
    isExplicit: false,
    matureLevel: "safe",
    source: "podcast_rss",
  };
}

export default function PodcastShowScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const showId = String(params.id || "").trim();
  const isBackendShow = isBackendPodcastShowId(showId);

  const { playPodcastEpisodeFromShow } = usePlaybackRouter();
  const { consentVisible, runWithMaturePodcastConsent, cancelConsent, confirmConsent } =
    useMaturePodcastGate();

  const staticShow = useMemo(
    () => (isBackendShow ? null : resolvePodcastShowById(showId)),
    [isBackendShow, showId]
  );
  const [show, setShow] = useState<PodcastShow | null>(staticShow);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [catalogEpisodes, setCatalogEpisodes] = useState<PodcastCatalogEpisodeMetadata[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [resolvingEpisodeId, setResolvingEpisodeId] = useState<string | null>(null);

  const cleanedDescription = useMemo(
    () => cleanPodcastDescription(show?.description),
    [show?.description]
  );

  const playableEpisodes = useMemo(
    () => (isBackendShow ? [] : episodes.filter((episode) => isEpisodePlayable(episode))),
    [episodes, isBackendShow]
  );

  const latestEpisode = useMemo(() => {
    if (isBackendShow) {
      return catalogEpisodes[0]
        ? catalogEpisodeToDisplayEpisode(catalogEpisodes[0], show?.title || "Podcast")
        : null;
    }
    return playableEpisodes.length > 0 ? playableEpisodes[0] : null;
  }, [catalogEpisodes, isBackendShow, playableEpisodes, show?.title]);

  const relatedShows = useMemo(
    () => (show && !isBackendShow ? getRelatedPodcastShows(show, 5) : []),
    [isBackendShow, show]
  );

  const loadBackendShow = useCallback(async () => {
    if (!showId) return;

    setEpisodesLoading(true);
    setEpisodesError(null);

    try {
      const [showResult, episodeResult] = await Promise.all([
        fetchPodcastShowById(showId),
        fetchPodcastEpisodesByShow(showId, 1, PODCAST_CATALOG_PAGE_LIMIT),
      ]);

      if (!showResult.success || !showResult.show) {
        setShow(null);
        setCatalogEpisodes([]);
        setEpisodesError("This feed could not be loaded");
        return;
      }

      const catalogShow = showResult.show;
      setShow({
        id: catalogShow.id,
        title: catalogShow.title,
        publisher: catalogShow.publisher || catalogShow.hostName || catalogShow.title,
        description: catalogShow.description || "",
        artworkUrl: catalogShow.artworkUrl || "",
        feedUrl: "",
        language: "unknown",
        categories: catalogShow.categories,
        isExplicit: false,
        matureLevel: "safe",
        source: "rss",
      });

      if (!episodeResult.success) {
        setCatalogEpisodes([]);
        setEpisodesError(episodeResult.error || "Episodes unavailable right now");
        return;
      }

      setCatalogEpisodes(episodeResult.episodes);
      if (!episodeResult.episodes.length) {
        setEpisodesError("Episodes unavailable right now");
      }
    } catch {
      setShow(null);
      setCatalogEpisodes([]);
      setEpisodesError("Episodes unavailable right now");
    } finally {
      setEpisodesLoading(false);
      const followed = await getFollowedPodcastShows();
      setFollowing(followed.some((item) => item.id === showId));
    }
  }, [showId]);

  const loadRssShow = useCallback(async () => {
    if (!showId) return;

    const resolved = resolvePodcastShowById(showId);
    if (!resolved) {
      setShow(null);
      setEpisodes([]);
      setEpisodesError("This feed could not be loaded");
      return;
    }

    if (resolved.matureLevel !== "safe" && !shouldIncludeMaturePodcasts()) {
      router.replace("/podcasts/mature" as any);
      return;
    }

    setShow(resolved);
    setEpisodesLoading(true);
    setEpisodesError(null);

    try {
      const result = await getPodcastEpisodes(showId, {
        offset: 0,
        limit: PODCAST_SHOW_EPISODE_LIMIT,
        includeMature: shouldIncludeMaturePodcasts(),
      });

      if (result.show) {
        setShow(result.show);
      }

      if (result.error === "mature_blocked") {
        router.replace("/podcasts/mature" as any);
        return;
      }

      setEpisodes(result.episodes);
      if (!result.episodes.length) {
        setEpisodesError("Episodes unavailable right now");
      }
    } catch {
      setEpisodes([]);
      setEpisodesError("Episodes unavailable right now");
    } finally {
      setEpisodesLoading(false);
      const followed = await getFollowedPodcastShows();
      if (resolved) {
        setFollowing(followed.some((item) => item.id === resolved.id));
      }
    }
  }, [showId]);

  const loadEpisodes = useCallback(async () => {
    if (isBackendShow) {
      await loadBackendShow();
      return;
    }
    await loadRssShow();
  }, [isBackendShow, loadBackendShow, loadRssShow]);

  useEffect(() => {
    void loadEpisodes();
  }, [loadEpisodes]);

  const playResolvedEpisode = useCallback(
    async (metadata: PodcastCatalogEpisodeMetadata) => {
      if (!show) return;
      if (shouldIgnoreDuplicateTap(playEpisodeTapGuard, `podcast-play:${metadata.id}`)) return;

      setResolvingEpisodeId(metadata.id);
      try {
        const resolved = await fetchPodcastEpisodePlay(metadata.id);
        if (!resolved.success || !resolved.play?.audioUrl) {
          Alert.alert("Unavailable", resolved.error || "This episode is unavailable.");
          return;
        }

        const playable = catalogEpisodeToPlayableEpisode(metadata, resolved.play, show.title);
        // Same-show queue: preserve catalog API order; only the selected row has audio yet.
        const showQueue = catalogEpisodes.map((entry) =>
          entry.id === metadata.id
            ? playable
            : catalogEpisodeToDisplayEpisode(entry, show.title)
        );
        await runWithMaturePodcastConsent(playable, () =>
          playPodcastEpisodeFromShow(playable, showQueue.length ? showQueue : [playable], undefined, {
            creatorId: show.publisher,
            categoryId: show.categories?.[0],
            feedId: show.feedUrl || show.id,
          }).then((result) => {
            if (!result.ok) Alert.alert("Unavailable", result.error);
          })
        );
      } finally {
        setResolvingEpisodeId(null);
      }
    },
    [catalogEpisodes, playPodcastEpisodeFromShow, runWithMaturePodcastConsent, show]
  );

  const playEpisode = useCallback(
    (episode: PodcastEpisode) => {
      if (shouldIgnoreDuplicateTap(playEpisodeTapGuard, `podcast-play:${episode.id}`)) return;
      runWithMaturePodcastConsent(episode, () => {
        void playPodcastEpisodeFromShow(episode, episodes, undefined, {
          creatorId: show?.publisher,
          categoryId: show?.categories?.[0],
          feedId: show?.feedUrl || show?.id,
        }).then((result) => {
          if (!result.ok) Alert.alert("Unavailable", result.error);
        });
      });
    },
    [episodes, playPodcastEpisodeFromShow, runWithMaturePodcastConsent, show]
  );

  const playLatest = useCallback(() => {
    if (!latestEpisode) return;
    if (isBackendShow && catalogEpisodes[0]) {
      void playResolvedEpisode(catalogEpisodes[0]);
      return;
    }
    playEpisode(latestEpisode);
  }, [catalogEpisodes, isBackendShow, latestEpisode, playEpisode, playResolvedEpisode]);

  const shuffleEpisodesPlay = useCallback(() => {
    if (isBackendShow) {
      if (!catalogEpisodes.length) return;
      const pick = catalogEpisodes[Math.floor(Math.random() * catalogEpisodes.length)];
      void playResolvedEpisode(pick);
      return;
    }

    if (!playableEpisodes.length) return;
    const shuffled = shuffleEpisodes(playableEpisodes);
    const first = shuffled[0];
    runWithMaturePodcastConsent(first, () => {
      void playPodcastEpisodeFromShow(first, shuffled).then((result) => {
        if (!result.ok) Alert.alert("Unavailable", result.error);
      });
    });
  }, [
    catalogEpisodes,
    isBackendShow,
    playPodcastEpisodeFromShow,
    playResolvedEpisode,
    playableEpisodes,
    runWithMaturePodcastConsent,
  ]);

  const toggleFollow = useCallback(() => {
    if (!show) return;
    if (following) {
      void unfollowPodcastShow(show.id).then(() => setFollowing(false));
      return;
    }
    void followPodcastShow(show).then(() => setFollowing(true));
  }, [following, show]);

  const openRelatedShow = useCallback((relatedShowId: string) => {
    safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: relatedShowId } });
  }, []);

  if (!show) {
    return (
      <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
        <PodcastShowBackBar />
        <View style={styles.centerContent}>
          {episodesLoading ? (
            <ActivityIndicator color={COLORS.primary} size="large" />
          ) : (
            <Text style={styles.emptyText}>This feed could not be loaded</Text>
          )}
        </View>
      </LinearGradient>
    );
  }

  const latestUnavailable =
    !isBackendShow && !episodesLoading && episodes.length > 0 && !latestEpisode;
  const displayEpisodes = isBackendShow
    ? catalogEpisodes.map((item) => catalogEpisodeToDisplayEpisode(item, show.title))
    : episodes;
  const hasEpisodes = displayEpisodes.length > 0;

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <PodcastShowBackBar />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FadeInView style={styles.hero}>
          <View style={styles.artworkWrap}>
            {show.artworkUrl ? (
              <HTImage uri={show.artworkUrl} style={styles.artwork} contentFit="cover" />
            ) : (
              <View style={styles.artworkFallback}>
                <Ionicons name="mic-outline" size={40} color={COLORS.textMuted} />
              </View>
            )}
          </View>

          <Text style={styles.title} accessibilityRole="header">
            {show.title}
          </Text>
          <Text style={styles.publisher}>{show.publisher}</Text>
          {show.isExplicit ? <Text style={styles.explicit}>EXPLICIT</Text> : null}

          <View style={styles.actionRow}>
            <ScalePressable
              onPress={toggleFollow}
              accessibilityLabel={following ? "Unfollow podcast show" : "Follow podcast show"}
              style={styles.followButton}
            >
              <Ionicons name={following ? "checkmark" : "add"} size={16} color={COLORS.text} />
              <Text style={styles.followText}>{following ? "Following" : "Follow show"}</Text>
            </ScalePressable>

            <ScalePressable
              onPress={playLatest}
              disabled={!latestEpisode}
              accessibilityLabel={
                latestEpisode ? "Play latest episode" : "Latest episode unavailable"
              }
              style={[styles.playLatestButton, !latestEpisode && styles.playLatestDisabled]}
            >
              <Ionicons name="play" size={16} color={COLORS.text} />
              <Text style={styles.playLatestText}>Play Latest</Text>
            </ScalePressable>
          </View>

          {latestUnavailable ? (
            <Text style={styles.latestUnavailable}>Latest episode unavailable</Text>
          ) : null}

          <ScalePressable
            onPress={shuffleEpisodesPlay}
            disabled={!hasEpisodes}
            accessibilityLabel="Shuffle loaded podcast episodes"
            style={[
              styles.shuffleButton,
              !hasEpisodes && styles.shuffleButtonDisabled,
            ]}
          >
            <Ionicons name="shuffle" size={16} color={COLORS.primaryGlow} />
            <Text style={styles.shuffleText}>Shuffle Episodes</Text>
          </ScalePressable>

          {cleanedDescription ? <PodcastReadMoreText text={cleanedDescription} /> : null}
        </FadeInView>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Latest Episodes</Text>

          {episodesLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={styles.loadingText}>Loading episodes...</Text>
            </View>
          ) : null}

          {!episodesLoading && hasEpisodes ? (
            <FadeInView delay={80}>
              {displayEpisodes.map((episode, index) => (
                <PodcastEpisodeCard
                  key={episode.id}
                  episode={episode}
                  index={index}
                  browseOnly={isBackendShow}
                  disabled={isBackendShow && resolvingEpisodeId === episode.id}
                  onPress={() => {
                    if (isBackendShow) {
                      void playResolvedEpisode(catalogEpisodes[index]);
                      return;
                    }
                    playEpisode(episode);
                  }}
                />
              ))}
            </FadeInView>
          ) : null}

          {!episodesLoading && episodesError ? (
            <View style={styles.errorPanel}>
              <Text style={styles.emptyText}>{episodesError}</Text>
            </View>
          ) : null}
        </View>

        {relatedShows.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Related Podcasts</Text>
            {relatedShows.map((related) => (
              <PodcastShowCard
                key={`related-${related.id}`}
                show={related}
                onPress={() => openRelatedShow(related.id)}
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
  centerContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  hero: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  artworkWrap: {
    marginTop: 8,
    marginBottom: 12,
    shadowColor: "#A855F7",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  artwork: { width: 208, height: 208, borderRadius: 28 },
  artworkFallback: {
    width: 208,
    height: 208,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  publisher: {
    color: COLORS.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
  explicit: { color: COLORS.danger, fontWeight: "800", fontSize: 11 },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
  },
  followButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.18)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  followText: { color: COLORS.text, fontWeight: "700", fontSize: 14 },
  playLatestButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.34)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.5)",
  },
  playLatestDisabled: {
    opacity: 0.45,
  },
  playLatestText: { color: COLORS.text, fontWeight: "800", fontSize: 14 },
  latestUnavailable: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  shuffleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  shuffleButtonDisabled: {
    opacity: 0.4,
  },
  shuffleText: {
    color: COLORS.primaryGlow,
    fontWeight: "700",
    fontSize: 13,
  },
  section: { marginTop: 28, gap: 8 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800", marginBottom: 4 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  loadingText: { color: COLORS.textMuted, fontSize: 13 },
  errorPanel: { alignItems: "center", paddingVertical: 16 },
  emptyText: { color: COLORS.textMuted, textAlign: "center" },
});
