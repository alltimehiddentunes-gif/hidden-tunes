import { memo, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../constants/theme";
import { getWorldUiMeta } from "../../utils/worldPresentation";

export type WorldCardVariant = "gallery" | "compact";

type WorldCardProps = {
  worldId: string;
  variant?: WorldCardVariant;
  onPress: () => void;
};

const WorldCard = memo(function WorldCard({
  worldId,
  variant = "gallery",
  onPress,
}: WorldCardProps) {
  const world = useMemo(() => getWorldUiMeta(worldId), [worldId]);
  const isCompact = variant === "compact";
  const moodPreview = useMemo(
    () => (world?.moodTags ?? []).slice(0, isCompact ? 2 : 4),
    [isCompact, world?.moodTags]
  );

  if (!world) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.shell, isCompact ? styles.shellCompact : styles.shellGallery]}
    >
      <LinearGradient
        colors={world.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.glow,
          {
            backgroundColor: world.accent,
            opacity: isCompact ? 0.18 : 0.24,
          },
        ]}
      />

      <BlurView intensity={isCompact ? 18 : 28} tint="dark" style={styles.blur}>
        <View style={styles.content}>
          <Text style={[styles.kicker, { color: world.accent }]}>
            EMOTIONAL WORLD
          </Text>
          <Text
            numberOfLines={isCompact ? 1 : 2}
            style={[styles.title, isCompact && styles.titleCompact]}
          >
            {world.title}
          </Text>
          {!isCompact ? (
            <Text numberOfLines={2} style={styles.tagline}>
              {world.tagline}
            </Text>
          ) : null}

          <View style={styles.tagRow}>
            {moodPreview.map((tag) => (
              <View key={`${worldId}-${tag}`} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      </BlurView>
    </TouchableOpacity>
  );
});

export default WorldCard;

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: COLORS.card,
  },
  shellGallery: {
    minHeight: 220,
    marginBottom: 16,
  },
  shellCompact: {
    width: 168,
    minHeight: 168,
    marginRight: 14,
  },
  glow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 999,
    top: -40,
    right: -30,
  },
  blur: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  content: {
    flex: 1,
    padding: 18,
    justifyContent: "flex-end",
    gap: 8,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  titleCompact: {
    fontSize: 18,
    letterSpacing: -0.4,
  },
  tagline: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  tagPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tagText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize",
  },
});
