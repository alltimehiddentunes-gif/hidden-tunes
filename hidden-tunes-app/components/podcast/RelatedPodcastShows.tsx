import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "../../constants/theme";
import type { HiddenTunesPodcastShow } from "../../services/podcastCatalogApi";
import { openPodcastShow } from "../../utils/podcastNavigation";
import { PodcastShowCard } from "./PodcastDiscoveryCards";
import { podcastShowSubtitle } from "../../utils/openHiddenTunesPodcast";

type RelatedPodcastShowsProps = {
  shows: HiddenTunesPodcastShow[];
};

export const RelatedPodcastShows = memo(function RelatedPodcastShows({
  shows,
}: RelatedPodcastShowsProps) {
  if (!shows.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        Related Podcasts
      </Text>
      {shows.map((show) => (
        <PodcastShowCard
          key={show.id}
          show={show}
          subtitle={podcastShowSubtitle(show)}
          onPress={() => openPodcastShow(show)}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: 24,
    marginBottom: 8,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },
});
