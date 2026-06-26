import { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
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
import {
  PodcastCategoryCard,
  PodcastEpisodeCard,
  PodcastShowCard,
} from "../../components/podcast/PodcastCards";
import MaturePodcastConsentModal from "../../components/podcast/MaturePodcastConsentModal";
import { COLORS } from "../../constants/theme";
import { useMaturePodcastGate } from "../../hooks/useMaturePodcastGate";
import { usePlaybackRouter } from "../../hooks/usePlaybackRouter";
import { usePodcastHome } from "../../hooks/usePodcastHome";
import type { PodcastEpisode } from "../../types/podcast";
import { shouldIncludeMaturePodcasts } from "../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../utils/safeNavigation";

function SectionHeader({
  title,
  eyebrow,
  onSeeAll,
}: {
  title: string;
  eyebrow: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {onSeeAll ? (
        <TouchableOpacity activeOpacity={0.85} onPress={onSeeAll}>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function PodcastHomeScreen() {
  const { playPodcastEpisode } = usePlaybackRouter();
  const { consentVisible, runWithMaturePodcastConsent, cancelConsent, confirmConsent } =
    useMaturePodcastGate();
  const {
    featured,
    trending,
    newEpisodes,
    popularShows,
    recommended,
    recentlyPlayed,
    rootSections,
    loading,
    error,
    refresh,
  } = usePodcastHome();

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

  const openCategory = useCallback((categoryId: string, matureOnly?: boolean) => {
    if (matureOnly && !shouldIncludeMaturePodcasts()) {
      router.push("/podcasts/mature" as any);
      return;
    }
    safeRouterPush({ pathname: "/podcasts/category/[id]", params: { id: categoryId } });
  }, []);

  return (
    <AppShell>
      <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>HIDDEN TUNES</Text>
            <Text style={styles.title}>PODCASTS</Text>
            <Text style={styles.subtitle}>Premium stories, music talk, and global voices</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={COLORS.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {loading && !featured.length ? (
            <View style={styles.loadingPanel}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading podcasts...</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>{error}</Text>
            </View>
          ) : null}

          {recentlyPlayed.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader eyebrow="RECENT" title="Recently Played Podcasts" />
              {recentlyPlayed.map((episode) => (
                <PodcastEpisodeCard
                  key={`recent-${episode.id}`}
                  episode={episode}
                  onPress={() => playEpisode(episode)}
                />
              ))}
            </View>
          ) : null}

          {featured.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader eyebrow="FEATURED" title="Featured Podcasts" />
              {featured.map((show) => (
                <PodcastShowCard
                  key={`featured-${show.id}`}
                  show={show}
                  onPress={() =>
                    safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: show.id } })
                  }
                />
              ))}
            </View>
          ) : null}

          {newEpisodes.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader eyebrow="NEW" title="New Episodes" />
              {newEpisodes.map((episode) => (
                <PodcastEpisodeCard
                  key={`new-${episode.id}`}
                  episode={episode}
                  onPress={() => playEpisode(episode)}
                />
              ))}
            </View>
          ) : null}

          {trending.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader eyebrow="TRENDING" title="Trending Podcasts" />
              {trending.map((show) => (
                <PodcastShowCard
                  key={`trending-${show.id}`}
                  show={show}
                  onPress={() =>
                    safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: show.id } })
                  }
                />
              ))}
            </View>
          ) : null}

          {popularShows.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader eyebrow="POPULAR" title="Popular Shows" />
              {popularShows.map((show) => (
                <PodcastShowCard
                  key={`popular-${show.id}`}
                  show={show}
                  onPress={() =>
                    safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: show.id } })
                  }
                />
              ))}
            </View>
          ) : null}

          {recommended.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader eyebrow="FOR YOU" title="Recommended For You" />
              {recommended.map((show) => (
                <PodcastShowCard
                  key={`rec-${show.id}`}
                  show={show}
                  onPress={() =>
                    safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: show.id } })
                  }
                />
              ))}
            </View>
          ) : null}

          {rootSections.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader eyebrow="BROWSE" title="Podcast Rooms" />
              <FlatList
                horizontal
                data={rootSections}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <PodcastCategoryCard
                    category={item}
                    locked={item.matureOnly && !shouldIncludeMaturePodcasts()}
                    onPress={() => {
                      if (item.matureOnly) {
                        openCategory(item.id, true);
                        return;
                      }
                      if (item.children?.length === 1) {
                        openCategory(item.children[0].id);
                        return;
                      }
                      openCategory(item.id);
                    }}
                  />
                )}
              />
            </View>
          ) : null}

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
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 8,
  },
  backButton: { padding: 4, marginTop: 8 },
  headerText: { flex: 1 },
  kicker: { color: COLORS.primaryGlow, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "900", marginTop: 4 },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  content: { paddingHorizontal: 18, paddingBottom: 120, gap: 18 },
  sectionBlock: { gap: 4 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 8,
  },
  sectionEyebrow: { color: COLORS.primaryGlow, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800", marginTop: 2 },
  seeAll: { color: COLORS.primary, fontSize: 12, fontWeight: "700" },
  loadingPanel: { alignItems: "center", paddingVertical: 40, gap: 10 },
  loadingText: { color: COLORS.textMuted },
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
