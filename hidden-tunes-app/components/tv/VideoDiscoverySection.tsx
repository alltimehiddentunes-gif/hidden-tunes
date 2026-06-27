import { memo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import TvVideoCard from "@/components/tv/TvVideoCard";
import { COLORS } from "@/constants/theme";
import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";

type VideoLane = {
  id: string;
  title: string;
  videos: HiddenTunesTvVideo[];
};

type VideoDiscoverySectionProps = {
  lanes: VideoLane[];
  onPressVideo: (video: HiddenTunesTvVideo, queue: HiddenTunesTvVideo[]) => void;
};

function renderLane(
  lane: VideoLane,
  onPressVideo: (video: HiddenTunesTvVideo, queue: HiddenTunesTvVideo[]) => void
) {
  if (!lane.videos.length) return null;

  return (
    <View key={lane.id} style={styles.laneSection}>
      <View style={styles.laneHeader}>
        <Text style={styles.laneTitle}>{lane.title}</Text>
        <Text style={styles.laneCount}>{lane.videos.length} videos</Text>
      </View>

      <FlatList
        horizontal
        data={lane.videos}
        keyExtractor={(item) => `${lane.id}-${item.id}`}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <TvVideoCard
            video={item}
            onPress={(video) => onPressVideo(video, lane.videos)}
          />
        )}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
}

function VideoDiscoverySection({ lanes, onPressVideo }: VideoDiscoverySectionProps) {
  const hasVideos = lanes.some((lane) => lane.videos.length > 0);
  if (!hasVideos) return null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name="play-circle" size={18} color={COLORS.cyan} />
        </View>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>Video Discovery</Text>
          <Text style={styles.sectionSub}>
            Music videos, interviews, live performances, concerts, and
            documentaries from the Hidden Tunes catalog.
          </Text>
        </View>
      </View>

      {lanes.map((lane) => renderLane(lane, onPressVideo))}
    </View>
  );
}

export default memo(VideoDiscoverySection);

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },

  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  sectionCopy: {
    flex: 1,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },

  sectionSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 4,
  },

  laneSection: {
    marginBottom: 22,
  },

  laneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  laneTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },

  laneCount: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "800",
  },
});
