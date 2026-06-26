import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { PodcastCategoryCard, PodcastShowCard } from "../../../components/podcast/PodcastCards";
import {
  getPodcastCategory,
  PODCAST_ROOT_SECTIONS,
  resolvePodcastCategoryId,
  type PodcastCategoryDef,
} from "../../../constants/podcastCategories";
import { COLORS } from "../../../constants/theme";
import { getPodcastShowsByCategory } from "../../../services/podcastService";
import {
  shouldIncludeMaturePodcasts,
  subscribeMaturePodcastSettings,
} from "../../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../../utils/safeNavigation";

export default function PodcastCategoryScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const categoryId = resolvePodcastCategoryId(String(params.id || ""));
  const category = useMemo(() => getPodcastCategory(categoryId), [categoryId]);
  const parentSection = useMemo(
    () => PODCAST_ROOT_SECTIONS.find((section) => section.id === categoryId),
    [categoryId]
  );
  const [matureEnabled, setMatureEnabled] = useState(shouldIncludeMaturePodcasts());

  useEffect(() => {
    const unsubscribe = subscribeMaturePodcastSettings(() => {
      setMatureEnabled(shouldIncludeMaturePodcasts());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const shows = useMemo(() => {
    const childIds =
      parentSection?.children?.map((child) => child.id) ||
      (category && !parentSection ? [category.id] : []);
    const ids = childIds.length ? childIds : [categoryId];
    return ids.flatMap((id) => getPodcastShowsByCategory(id, matureEnabled));
  }, [category, categoryId, parentSection, matureEnabled]);

  useEffect(() => {
    if (category?.matureOnly && !shouldIncludeMaturePodcasts()) {
      router.replace("/podcasts/mature" as any);
    }
  }, [category]);

  const openShow = useCallback((showId: string) => {
    safeRouterPush({ pathname: "/podcasts/show/[id]", params: { id: showId } });
  }, []);

  if (!category && !parentSection) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Category not found</Text>
      </View>
    );
  }

  const title = parentSection?.title || category?.title || "Podcasts";
  const description = parentSection?.description || category?.description || "";

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>PODCASTS</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{description}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.hintText}>Open a show to load episodes</Text>

        {parentSection?.children?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Browse</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {parentSection.children.map((child: PodcastCategoryDef) => (
                <PodcastCategoryCard
                  key={child.id}
                  category={child}
                  onPress={() =>
                    safeRouterPush({
                      pathname: "/podcasts/category/[id]",
                      params: { id: child.id },
                    })
                  }
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {shows.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Shows</Text>
            {shows.map((show) => (
              <PodcastShowCard key={show.id} show={show} onPress={() => openShow(show.id)} />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No shows in this room yet.</Text>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", padding: 18, gap: 8 },
  backButton: { padding: 4 },
  headerText: { flex: 1 },
  kicker: { color: COLORS.primaryGlow, fontSize: 10, fontWeight: "800" },
  title: { color: COLORS.text, fontSize: 24, fontWeight: "900" },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  content: { paddingHorizontal: 18, paddingBottom: 120, gap: 20 },
  hintText: { color: COLORS.textSoft, fontSize: 13, textAlign: "center" },
  section: { gap: 8 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  emptyText: { color: COLORS.textMuted, textAlign: "center", paddingVertical: 24 },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  fallbackText: { color: COLORS.textMuted },
});
