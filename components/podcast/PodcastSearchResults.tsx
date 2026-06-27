import { StyleSheet, Text, View } from "react-native";

import { PodcastShowCard } from "./PodcastCards";
import { COLORS } from "../../constants/theme";
import type { PodcastSearchResult } from "../../types/podcast";

type PodcastSearchResultsProps = {
  results: PodcastSearchResult[];
  hasQuery: boolean;
  onOpenShow: (showId: string) => void;
};

export default function PodcastSearchResults({
  results,
  hasQuery,
  onOpenShow,
}: PodcastSearchResultsProps) {
  if (!hasQuery) return null;

  if (!results.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>No podcasts matched that search.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Search Results</Text>
      {results.map((result) =>
        result.show ? (
          <PodcastShowCard
            key={`search-${result.show.id}`}
            show={result.show}
            onPress={() => onOpenShow(result.show!.id)}
          />
        ) : null
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  emptyWrap: {
    paddingVertical: 12,
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 13,
  },
});
