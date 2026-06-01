import { memo, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import WorldHeader from "../components/worlds/WorldHeader";
import WorldTrackRow from "../components/worlds/WorldTrackRow";
import { COLORS, GRADIENTS } from "../constants/theme";
import { searchTracks } from "../search/searchTracks";
import { useWorldCatalogTracks } from "../state/useWorldCatalogTracks";
import type { Track } from "../types/music";
import {
  createStableKeyExtractor,
  getNestedSongListLayout,
  LIST_ITEM_HEIGHTS,
} from "../utils/performanceMode";
import { getWorldUiMeta } from "../utils/worldPresentation";

const TRACK_ROW_HEIGHT = LIST_ITEM_HEIGHTS.searchResultRow;
const trackKeyExtractor = createStableKeyExtractor("world-track");
const getTrackItemLayout = getNestedSongListLayout(TRACK_ROW_HEIGHT);

function WorldDetailScreen() {
  const params = useLocalSearchParams<{ worldId?: string | string[] }>();
  const worldId = Array.isArray(params.worldId)
    ? params.worldId[0]
    : params.worldId;

  const world = useMemo(() => getWorldUiMeta(worldId), [worldId]);
  const { tracks: catalogTracks, loading } = useWorldCatalogTracks();

  const alignedTracks = useMemo(() => {
    if (!world?.searchQuery || !catalogTracks.length) {
      return [] as Track[];
    }

    return searchTracks(catalogTracks, world.searchQuery).slice(0, 60);
  }, [catalogTracks, world?.searchQuery]);

  const renderTrack = useCallback(
    ({ item, index }: { item: Track; index: number }) => (
      <WorldTrackRow track={item} index={index} />
    ),
    []
  );

  if (!world) {
    return (
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.errorText}>This emotional world could not be found.</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>{world.title}</Text>
        </View>

        <FlatList
          data={alignedTracks}
          keyExtractor={trackKeyExtractor}
          renderItem={renderTrack}
          getItemLayout={getTrackItemLayout}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <WorldHeader worldId={world.id} />
              <Text style={styles.sectionTitle}>Curated emotional tracks</Text>
              <Text style={styles.sectionSubtitle}>
                Ranked for this world using existing search scoring — playback not
                wired in this phase.
              </Text>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.emptyText}>Loading world-aligned tracks…</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  No aligned tracks yet. Try again after the catalog finishes loading.
                </Text>
              </View>
            )
          }
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

export default memo(WorldDetailScreen);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  screenTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  headerBlock: {
    paddingBottom: 8,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 12,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "600",
  },
  errorText: {
    color: COLORS.textMuted,
    fontSize: 14,
    paddingHorizontal: 18,
    paddingTop: 24,
    fontWeight: "700",
  },
});
