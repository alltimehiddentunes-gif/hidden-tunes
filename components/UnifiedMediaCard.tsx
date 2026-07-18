import { memo, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, GRADIENTS, LUXURY_GLOW, SHADOWS, TYPOGRAPHY } from "../constants/theme";
import HTImage from "./HTImage";
import {
  FALLBACK_ARTWORK,
  hasCatalogArtwork,
  hasResolvableArtwork,
} from "../utils/artwork";

type Props = {
  title: string;
  subtitle?: string;
  image?: any;
  imageUri?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  onRightPress?: () => void;
};

/** Static aura only — continuous per-card withRepeat heated Home genre grids. */
const CardArtGlow = memo(function CardArtGlow() {
  return (
    <View
      pointerEvents="none"
      style={[styles.artGlow, { opacity: (LUXURY_GLOW.opacityMin + LUXURY_GLOW.opacityMax) / 2 }]}
    >
      <LinearGradient colors={GRADIENTS.heroAura} style={StyleSheet.absoluteFill} />
    </View>
  );
});

function UnifiedMediaCard({
  title,
  subtitle,
  image,
  imageUri,
  rightIcon = "ellipsis-horizontal",
  onPress,
  onRightPress,
}: Props) {
  const source = useMemo(() => {
    if (hasResolvableArtwork(image)) return image;
    if (imageUri && hasCatalogArtwork(imageUri)) return { uri: imageUri, title };
    if (image) return image;
    return { title, mood: title };
  }, [image, imageUri, title]);

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.wrap}>
      <LinearGradient colors={GRADIENTS.cardElevated} style={styles.card}>
        <View style={styles.imageWrap}>
          <CardArtGlow />
          <HTImage
            source={source}
            fallback={FALLBACK_ARTWORK}
            style={styles.image}
            contentFit="cover"
          />
        </View>

        <View style={styles.textWrap}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
            {title}
          </Text>

          {!!subtitle && (
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.subtitle}>
              {subtitle}
            </Text>
          )}
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onRightPress}
          style={styles.iconButton}
        >
          <Ionicons name={rightIcon} size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default memo(UnifiedMediaCard);

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
    ...SHADOWS.card,
  },

  card: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  imageWrap: {
    width: 64,
    height: 64,
    borderRadius: 19,
    overflow: "hidden",
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    ...SHADOWS.artwork,
  },

  artGlow: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    borderRadius: 19,
    overflow: "hidden",
  },

  image: {
    width: "100%",
    height: "100%",
  },

  textWrap: {
    flex: 1,
    marginLeft: 14,
    minWidth: 0,
  },

  title: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: "900",
    lineHeight: TYPOGRAPHY.cardTitle + 4,
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.cardSubtitle,
    marginTop: 5,
    fontWeight: "700",
    lineHeight: TYPOGRAPHY.cardSubtitle + 3,
  },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
});
