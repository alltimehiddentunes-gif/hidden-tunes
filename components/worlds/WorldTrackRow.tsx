import { useIosOperationalItemVisibility } from "../../hooks/useIosOperationalPolicy";
import { iosOperationalSongRef } from "../../services/iosOperationalPolicy";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import MediaCard from "../MediaCard";
import { COLORS } from "../../constants/theme";
import { FALLBACK_ARTWORK, getArtworkUri } from "../../utils/artwork";
import type { Track } from "../../types/music";

type WorldTrackRowProps = {
  track: Track;
  index: number;
};

const WorldTrackRow = memo(function WorldTrackRow({
  track,
  index,
}: WorldTrackRowProps) {
  const iosVisible = useIosOperationalItemVisibility(iosOperationalSongRef(track));
  const artwork = getArtworkUri(track, FALLBACK_ARTWORK);

  return iosVisible ? ((
    <View style={styles.shell}>
      <Text style={styles.rank}>{String(index + 1).padStart(2, "0")}</Text>
      <View style={styles.cardWrap}>
        <MediaCard
          title={track.title}
          subtitle={track.artist}
          image={artwork}
          type="song"
          size="medium"
          showPlayButton={false}
        />
      </View>
    </View>
  )) : null;
});

export default WorldTrackRow;

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  rank: {
    width: 28,
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  cardWrap: {
    flex: 1,
  },
});
