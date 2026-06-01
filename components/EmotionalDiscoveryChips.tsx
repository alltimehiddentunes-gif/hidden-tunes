import React, { memo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { COLORS } from "../constants/theme";
import { openMoodCatalog } from "../utils/catalogNavigation";
import { EMOTIONAL_DISCOVERY_SHORTCUTS } from "../utils/emotionalDiscoveryShortcuts";

type EmotionalDiscoveryChipsProps = {
  title?: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
};

export const EmotionalDiscoveryChips = memo(function EmotionalDiscoveryChips({
  title = "Emotional Discovery",
  subtitle = "Feel your way into the catalog",
  style,
}: EmotionalDiscoveryChipsProps) {
  return (
    <View style={[styles.wrap, style]}>
      {title || subtitle ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}

      <View style={styles.chipWrap}>
        {EMOTIONAL_DISCOVERY_SHORTCUTS.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            onPress={() => openMoodCatalog(item.title, item.query)}
          >
            <Ionicons name={item.icon} size={13} color={COLORS.primary} />
            <Text style={styles.chipText}>{item.title}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});

export const SubtleTvEntryLink = memo(function SubtleTvEntryLink({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Open Hidden Tunes TV"
      style={({ pressed }) => [styles.tvLink, pressed && styles.tvLinkPressed, style]}
      onPress={() => router.push("/music-feed" as any)}
    >
      <Ionicons name="tv-outline" size={14} color={COLORS.textMuted} />
      <Text style={styles.tvLinkText}>Hidden Tunes TV</Text>
      <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginBottom: 8,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  chipPressed: {
    backgroundColor: "rgba(168,85,247,0.14)",
    borderColor: "rgba(168,85,247,0.35)",
  },
  chipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  tvLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  tvLinkPressed: {
    opacity: 0.72,
  },
  tvLinkText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
});
