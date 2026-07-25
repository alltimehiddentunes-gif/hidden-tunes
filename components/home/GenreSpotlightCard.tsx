import { memo, useMemo } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import HTImage from "@/components/HTImage";
import { COLORS, SHADOWS } from "@/constants/theme";
import {
  FALLBACK_ARTWORK_ASSET,
  pickBestArtworkFromSongs,
  resolveGroupArtworkSource,
} from "@/utils/artwork";

export type GenreSpotlightCardProps = {
  id: string;
  title: string;
  songCountLabel: string;
  artwork?: string;
  songs?: any[];
  onPress: () => void;
};

const GenreSpotlightCard = memo(function GenreSpotlightCard({
  id,
  title,
  songCountLabel,
  artwork,
  songs = [],
  onPress,
}: GenreSpotlightCardProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(168, Math.max(148, Math.round(width * 0.42)));

  const source = useMemo(
    () =>
      resolveGroupArtworkSource({
        id,
        title,
        type: "genre",
        artwork: artwork || pickBestArtworkFromSongs(songs),
        songs,
      }),
    [artwork, id, songs, title]
  );

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${songCountLabel}`}
      style={[styles.card, { width: cardWidth }]}
    >
      <View pointerEvents="none" style={styles.artWrap}>
        <HTImage
          source={source}
          fallback={FALLBACK_ARTWORK_ASSET}
          style={styles.art}
          contentFit="cover"
        />
        <LinearGradient
          pointerEvents="none"
          colors={["transparent", "rgba(0,0,0,0.18)", "rgba(0,0,0,0.78)"]}
          style={styles.shade}
        />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={2} ellipsizeMode="tail" style={styles.title}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {songCountLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export default GenreSpotlightCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(18,7,31,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    ...SHADOWS.card,
  },
  artWrap: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "rgba(168,85,247,0.1)",
  },
  art: {
    width: "100%",
    height: "100%",
  },
  shade: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
  },
  copy: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    minHeight: 58,
    justifyContent: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  meta: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
    opacity: 0.92,
  },
});
