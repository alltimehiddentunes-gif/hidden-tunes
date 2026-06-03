import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import AppShell from "../components/navigation/AppShell";
import TvVideoCard from "../components/tv/TvVideoCard";
import { COLORS, GRADIENTS } from "@/constants/theme";
import {
  buildTvPlayerQueue,
  fetchTvCatalog,
  fetchTvHomeLanes,
  loadTvHomeCache,
  TV_LANE_PAGE_LIMIT,
  type HiddenTunesTvVideo,
} from "@/services/tvCatalogApi";

type TvLane = {
  id: string;
  title: string;
  videos: HiddenTunesTvVideo[];
};

function displayLaneTitle(title: string) {
  if (title === "Documentary Nights") return "Documentary";
  if (title === "Live Performances") return "Live Performance";
  return title;
}

function getVideoId(video: HiddenTunesTvVideo) {
  return video.source_id || video.id || "";
}

export default function YouTubeFeedScreen() {
  const [lanes, setLanes] = useState<TvLane[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<HiddenTunesTvVideo[]>([]);
  const { width } = useWindowDimensions();
  const railCardWidth = Math.min(260, Math.max(178, width * 0.58));
  const featuredWidth = Math.max(300, width - 36);

  const featuredLane = lanes.find((lane) => lane.id === "featured");
  const recentlyAddedLane = lanes.find((lane) => lane.id === "recent");
  const channelLanes = lanes.filter((lane) => !["featured", "recent"].includes(lane.id));
  const featuredVideo = featuredLane?.videos[0];
  const hasSearchText = query.trim().length > 0;

  const loadTv = useCallback(async () => {
    setLoading(true);
    try {
      const cached = await loadTvHomeCache();
      if (cached?.lanes?.length) setLanes(cached.lanes);
      const data = await fetchTvHomeLanes();
      if (data.lanes.length) setLanes(data.lanes);
    } catch {
      setLanes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTv();
  }, [loadTv]);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const response = await fetchTvCatalog({ q: clean, page: 1, limit: TV_LANE_PAGE_LIMIT * 2 });
      if (!cancelled) {
        setSearchResults(response.success ? response.videos : []);
        setSearching(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const openVideo = useCallback((video: HiddenTunesTvVideo, queueVideos?: HiddenTunesTvVideo[]) => {
    const videoId = getVideoId(video);
    if (!videoId) return;

    const queue = buildTvPlayerQueue(queueVideos?.length ? queueVideos : [video]);
    const startIndex = Math.max(0, queue.findIndex((item) => item.videoId === videoId));

    router.push({
      pathname: "/youtube-player",
      params: {
        videoId,
        title: video.title || "Hidden Tunes TV",
        thumbnail: video.thumbnail_url || "",
        channelTitle: video.channel_name || "Hidden Tunes TV",
        queue: JSON.stringify(queue),
        startIndex: String(startIndex),
      },
    });
  }, []);

  const renderLane = useCallback((lane: TvLane) => {
    if (!lane.videos.length) return null;
    return (
      <View key={lane.id} style={styles.laneSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{displayLaneTitle(lane.title)}</Text>
          <Text style={styles.sectionMeta}>{lane.videos.length} ready</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent}>
          {lane.videos.map((video) => (
            <TvVideoCard key={video.id} video={video} width={railCardWidth} onPress={(item) => openVideo(item, lane.videos)} />
          ))}
        </ScrollView>
      </View>
    );
  }, [openVideo, railCardWidth]);

  const searchLane = useMemo<TvLane>(() => ({ id: "search", title: "Search Results", videos: searchResults }), [searchResults]);

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View style={styles.glowPurple} />
        <View style={styles.glowCyan} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="tv" size={23} color={COLORS.primaryGlow} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>CURATED</Text>
              <Text style={styles.title}>Hidden Tunes TV</Text>
            </View>
          </View>

          <View style={styles.searchShell}>
            <Ionicons name="search" size={18} color={COLORS.cyan} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search TV"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {query.length > 0 ? (
              <TouchableOpacity activeOpacity={0.8} hitSlop={8} onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading TV</Text>
            </View>
          ) : hasSearchText ? (
            <View style={styles.searchResultsWrap}>
              {searching ? (
                <View style={styles.centerBlock}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingText}>Searching</Text>
                </View>
              ) : searchResults.length > 0 ? (
                renderLane(searchLane)
              ) : query.trim().length >= 2 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="search" size={42} color={COLORS.textMuted} />
                  <Text style={styles.emptyTitle}>No TV matches</Text>
                </View>
              ) : null}
            </View>
          ) : lanes.some((lane) => lane.videos.length > 0) ? (
            <>
              {featuredVideo ? (
                <View style={styles.featuredSection}>
                  <Text style={styles.sectionEyebrow}>FEATURED NOW</Text>
                  <TvVideoCard video={featuredVideo} width={featuredWidth} onPress={(item) => openVideo(item, featuredLane?.videos)} />
                </View>
              ) : null}
              {recentlyAddedLane ? renderLane(recentlyAddedLane) : null}
              {channelLanes.map(renderLane)}
            </>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="tv" size={58} color={COLORS.primary} />
              <Text style={styles.emptyTitle}>No TV videos right now</Text>
              <Text style={styles.emptyText}>Hidden Tunes TV metadata will appear here when the backend returns videos.</Text>
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 52, paddingHorizontal: 18 },
  glowPurple: { position: "absolute", top: -50, left: -90, width: 210, height: 210, borderRadius: 105, backgroundColor: "rgba(168,85,247,0.12)" },
  glowCyan: { position: "absolute", top: 210, right: -120, width: 240, height: 240, borderRadius: 120, backgroundColor: "rgba(34,211,238,0.07)" },
  scrollContent: { paddingBottom: 150 },
  header: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 16 },
  headerIcon: { width: 44, height: 44, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(168,85,247,0.13)", borderWidth: 1, borderColor: "rgba(168,85,247,0.24)" },
  headerCopy: { flex: 1 },
  kicker: { color: COLORS.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 1.8 },
  title: { color: COLORS.text, fontSize: 27, fontWeight: "900", marginTop: 3 },
  searchShell: { minHeight: 50, borderRadius: 23, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "rgba(12,5,24,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", marginBottom: 18 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "700", paddingVertical: 0 },
  centerBlock: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: COLORS.textMuted, fontSize: 12, fontWeight: "800" },
  featuredSection: { marginBottom: 24 },
  sectionEyebrow: { color: COLORS.primaryGlow, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 10 },
  laneSection: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: "900" },
  sectionMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: "800" },
  railContent: { paddingRight: 18 },
  searchResultsWrap: { minHeight: 180 },
  emptyBox: { minHeight: 240, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  emptyTitle: { color: COLORS.text, fontSize: 20, fontWeight: "900", marginTop: 14, textAlign: "center" },
  emptyText: { color: COLORS.textMuted, textAlign: "center", fontSize: 13, lineHeight: 19, marginTop: 8 },
});
