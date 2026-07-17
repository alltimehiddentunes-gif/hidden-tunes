import { memo, useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import TvVideoCard from "@/components/tv/TvVideoCard";
import { COLORS } from "@/constants/theme";
import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import { getHorizontalListPerformanceSettings } from "@/utils/performanceMode";

type VideoLane = {
  id: string;
  title: string;
  videos: HiddenTunesTvVideo[];
};

type VideoDiscoverySectionProps = {
  lanes: VideoLane[];
  openingStationId?: string | null;
  onPressVideo: (video: HiddenTunesTvVideo, queue: HiddenTunesTvVideo[]) => void;
};

type VideoLaneRowProps = {
  lane: VideoLane;
  openingStationId?: string | null;
  onPressVideo: (video: HiddenTunesTvVideo, queue: HiddenTunesTvVideo[]) => void;
};

const VideoLaneRow = memo(function VideoLaneRow({
  lane,
  openingStationId,
  onPressVideo,
}: VideoLaneRowProps) {
  const listSettings = getHorizontalListPerformanceSettings(lane.videos.length);

  const renderItem = useCallback(
    ({ item }: { item: HiddenTunesTvVideo }) => (
      <TvVideoCard
        video={item}
        loading={openingStationId === item.id}
        disabled={openingStationId === item.id}
        onPress={(video) => onPressVideo(video, lane.videos)}
      />
    ),
    [lane.videos, onPressVideo, openingStationId]
  );

  if (!lane.videos.length) return null;

  return (
    <View style={styles.laneSection}>
      <View style={styles.laneHeader}>
        <Text style={styles.laneTitle}>{lane.title}</Text>
        <Text style={styles.laneCount}>{lane.videos.length} stations</Text>
      </View>

      <FlatList
        horizontal
        data={lane.videos}
        keyExtractor={(item) => `${lane.id}-${item.id}`}
        showsHorizontalScrollIndicator={false}
        renderItem={renderItem}
        initialNumToRender={listSettings.initialNumToRender}
        maxToRenderPerBatch={listSettings.maxToRenderPerBatch}
        windowSize={listSettings.windowSize}
        updateCellsBatchingPeriod={listSettings.updateCellsBatchingPeriod}
        removeClippedSubviews={listSettings.removeClippedSubviews}
      />
    </View>
  );
});

function VideoDiscoverySection({
  lanes,
  openingStationId,
  onPressVideo,
}: VideoDiscoverySectionProps) {
  const hasVideos = lanes.some((lane) => lane.videos.length > 0);
  if (!hasVideos) return null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name="play-circle" size={18} color={COLORS.cyan} />
        </View>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>TV Stations</Text>
          <Text style={styles.sectionSub}>
            Backend-verified stations. Stream URLs load only when you tap a
            channel.
          </Text>
        </View>
      </View>

      {lanes.map((lane) => (
        <VideoLaneRow
          key={lane.id}
          lane={lane}
          openingStationId={openingStationId}
          onPressVideo={onPressVideo}
        />
      ))}
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
