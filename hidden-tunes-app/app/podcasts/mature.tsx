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

import { PodcastCategoryCard } from "../../components/podcast/PodcastDiscoveryCards";
import { COLORS } from "../../constants/theme";
import {
  getVisibleMatureCategories,
  type MaturePodcastCategoryWithCount,
} from "../../services/podcastService";
import {
  isMaturePodcastsEnabled,
  setMaturePodcastsEnabled,
} from "../../services/maturePodcastPreferences";

export default function MaturePodcastsScreen() {
  const [matureEnabled, setMatureEnabled] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [categories, setCategories] = useState<MaturePodcastCategoryWithCount[]>(
    []
  );

  const refreshCategories = useCallback(async (enabled: boolean) => {
    setCategories(getVisibleMatureCategories(enabled));
  }, []);

  useEffect(() => {
    void isMaturePodcastsEnabled().then((enabled) => {
      setMatureEnabled(enabled);
      refreshCategories(enabled);
      setLoadingPrefs(false);
    });
  }, [refreshCategories]);

  const handleToggle = useCallback(async (next: boolean) => {
    setMatureEnabled(next);
    await setMaturePodcastsEnabled(next);
    refreshCategories(next);
  }, [refreshCategories]);

  const openCategory = useCallback((categoryId: string) => {
    router.push({
      pathname: "/podcasts/category/[id]",
      params: { id: categoryId },
    } as any);
  }, []);

  const headerSubtitle = useMemo(() => {
    if (!matureEnabled) {
      return "Enable 18+ to browse explicit Hidden Tunes podcast rooms.";
    }

    if (!categories.length) {
      return "Mature rooms are syncing. Check back soon.";
    }

    return "Explicit Hidden Tunes shows for adult listeners.";
  }, [categories.length, matureEnabled]);

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
          <View style={styles.grid}>
            {categories.map((category) => (
              <PodcastCategoryCard
                key={category.id}
                category={category}
                showCount={category.showCount}
                onPress={() => openCategory(category.id)}
              />
            ))}
          </View>
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
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 8,
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
});
