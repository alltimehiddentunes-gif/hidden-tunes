import { memo, useCallback, type ReactNode } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/theme";
import type { TVChannel } from "@/types/tv";
import { getHorizontalListPerformanceSettings } from "@/utils/performanceMode";

import TvChannelCard from "./TvChannelCard";

type TvChannelRailProps = {
  title: string;
  channels: TVChannel[];
  onPressChannel: (channel: TVChannel) => void;
  countLabel?: string;
  headerAction?: ReactNode;
  showFavorite?: boolean;
  showRemove?: boolean;
  onRemoveChannel?: (channel: TVChannel) => void;
  connectingChannelId?: string | null;
  progressByChannelId?: Record<string, number>;
};

function TvChannelRail({
  title,
  channels,
  onPressChannel,
  countLabel,
  headerAction,
  showFavorite = true,
  showRemove = false,
  onRemoveChannel,
  connectingChannelId = null,
  progressByChannelId,
}: TvChannelRailProps) {
  const listSettings = getHorizontalListPerformanceSettings(channels.length);

  const renderItem = useCallback(
    ({ item }: { item: TVChannel }) => (
      <TvChannelCard
        channel={item}
        onPress={onPressChannel}
        showFavorite={showFavorite}
        showRemove={showRemove}
        onRemove={onRemoveChannel}
        connecting={connectingChannelId === item.id}
        progressRatio={progressByChannelId?.[item.id] ?? null}
      />
    ),
    [
      connectingChannelId,
      onPressChannel,
      onRemoveChannel,
      progressByChannelId,
      showFavorite,
      showRemove,
    ]
  );

  if (!channels.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.count}>
            {countLabel || `${channels.length} channels`}
          </Text>
        </View>
        {headerAction}
      </View>

      <FlatList
        horizontal
        data={channels}
        keyExtractor={(item) => item.id}
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
}

export default memo(TvChannelRail);

const styles = StyleSheet.create({
  section: {
    marginBottom: 22,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },

  headerText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },

  count: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "800",
  },
});
