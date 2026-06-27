import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { MaturePodcastShowRail } from "../../components/podcast/MaturePodcastShowRail";
import { PodcastCategoryCard } from "../../components/podcast/PodcastDiscoveryCards";
import { COLORS } from "../../constants/theme";
import {
  getMatureDiscoveryRails,
  getVisibleMatureCategories,
  type MatureDiscoveryRail,
  type MaturePodcastCategoryWithCount,
} from "../../services/podcastService";
import type { HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import {
  isMaturePodcastsEnabled,
  setMaturePodcastsEnabled,
} from "../../services/maturePodcastPreferences";
import { useMountedRef } from "../../utils/useMountedRef";
import {
  openMaturePodcastCategory,
  openPodcastShow,
} from "../../utils/podcastNavigation";

export default function MaturePodcastsScreen() {
  const mountedRef = useMountedRef();
  const [matureEnabled, setMatureEnabled] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<MaturePodcastCategoryWithCount[]>(
    []
  );
  const [rails, setRails] = useState<MatureDiscoveryRail[]>([]);

  const refreshCatalog = useCallback((enabled: boolean) => {
    setCategories(getVisibleMatureCategories(enabled));
    setRails(getMatureDiscoveryRails(enabled));
  }, []);

  useEffect(() => {
    void isMaturePodcastsEnabled()
      .then((enabled) => {
        if (!mountedRef.current) return;
        setMatureEnabled(enabled);
        refreshCatalog(enabled);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoadError("Podcasts could not be loaded right now.");
      })
      .finally(() => {
        if (!mountedRef.current) return;
        setLoadingPrefs(false);
      });
  }, [mountedRef, refreshCatalog]);

  const handleToggle = useCallback(async (next: boolean) => {
    setMatureEnabled(next);
    await setMaturePodcastsEnabled(next);
    refreshCatalog(next);
  }, [refreshCatalog]);

  const openCategory = useCallback((categoryId: string) => {
    openMaturePodcastCategory(categoryId);
  }, []);

  const openShow = useCallback((show: HiddenTunesPodcastShow) => {
    openPodcastShow(show);
  }, []);

  const headerSubtitle = useMemo(() => {
    if (!matureEnabled) {
      return "Enable 18+ to browse explicit podcast rooms.";
    }

    if (!categories.length) {
      return "Mature rooms are syncing. Check back soon.";
    }

    return "Explicit shows for adult listeners — local discovery, no feed loading here.";
  }, [categories.length, matureEnabled]);

  const browseCategories = useMemo(
    () => categories.filter((category) => category.id !== "all-mature"),
    [categories]
  );

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
          <Text style={styles.title}>Mature Podcasts</Text>
          <Text style={styles.subtitle}>{headerSubtitle}</Text>
        </View>
      </View>

      <View style={styles.gateCard}>
        <View style={styles.gateCopy}>
          <Text style={styles.gateTitle}>Mature Podcasts 18+</Text>
          <Text style={styles.gateText}>
            Explicit relationship, comedy, and education shows for adult listeners.
          </Text>
        </View>
        <Switch
          value={matureEnabled}
          onValueChange={(value) => void handleToggle(value)}
          trackColor={{ false: "#3A3A44", true: COLORS.primary }}
          thumbColor="#fff"
          accessibilityLabel="Enable mature podcasts"
        />
      </View>

      {loadingPrefs ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>{loadError}</Text>
          <Text style={styles.emptyText}>Try again.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoadingPrefs(true);
              setLoadError(null);
              void isMaturePodcastsEnabled()
                .then((enabled) => {
                  if (!mountedRef.current) return;
                  setMatureEnabled(enabled);
                  refreshCatalog(enabled);
                })
                .catch(() => {
                  if (!mountedRef.current) return;
                  setLoadError("Podcasts could not be loaded right now.");
                })
                .finally(() => {
                  if (!mountedRef.current) return;
                  setLoadingPrefs(false);
                });
            }}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !matureEnabled ? (
        <View style={styles.center}>
          <Ionicons name="eye-off-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Mature podcasts are hidden</Text>
          <Text style={styles.emptyText}>
            Turn on Mature Podcasts 18+ to browse explicit categories and search results.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {rails.map((rail) => (
            <MaturePodcastShowRail
              key={rail.id}
              title={rail.title}
              shows={rail.shows}
              onPressShow={openShow}
              onPressSeeAll={
                rail.categoryId
                  ? () => openCategory(rail.categoryId!)
                  : undefined
              }
            />
          ))}

          {browseCategories.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Browse by category</Text>
              <View style={styles.grid}>
                {browseCategories.map((category) => (
                  <PodcastCategoryCard
                    key={category.id}
                    category={category}
                    showCount={category.showCount}
                    onPress={() => openCategory(category.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
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
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  gateCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  gateCopy: { flex: 1, gap: 4 },
  gateTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  gateText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    paddingTop: 4,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
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
