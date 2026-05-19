import { memo, useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import HTImage from "../HTImage";
import { COLORS } from "../../constants/theme";

type GenreTrackRowProps = {
  item: {
    id: string;
    title: string;
    artist: string;
    artwork?: string;
    cover?: string;
    thumbnail?: string;
  };
  onPress: (item: any) => void;
};

function GenreTrackRow({ item, onPress }: GenreTrackRowProps) {
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.card}
      onPress={handlePress}
    >
      <HTImage source={item} style={styles.cover} />

      <View style={styles.info}>
        <Text numberOfLines={1} style={styles.title}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.artist}>
          {item.artist}
        </Text>
      </View>

      <View style={styles.playCircle}>
        <Ionicons name="play" size={16} color="#000" />
      </View>
    </TouchableOpacity>
  );
}

export default memo(GenreTrackRow, (previous, next) => {
  return previous.item.id === next.item.id && previous.onPress === next.onPress;
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
    padding: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: 16,
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
  playCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
});
