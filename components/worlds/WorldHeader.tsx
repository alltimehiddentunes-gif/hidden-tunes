import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../constants/theme";
import { getWorldUiMeta } from "../../utils/worldPresentation";

type WorldHeaderProps = {
  worldId: string;
};

const WorldHeader = memo(function WorldHeader({ worldId }: WorldHeaderProps) {
  const world = useMemo(() => getWorldUiMeta(worldId), [worldId]);

  if (!world) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>World not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <LinearGradient
        colors={world.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[styles.glowLarge, { backgroundColor: world.accent }]}
      />
      <View
        style={[styles.glowSmall, { backgroundColor: world.accent }]}
      />

      <BlurView intensity={32} tint="dark" style={styles.blur}>
        <View style={styles.content}>
          <Text style={[styles.kicker, { color: world.accent }]}>
            CINEMATIC WORLD
          </Text>
          <Text style={styles.title}>{world.title}</Text>
          <Text style={styles.tagline}>{world.tagline}</Text>

          <View style={styles.tagRow}>
            {world.moodTags.map((tag) => (
              <View key={`${worldId}-${tag}`} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      </BlurView>
    </View>
  );
});

export default WorldHeader;

const styles = StyleSheet.create({
  shell: {
    minHeight: 280,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 18,
  },
  glowLarge: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    top: -70,
    right: -40,
    opacity: 0.22,
  },
  glowSmall: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 999,
    bottom: -20,
    left: -10,
    opacity: 0.16,
  },
  blur: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingVertical: 28,
    justifyContent: "flex-end",
    gap: 10,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.4,
  },
  title: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
  },
  tagline: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    maxWidth: "92%",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  tagPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  tagText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  fallback: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  fallbackText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
});
