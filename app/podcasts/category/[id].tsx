import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { PodcastCategoryCard, PodcastShowCard } from "../../../components/podcast/PodcastCards";
import PodcastEmptyCategoryState from "../../../components/podcast/PodcastEmptyCategoryState";
import PodcastScreenHeader from "../../../components/podcast/PodcastScreenHeader";
import PodcastSearchBar from "../../../components/podcast/PodcastSearchBar";
import PodcastSearchResults from "../../../components/podcast/PodcastSearchResults";
import {
  getPodcastCategory,
  PODCAST_ROOT_SECTIONS,
  resolvePodcastCategoryId,
  type PodcastCategoryDef,
} from "../../../constants/podcastCategories";
import { COLORS } from "../../../constants/theme";
import {
  getNonEmptyPodcastChildCategories,
  getPodcastShowsByCategory,
} from "../../../services/podcastService";
import {
  shouldIncludeMaturePodcasts,
  subscribeMaturePodcastSettings,
} from "../../../utils/maturePodcastSettings";
import { safeRouterPush } from "../../../utils/safeNavigation";
import { usePodcastLocalSearch } from "../../../hooks/usePodcastLocalSearch";

export default function PodcastCategoryScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const categoryId = resolvePodcastCategoryId(String(params.id || ""));
  const category = useMemo(() => getPodcastCategory(categoryId), [categoryId]);
  const parentSection = useMemo(
    () => PODCAST_ROOT_SECTIONS.find((section) => section.id === categoryId),
    [categoryId]
  );
  const [matureEnabled, setMatureEnabled] = useState(shouldIncludeMaturePodcasts());
  const matureOnly = Boolean(category?.matureOnly || parentSection?.matureOnly);
  const searchCategoryIds = useMemo(() => {
    if (parentSection?.children?.length) {
      return getNonEmptyPodcastChildCategories(parentSection.id, matureEnabled).map(
        (child) => child.id
      );
    }
    return [categoryId];
  }, [categoryId, matureEnabled, parentSection]);
  const { query, setQuery, results, hasQuery } = usePodcastLocalSearch({
    matureOnly,
    categoryIds: searchCategoryIds,
  });

  useEffect(() => {
    const unsubscribe = subscribeMaturePodcastSettings(() => {
      setMatureEnabled(shouldIncludeMaturePodcasts());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const nonEmptyChildren = useMemo(() => {
    if (!parentSection) return [];
    return getNonEmptyPodcastChildCategories(parentSection.id, matureEnabled);
  }, [matureEnabled, parentSection]);

  const shows = useMemo(() => {
    if (parentSection?.children?.length) {
      return nonEmptyChildren.flatMap((child) =>
        getPodcastShowsByCategory(child.id, matureEnabled)
      );
    }
    return getPodcastShowsByCategory(categoryId, matureEnabled);
  }, [categoryId, matureEnabled, nonEmptyChildren, parentSection]);

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
  const isEmpty = shows.length === 0;
  const listData = hasQuery ? [] : shows;
  const renderShow = useCallback(
    ({ item }: { item: (typeof shows)[number] }) => (
      <PodcastShowCard show={item} onPress={() => openShow(item.id)} />
    ),
    [openShow]
  );
  const renderHeader = useCallback(
    () => (
      <>
        <PodcastSearchResults results={results} hasQuery={hasQuery} onOpenShow={openShow} />

        {!hasQuery && parentSection && nonEmptyChildren.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Browse</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {nonEmptyChildren.map((child: PodcastCategoryDef) => (
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

        {!hasQuery && shows.length > 0 ? (
          <View style={styles.sectionTitleWrap}>
            <Text style={styles.sectionTitle}>Shows</Text>
          </View>
        ) : null}
      </>
    ),
    [hasQuery, nonEmptyChildren, openShow, parentSection, results, shows.length]
  );
  const renderEmpty = useCallback(
    () =>
      !hasQuery && isEmpty ? (
        <PodcastEmptyCategoryState onBrowseAll={() => router.replace("/podcasts" as any)} />
      ) : null,
    [hasQuery, isEmpty]
  );

  return (
    <LinearGradient colors={["#030008", "#090214", "#000000"]} style={styles.screen}>
      <PodcastScreenHeader title={title} subtitle={description} kicker="PODCASTS">
        <PodcastSearchBar value={query} onChangeText={setQuery} />
      </PodcastScreenHeader>

      <FlatList
        data={listData}
        renderItem={renderShow}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 120, gap: 20 },
  section: { gap: 8 },
  sectionTitleWrap: { marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  fallbackText: { color: COLORS.textMuted },
});
