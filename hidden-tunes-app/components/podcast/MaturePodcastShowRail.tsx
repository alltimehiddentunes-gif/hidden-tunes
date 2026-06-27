import { memo, useCallback } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "../../constants/theme";
import type { HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import { podcastShowSubtitle } from "../../utils/openHiddenTunesPodcast";
import { PodcastShowCard } from "./PodcastDiscoveryCards";

type MaturePodcastShowRailProps = {
  title: string;
  shows: HiddenTunesPodcastShow[];
  onPressShow: (show: HiddenTunesPodcastShow) => void;
  onPressSeeAll?: () => void;
};

export const MaturePodcastShowRail = memo(function MaturePodcastShowRail({
  title,
  shows,
  onPressShow,
  onPressSeeAll,
}: MaturePodcastShowRailProps) {
  const renderItem = useCallback(
    ({ item }: { item: HiddenTunesPodcastShow }) => (
      <View style={styles.cardWrap}>
        <PodcastShowCard
          show={item}
          subtitle={podcastShowSubtitle(item)}
          onPress={() => onPressShow(item)}
          showExplicitBadge
        />
      </View>
    ),
    [onPressShow]
  );

  if (!shows.length) return null;

  return (
    <View style={styles.rail}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onPressSeeAll ? (
          <TouchableOpacity activeOpacity={0.85} onPress={onPressSeeAll}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={shows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
});

const styles = StyleSheet.create({
  rail: {
    marginBottom: 22,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingRight: 4,
  },
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
  },
  seeAll: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  listContent: {
    gap: 10,
  },
  cardWrap: {
    width: 280,
  },
});
