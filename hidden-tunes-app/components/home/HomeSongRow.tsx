import { memo, useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";

import CatalogSongRow from "../catalog/CatalogSongRow";
import type { HiddenTunesNormalizedSong } from "../../services/hiddenTunesApi";
import {
  recordMemoizedHomeRow,
  recordStabilizedHomeRow,
} from "../../utils/homeRenderDiagnostics";

type HomeSongRowProps = {
  song: HiddenTunesNormalizedSong;
  image: string;
  active: boolean;
  isPlaying: boolean;
  onPress: (song: HiddenTunesNormalizedSong) => void;
};

function HomeSongRow({ song, image, active, isPlaying, onPress }: HomeSongRowProps) {
  useEffect(() => {
    recordMemoizedHomeRow();
  }, []);

  const handlePress = useCallback(() => {
    onPress(song);
  }, [onPress, song]);

  return (
    <View style={[styles.mediaShell, active && styles.mediaShellActive]}>
      <CatalogSongRow
        song={song}
        image={image}
        active={active}
        isPlaying={isPlaying}
        onPress={handlePress}
      />
    </View>
  );
}

export default memo(HomeSongRow, (previous, next) => {
  const isStable =
    previous.song.id === next.song.id &&
    previous.image === next.image &&
    previous.active === next.active &&
    previous.isPlaying === next.isPlaying &&
    previous.onPress === next.onPress;

  if (isStable) {
    recordStabilizedHomeRow();
  }

  return isStable;
});

const styles = StyleSheet.create({
  mediaShell: {
    marginBottom: 0,
  },
  mediaShellActive: {
    opacity: 1,
  },
});
