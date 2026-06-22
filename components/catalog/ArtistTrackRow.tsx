import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import AddToPlaylistButton from "../AddToPlaylistButton";
import FavoriteButton from "../FavoriteButton";
import HTImage from "../HTImage";
import NeonEQ from "../NeonEQ";
import { COLORS } from "../../constants/theme";
import { buildSongFavoriteItem } from "../../services/favorites/favoriteItemBuilders";

type ArtistTrackRowProps = {
  track: {
    id: string;
    title: string;
    artist?: string;
    album?: string;
    duration?: number;
    artwork?: string;
    cover?: string;
    thumbnail?: string;
  };
  index: number;
  active: boolean;
  isPlaying: boolean;
  metaLine: string;
  onPress: (track: any) => void;
};

function ArtistTrackRow({
  track,
  index,
  active,
  isPlaying,
  metaLine,
  onPress,
}: ArtistTrackRowProps) {
  const handlePress = useCallback(() => {
    onPress(track);
  }, [onPress, track]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        active && styles.rowActive,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.numberBox}>
        {active ? (
          <NeonEQ isPlaying={isPlaying} size="small" />
        ) : (
          <Text style={styles.number}>{index + 1}</Text>
        )}
      </View>

      <HTImage source={track} style={styles.cover} />

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {metaLine}
        </Text>
      </View>

      <FavoriteButton item={buildSongFavoriteItem(track)} size={20} />
      <AddToPlaylistButton track={track as any} />

      <Ionicons
        name={active && isPlaying ? "pause-circle" : "play-circle"}
        size={30}
        color={COLORS.primary}
      />
    </Pressable>
  );
}

export default memo(ArtistTrackRow, (previous, next) => {
  return (
    previous.track.id === next.track.id &&
    previous.index === next.index &&
    previous.active === next.active &&
    previous.isPlaying === next.isPlaying &&
    previous.metaLine === next.metaLine &&
    previous.onPress === next.onPress
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 20,
  },
  rowActive: {
    backgroundColor: "rgba(250,204,21,0.08)",
  },
  rowPressed: {
    backgroundColor: "rgba(168,85,247,0.12)",
    transform: [{ scale: 0.99 }],
  },
  numberBox: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  number: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  cover: {
    width: 54,
    height: 54,
    borderRadius: 14,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  artist: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "700",
  },
});
