import { memo, useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";

import { router } from "expo-router";

import HTImage from "../HTImage";
import { COLORS } from "../../constants/theme";

type HomeArtistCardProps = {
  item: {
    id: string;
    name?: string;
    artwork?: string;
    tracks?: { length?: number } | any[];
  };
};

type HomeAlbumCardProps = {
  item: {
    id: string;
    title?: string;
    artist?: string;
    artwork?: string;
  };
};

export const HomeArtistCard = memo(function HomeArtistCard({ item }: HomeArtistCardProps) {
  const handlePress = useCallback(() => {
    router.push({
      pathname: "/artist/[id]",
      params: { id: item.id },
    } as any);
  }, [item.id]);

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.artistCard} onPress={handlePress}>
      <HTImage source={item} style={styles.artistImage} />
      <Text numberOfLines={1} style={styles.artistName}>
        {item.name}
      </Text>
      <Text numberOfLines={1} style={styles.artistMeta}>
        {Array.isArray(item.tracks) ? `${item.tracks.length} songs` : "Hidden Tunes"}
      </Text>
    </TouchableOpacity>
  );
});

export const HomeAlbumCard = memo(function HomeAlbumCard({ item }: HomeAlbumCardProps) {
  const handlePress = useCallback(() => {
    router.push({
      pathname: "/album/[id]",
      params: { id: item.id },
    } as any);
  }, [item.id]);

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.albumCard} onPress={handlePress}>
      <HTImage source={item} style={styles.albumImage} />
      <Text numberOfLines={1} style={styles.artistName}>
        {item.title}
      </Text>
      <Text numberOfLines={1} style={styles.artistMeta}>
        {item.artist}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  artistCard: {
    width: 140,
    borderRadius: 24,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  artistImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: COLORS.card,
    marginBottom: 12,
  },
  albumCard: {
    width: 150,
    borderRadius: 24,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  albumImage: {
    width: "100%",
    height: 126,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    marginBottom: 12,
  },
  artistName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  artistMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 5,
  },
});
