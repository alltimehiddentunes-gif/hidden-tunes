import { memo, useCallback } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import MediaCard from "../MediaCard";
import NeonEQ from "../NeonEQ";

type CatalogSongRowProps = {
  song: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    artwork?: string;
    cover?: string;
    thumbnail?: string;
  };
  image: string;
  active: boolean;
  isPlaying: boolean;
  onPress: (song: any) => void;
};

function CatalogSongRow({
  song,
  image,
  active,
  isPlaying,
  onPress,
}: CatalogSongRowProps) {
  const handlePress = useCallback(() => {
    onPress(song);
  }, [onPress, song]);

  return (
    <View style={[styles.shell, active && styles.shellActive]}>
      <MediaCard
        title={song.title}
        subtitle={`${song.artist} • ${song.album || "Hidden Tunes"}`}
        image={image}
        type="song"
        size="medium"
        showPlayButton={false}
        onPress={handlePress}
      />

      <View style={styles.action}>
        {active ? (
          <NeonEQ isPlaying={isPlaying} size="small" />
        ) : (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.playButton}
            onPress={handlePress}
          >
            <Ionicons name="play" size={18} color="#000" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default memo(CatalogSongRow, (previous, next) => {
  return (
    previous.song.id === next.song.id &&
    previous.image === next.image &&
    previous.active === next.active &&
    previous.isPlaying === next.isPlaying &&
    previous.onPress === next.onPress
  );
});

const styles = StyleSheet.create({
  shell: {
    marginBottom: 0,
  },
  shellActive: {
    opacity: 1,
  },
  action: {
    position: "absolute",
    right: 24,
    top: "50%",
    marginTop: -20,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#facc15",
  },
});
