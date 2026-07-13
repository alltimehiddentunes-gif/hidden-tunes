import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import HTImage from "@/components/HTImage";
import { PremiumContentGrid } from "@/components/catalog/PremiumContentGrid";
import AppShell from "@/components/navigation/AppShell";
import { MOTIVATION_DEFAULT_CATEGORY_SLUG } from "@/constants/motivationCatalog";
import { COLORS, GRADIENTS } from "@/constants/theme";
import { useMountedRef } from "@/hooks/useMountedRef";
import {
  fetchMotivationCategories,
  fetchMotivationHome,
  formatMotivationDuration,
  MOTIVATION_DEFAULT_PAGE_LIMIT,
} from "@/services/motivationCatalogApi";
import { listContinueMotivationEntries } from "@/services/motivationProgress";
import { listMotivationRecentlyPlayed } from "@/services/motivationRecentlyPlayed";
import type { MotivationCategory, MotivationItem, MotivationProgram } from "@/types/motivation";
import { createStableKeyExtractor } from "@/utils/performanceMode";

const SectionTitle = memo(function SectionTitle({
  title,
  onSeeAll,
}: {
  title: string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onSeeAll ? (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.85}>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const ItemCard = memo(function ItemCard({
  item,
  onPress,
}: {
  item: MotivationItem;
  onPress: () => void;
}) {
  const meta = [item.speaker_name || item.channel_name, formatMotivationDuration(item.duration_seconds)]
    .filter(Boolean)
    .join(" · ");

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={onPress}>
      <HTImage uri={item.artwork || undefined} style={styles.cardArt} contentFit="cover" />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title}
      </Text>
      {meta ? (
        <Text style={styles.cardMeta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

const ProgramCard = memo(function ProgramCard({
  program,
  onPress,
}: {
  program: MotivationProgram;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={onPress}>
      <HTImage uri={program.artwork_url || undefined} style={styles.cardArt} contentFit="cover" />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {program.title}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {program.session_count ? `${program.session_count} sessions` : "Program"}
      </Text>
    </TouchableOpacity>
  );
});

const ListRow = memo(function ListRow({
  title,
  subtitle,
  artwork,
  onPress,
}: {
  title: string;
  subtitle?: string;
  artwork?: string | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.listRow} activeOpacity={0.88} onPress={onPress}>
      <HTImage uri={artwork || undefined} style={styles.listArt} contentFit="cover" />
      <View style={styles.listCopy}>
        <Text style={styles.listTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.listMeta} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="play-circle-outline" size={24} color={COLORS.primary} />
    </TouchableOpacity>
  );
});

export default function MotivationHomeScreen() {
  const mountedRef = useMountedRef();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<MotivationCategory[]>([]);
  const [featuredPrograms, setFeaturedPrograms] = useState<MotivationProgram[]>([]);
  const [featuredItems, setFeaturedItems] = useState<MotivationItem[]>([]);
  const [recommended, setRecommended] = useState<MotivationItem[]>([]);
  const [continueItems, setContinueItems] = useState<
    Awaited<ReturnType<typeof listContinueMotivationEntries>>
  >([]);
  const [recentItems, setRecentItems] = useState<
    Awaited<ReturnType<typeof listMotivationRecentlyPlayed>>
  >([]);

  const loadHome = useCallback(async () => {
    const controller = new AbortController();
    try {
      const [home, categoryRows, continueRows, recentRows] = await Promise.all([
        fetchMotivationHome(controller.signal),
        fetchMotivationCategories(controller.signal),
        listContinueMotivationEntries(10),
        listMotivationRecentlyPlayed(10),
      ]);
      if (!mountedRef.current) return;
      setCategories(categoryRows);
      setFeaturedPrograms(home.featured_programs || []);
      setFeaturedItems(home.featured_items || []);
      setRecommended(home.recommended || []);
      setContinueItems(continueRows);
      setRecentItems(recentRows);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    return () => controller.abort();
  }, [mountedRef]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  const openCategory = useCallback((slug: string) => {
    router.push(`/motivation/category/${slug}` as never);
  }, []);

  const openProgram = useCallback((programId: string) => {
    router.push(`/motivation/program/${programId}` as never);
  }, []);

  const openItem = useCallback((itemId: string) => {
    router.push(`/motivation/program/${itemId}` as never);
  }, []);

  const sections = useMemo(
    () => [
      { key: "continue", title: "Continue Listening" },
      { key: "recent", title: "Recently Played" },
      { key: "programs", title: "Featured Programs" },
      { key: "featured", title: "Featured" },
      { key: "recommended", title: "Recommended" },
      { key: "categories", title: "Categories" },
    ],
    []
  );

  const renderSection = useCallback(
    (key: string) => {
      if (key === "continue") {
        if (!continueItems.length) return null;
        return (
          <View style={styles.section}>
            <SectionTitle title="Continue Listening" />
            {continueItems.map((entry) => (
              <ListRow
                key={entry.itemId}
                title={entry.itemTitle || entry.programTitle || "Motivation"}
                subtitle={entry.programTitle || undefined}
                artwork={entry.programArtwork}
                onPress={() => openItem(entry.itemId)}
              />
            ))}
          </View>
        );
      }

      if (key === "recent") {
        if (!recentItems.length) return null;
        return (
          <View style={styles.section}>
            <SectionTitle title="Recently Played" />
            {recentItems.map((entry) => (
              <ListRow
                key={entry.item.id}
                title={entry.item.title}
                subtitle={entry.item.speaker_name || entry.item.channel_name || undefined}
                artwork={entry.item.artwork}
                onPress={() => openItem(entry.item.id)}
              />
            ))}
          </View>
        );
      }

      if (key === "programs") {
        if (!featuredPrograms.length) return null;
        return (
          <View style={styles.section}>
            <SectionTitle title="Featured Programs" />
            <PremiumContentGrid
              data={featuredPrograms}
              keyExtractor={(item) => item.id}
              renderItem={({ item }: { item: MotivationProgram }) => (
                <ProgramCard program={item} onPress={() => openProgram(item.id)} />
              )}
            />
          </View>
        );
      }

      if (key === "featured") {
        if (!featuredItems.length) return null;
        return (
          <View style={styles.section}>
            <SectionTitle title="Featured" />
            <PremiumContentGrid
              data={featuredItems}
              keyExtractor={(item) => item.id}
              renderItem={({ item }: { item: MotivationItem }) => (
                <ItemCard item={item} onPress={() => openItem(item.id)} />
              )}
            />
          </View>
        );
      }

      if (key === "recommended") {
        if (!recommended.length) return null;
        return (
          <View style={styles.section}>
            <SectionTitle
              title="Recommended"
              onSeeAll={() => openCategory(MOTIVATION_DEFAULT_CATEGORY_SLUG)}
            />
            <PremiumContentGrid
              data={recommended}
              keyExtractor={(item) => item.id}
              renderItem={({ item }: { item: MotivationItem }) => (
                <ItemCard item={item} onPress={() => openItem(item.id)} />
              )}
            />
          </View>
        );
      }

      return (
        <View style={styles.section}>
          <SectionTitle title="Categories" />
          <PremiumContentGrid
            data={categories}
            keyExtractor={(item) => item.slug}
            renderItem={({ item }: { item: MotivationCategory }) => (
              <TouchableOpacity
                style={styles.categoryCard}
                activeOpacity={0.88}
                onPress={() => openCategory(item.slug)}
              >
                <Text style={styles.categoryTitle}>{item.name}</Text>
                <Text style={styles.categoryMeta}>
                  {item.item_count ? `${item.item_count} items` : "Browse"}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      );
    },
    [
      categories,
      continueItems,
      featuredItems,
      featuredPrograms,
      openCategory,
      openItem,
      openProgram,
      recentItems,
      recommended,
    ]
  );

  if (loading) {
    return (
      <AppShell>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.screen}>
        <FlatList
          data={sections}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => renderSection(item.key)}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadHome();
              }}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.hero}>
              <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={22} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.heroEyebrow}>Hidden Tunes</Text>
              <Text style={styles.heroTitle}>Motivationals</Text>
              <Text style={styles.heroSubtitle}>
                Speeches, affirmations, and guided motivation — metadata first, playback on tap.
              </Text>
            </View>
          }
        />
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: 120, paddingHorizontal: 16 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { paddingTop: 56, paddingBottom: 18 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  heroEyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  heroTitle: { color: COLORS.text, fontSize: 32, fontWeight: "900", marginTop: 8 },
  heroSubtitle: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  section: { marginTop: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: "900" },
  seeAll: { color: COLORS.primary, fontSize: 13, fontWeight: "800" },
  card: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardArt: { width: "100%", aspectRatio: 1, borderRadius: 14, marginBottom: 10 },
  cardTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  cardMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  categoryCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
  },
  categoryTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  categoryMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 6 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  listArt: { width: 54, height: 54, borderRadius: 14 },
  listCopy: { flex: 1 },
  listTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  listMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
});

export const motivationHomeKeyExtractor = createStableKeyExtractor("id");
