import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import HTImage from "../../../components/HTImage";
import { PodcastEpisodeCard } from "../../../components/podcast/PodcastCards";
import MaturePodcastConsentModal from "../../../components/podcast/MaturePodcastConsentModal";
import PodcastScreenHeader from "../../../components/podcast/PodcastScreenHeader";
import { COLORS } from "../../../constants/theme";
import { useMaturePodcastGate } from "../../../hooks/useMaturePodcastGate";
import { usePlaybackRouter } from "../../../hooks/usePlaybackRouter";
import { followPodcastShow, getFollowedPodcastShows } from "../../../services/podcastLibrary";
import {
  getPodcastEpisodes,
  PODCAST_SHOW_EPISODE_LIMIT,
  resolvePodcastShowById,
} from "../../../services/podcastService";
import type { PodcastEpisode, PodcastShow } from "../../../types/podcast";
import { isPlayablePodcastAudioUrl } from "../../../utils/podcastPlaybackAdapter";
import { shouldIncludeMaturePodcasts } from "../../../utils/maturePodcastSettings";

export default function PodcastShowScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const showId = String(params.id || "").trim();

  const { playPodcastEpisodeFromShow } = usePlaybackRouter();
  const { consentVisible, runWithMaturePodcastConsent, cancelConsent, confirmConsent } =
    useMaturePodcastGate();

  const staticShow = useMemo(() => resolvePodcastShowById(showId), [showId]);
  const [show, setShow] = useState<PodcastShow | null>(staticShow);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);

  const loadEpisodes = useCallback(async () => {
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

  useEffect(() => {
    void loadEpisodes();
  }, [loadEpisodes]);

  const playEpisode = useCallback(
    (episode: PodcastEpisode, index: number) => {
      runWithMaturePodcastConsent(episode, () => {
        void playPodcastEpisodeFromShow(episode, episodes, index).then((result) => {
          if (!result.ok) Alert.alert("Unavailable", result.error);
        });
      });
    },
    [episodes, playPodcastEpisodeFromShow, runWithMaturePodcastConsent]
  );

  if (!show) {
    return (
      <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
        <PodcastScreenHeader title="Podcast" subtitle="This feed could not be loaded" />
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>This feed could not be loaded</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <PodcastScreenHeader title={show.title} subtitle={show.publisher} kicker="PODCAST" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {show.artworkUrl ? (
            <HTImage uri={show.artworkUrl} style={styles.artwork} contentFit="cover" />
          ) : (
            <View style={styles.artworkFallback}>
              <Ionicons name="mic-outline" size={36} color={COLORS.textMuted} />
            </View>
          )}
          {show.isExplicit ? <Text style={styles.explicit}>EXPLICIT</Text> : null}
          {show.description ? <Text style={styles.description}>{show.description}</Text> : null}

          <TouchableOpacity
            style={styles.followButton}
            onPress={() => {
              void followPodcastShow(show).then(() => setFollowing(true));
            }}
          >
            <Ionicons name={following ? "checkmark" : "add"} size={16} color={COLORS.text} />
            <Text style={styles.followText}>{following ? "Following" : "Follow show"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Latest Episodes</Text>

          {episodesLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={styles.loadingText}>Loading episodes...</Text>
            </View>
          ) : null}

          {!episodesLoading && episodes.length > 0
            ? episodes.map((episode, index) => {
                const playable = Boolean(
                  episode.audioUrl?.trim() && isPlayablePodcastAudioUrl(episode.audioUrl)
                );
                return (
                  <PodcastEpisodeCard
                    key={episode.id}
                    episode={episode}
                    disabled={!playable}
                    onPress={() => playEpisode(episode, index)}
                  />
                );
              })
            : null}

          {!episodesLoading && episodesError ? (
            <View style={styles.errorPanel}>
              <Text style={styles.emptyText}>{episodesError}</Text>
            </View>
          ) : null}
        </View>
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
  content: { paddingHorizontal: 18, paddingBottom: 120 },
  hero: { alignItems: "center", paddingTop: 8, gap: 8 },
  artwork: { width: 180, height: 180, borderRadius: 24 },
  artworkFallback: {
    width: 180,
    height: 180,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  explicit: { color: COLORS.danger, fontWeight: "800", fontSize: 11 },
  description: { color: COLORS.textSoft, fontSize: 13, lineHeight: 19, textAlign: "center" },
  followButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.2)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
  },
  followText: { color: COLORS.text, fontWeight: "700" },
  section: { marginTop: 24, gap: 8 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  loadingText: { color: COLORS.textMuted, fontSize: 13 },
  errorPanel: { alignItems: "center", paddingVertical: 16 },
  emptyText: { color: COLORS.textMuted, textAlign: "center" },
});
