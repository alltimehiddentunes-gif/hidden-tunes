import { useCallback, useEffect, useState } from "react";
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
import MaturePodcastConsentModal from "../../../components/podcast/MaturePodcastConsentModal";
import PodcastScreenHeader from "../../../components/podcast/PodcastScreenHeader";
import { COLORS } from "../../../constants/theme";
import { useMaturePodcastGate } from "../../../hooks/useMaturePodcastGate";
import { usePlaybackRouter } from "../../../hooks/usePlaybackRouter";
import { savePodcastEpisode } from "../../../services/podcastLibrary";
import {
  getPodcastEpisodes,
  PODCAST_SHOW_EPISODE_LIMIT,
  resolvePodcastEpisodeById,
} from "../../../services/podcastService";
import type { PodcastEpisode } from "../../../types/podcast";
import { shouldIncludeMaturePodcasts } from "../../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../../utils/safeNavigation";

export default function PodcastEpisodeScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const episodeId = String(params.id || "").trim();

  const { playPodcastEpisodeFromShow } = usePlaybackRouter();
  const { consentVisible, runWithMaturePodcastConsent, cancelConsent, confirmConsent } =
    useMaturePodcastGate();

  const [episode, setEpisode] = useState<PodcastEpisode | null>(null);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const resolved = await resolvePodcastEpisodeById(
          episodeId,
          shouldIncludeMaturePodcasts()
        );
        if (resolved?.matureLevel !== "safe" && !shouldIncludeMaturePodcasts()) {
          router.replace("/podcasts/mature" as any);
          return;
        }
        setEpisode(resolved);

        if (resolved?.showId) {
          const result = await getPodcastEpisodes(resolved.showId, {
            offset: 0,
            limit: PODCAST_SHOW_EPISODE_LIMIT,
            includeMature: shouldIncludeMaturePodcasts(),
          });
          setEpisodes(result.episodes);
        }
      } catch {
        setEpisode(null);
        setEpisodes([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [episodeId]);

  const play = useCallback(() => {
    if (!episode) return;
    const startIndex = episodes.findIndex((item) => item.id === episode.id);
    runWithMaturePodcastConsent(episode, () => {
      void playPodcastEpisodeFromShow(episode, episodes, startIndex >= 0 ? startIndex : 0).then(
        (result) => {
          if (!result.ok) Alert.alert("Unavailable", result.error);
        }
      );
    });
  }, [episode, episodes, playPodcastEpisodeFromShow, runWithMaturePodcastConsent]);

  if (loading) {
    return (
      <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
        <PodcastScreenHeader title="Episode" subtitle="Loading episode..." kicker="PODCAST" />
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </LinearGradient>
    );
  }

  if (!episode) {
    return (
      <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
        <PodcastScreenHeader title="Episode" subtitle="Unavailable" kicker="PODCAST" />
        <View style={styles.center}>
          <Text style={styles.empty}>This episode is unavailable</Text>
        </View>
      </LinearGradient>
    );
  }

  const durationLabel =
    typeof episode.durationSeconds === "number" && episode.durationSeconds > 0
      ? `${Math.round(episode.durationSeconds / 60)} min`
      : undefined;

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <PodcastScreenHeader title={episode.title} subtitle={episode.showTitle} kicker="PODCAST" />

      <ScrollView contentContainerStyle={styles.content}>
        {episode.artworkUrl ? (
          <HTImage uri={episode.artworkUrl} style={styles.art} contentFit="cover" />
        ) : (
          <View style={styles.artFallback}>
            <Ionicons name="mic-outline" size={32} color={COLORS.textMuted} />
          </View>
        )}

        <TouchableOpacity
          onPress={() =>
            safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: episode.showId } })
          }
        >
          <Text style={styles.showTitle}>{episode.showTitle}</Text>
        </TouchableOpacity>

        <View style={styles.metaRow}>
          {durationLabel ? <Text style={styles.meta}>{durationLabel}</Text> : null}
          {episode.publishedAt ? <Text style={styles.meta}>{episode.publishedAt}</Text> : null}
          {episode.isExplicit ? <Text style={styles.explicit}>EXPLICIT</Text> : null}
        </View>

        {episode.description ? <Text style={styles.description}>{episode.description}</Text> : null}

        <TouchableOpacity style={styles.playButton} onPress={play}>
          <Ionicons name="play" size={18} color={COLORS.text} />
          <Text style={styles.playText}>Play episode</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.saveButton}
          onPress={() => {
            void savePodcastEpisode(episode);
            Alert.alert("Saved", "Episode saved to your podcast library.");
          }}
        >
          <Ionicons name="bookmark-outline" size={16} color={COLORS.primary} />
          <Text style={styles.saveText}>Save episode</Text>
        </TouchableOpacity>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 18, paddingBottom: 120, alignItems: "center" },
  art: { width: 220, height: 220, borderRadius: 24 },
  artFallback: {
    width: 220,
    height: 220,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  showTitle: { color: COLORS.primaryGlow, fontSize: 14, marginTop: 16, textAlign: "center" },
  metaRow: { flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap", justifyContent: "center" },
  meta: { color: COLORS.textSoft, fontSize: 12 },
  explicit: { color: COLORS.danger, fontSize: 11, fontWeight: "800" },
  description: { color: COLORS.textMuted, fontSize: 14, lineHeight: 20, marginTop: 16, textAlign: "center" },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.28)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.45)",
  },
  playText: { color: COLORS.text, fontWeight: "800" },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
  },
  saveText: { color: COLORS.primary, fontWeight: "700" },
  empty: { color: COLORS.textMuted },
});
