import { useCallback } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import AppShell from "../../components/navigation/AppShell";
import { PodcastEpisodeCard, PodcastShowCard } from "../../components/podcast/PodcastCards";
import MaturePodcastConsentModal from "../../components/podcast/MaturePodcastConsentModal";
import PodcastScreenHeader from "../../components/podcast/PodcastScreenHeader";
import PodcastSearchBar from "../../components/podcast/PodcastSearchBar";
import PodcastSearchResults from "../../components/podcast/PodcastSearchResults";
import { COLORS } from "../../constants/theme";
import { useMaturePodcastGate } from "../../hooks/useMaturePodcastGate";
import { usePlaybackRouter } from "../../hooks/usePlaybackRouter";
import { usePodcastHome } from "../../hooks/usePodcastHome";
import { usePodcastLocalSearch } from "../../hooks/usePodcastLocalSearch";
import type { PodcastEpisode } from "../../types/podcast";
import { shouldIncludeMaturePodcasts } from "../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../utils/safeNavigation";

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export default function PodcastHomeScreen() {
  const { playPodcastEpisode } = usePlaybackRouter();
  const { consentVisible, runWithMaturePodcastConsent, cancelConsent, confirmConsent } =
    useMaturePodcastGate();
  const { recentlyPlayed, homeShowSections, error } = usePodcastHome();
  const { query, setQuery, results, hasQuery } = usePodcastLocalSearch();

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

  const openShow = useCallback((showId: string) => {
    safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: showId } });
  }, []);

  return (
    <AppShell>
      <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
        <PodcastScreenHeader
          title="Podcasts"
          subtitle="Premium stories, music talk, and global voices"
          fallbackRoute="/library"
        >
          <PodcastSearchBar value={query} onChangeText={setQuery} />
        </PodcastScreenHeader>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {error ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>{error}</Text>
            </View>
          ) : null}

          <PodcastSearchResults results={results} hasQuery={hasQuery} onOpenShow={openShow} />

          {!hasQuery ? (
            <>
              {recentlyPlayed.length > 0 ? (
                <View style={styles.sectionBlock}>
                  <SectionHeader title="Recently Played" />
                  {recentlyPlayed.map((episode) => (
                    <PodcastEpisodeCard
                      key={`recent-${episode.id}`}
                      episode={episode}
                      onPress={() => playEpisode(episode)}
                    />
                  ))}
                </View>
              ) : null}

              {homeShowSections.map((section) => (
                <View key={section.id} style={styles.sectionBlock}>
                  <SectionHeader title={section.title} />
                  {section.shows.map((show) => (
                    <PodcastShowCard
                      key={`${section.id}-${show.id}`}
                      show={show}
                      onPress={() => openShow(show.id)}
                    />
                  ))}
                </View>
              ))}

              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.matureCard}
                onPress={() => router.push("/podcasts/mature" as any)}
              >
                <Ionicons
                  name={shouldIncludeMaturePodcasts() ? "lock-open-outline" : "lock-closed-outline"}
                  size={20}
                  color={COLORS.danger}
                />
                <View style={styles.matureCopy}>
                  <Text style={styles.matureTitle}>Mature Podcasts 18+</Text>
                  <Text style={styles.matureSubtitle}>
                    {shouldIncludeMaturePodcasts()
                      ? "Unlocked — explicit podcasts enabled"
                      : "Locked — confirm age to unlock"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </>
          ) : null}
        </ScrollView>

        <MaturePodcastConsentModal
          visible={consentVisible}
          onCancel={cancelConsent}
          onConfirm={confirmConsent}
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 120, gap: 18 },
  sectionBlock: { gap: 4 },
  sectionHeader: { marginBottom: 8 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  emptyPanel: { paddingVertical: 24 },
  emptyTitle: { color: COLORS.textMuted, textAlign: "center" },
  matureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
    marginTop: 8,
  },
  matureCopy: { flex: 1 },
  matureTitle: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  matureSubtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 },
});
