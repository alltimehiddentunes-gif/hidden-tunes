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
import { COLORS } from "../../../constants/theme";
import { useMaturePodcastGate } from "../../../hooks/useMaturePodcastGate";
import { usePlaybackRouter } from "../../../hooks/usePlaybackRouter";
import { savePodcastEpisode } from "../../../services/podcastLibrary";
import { resolvePodcastEpisodeById } from "../../../services/podcastService";
import type { PodcastEpisode } from "../../../types/podcast";
import { shouldIncludeMaturePodcasts } from "../../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../../utils/safeNavigation";

export default function PodcastEpisodeScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const episodeId = String(params.id || "").trim();

  const { playPodcastEpisode } = usePlaybackRouter();
  const { consentVisible, runWithMaturePodcastConsent, cancelConsent, confirmConsent } =
    useMaturePodcastGate();

  const [episode, setEpisode] = useState<PodcastEpisode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const resolved = await resolvePodcastEpisodeById(
        episodeId,
        shouldIncludeMaturePodcasts()
      );
      if (resolved?.matureLevel !== "safe" && !shouldIncludeMaturePodcasts()) {
        router.replace("/podcasts/mature" as any);
        return;
      }
      setEpisode(resolved);
      setLoading(false);
    })();
  }, [episodeId]);

  const play = useCallback(() => {
    if (!episode) return;
    runWithMaturePodcastConsent(episode, () => {
      void playPodcastEpisode(episode).then((result) => {
        if (!result.ok) Alert.alert("Unavailable", result.error);
      });
    });
  }, [episode, playPodcastEpisode, runWithMaturePodcastConsent]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (!episode) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>This episode is unavailable</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const durationLabel =
    typeof episode.durationSeconds === "number" && episode.durationSeconds > 0
      ? `${Math.round(episode.durationSeconds / 60)} min`
      : undefined;

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={COLORS.text} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content}>
        {episode.artworkUrl ? (
          <HTImage uri={episode.artworkUrl} style={styles.art} contentFit="cover" />
        ) : (
          <View style={styles.artFallback}>
            <Ionicons name="mic-outline" size={32} color={COLORS.textMuted} />
          </View>
        )}

        <Text style={styles.title}>{episode.title}</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  backButton: { padding: 18 },
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
  title: { color: COLORS.text, fontSize: 24, fontWeight: "900", textAlign: "center", marginTop: 16 },
  showTitle: { color: COLORS.primaryGlow, fontSize: 14, marginTop: 6, textAlign: "center" },
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
  link: { color: COLORS.primary, marginTop: 12 },
});
