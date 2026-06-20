import React, { memo } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { COLORS } from "../../constants/theme";
import { openLaunchWorld } from "../../utils/catalogNavigation";
import type { LaunchContentChip } from "../../utils/launchContentRegistry";

type LaunchContentChipsProps = {
  title: string;
  chips: LaunchContentChip[];
  nested?: boolean;
};

export const LaunchContentChips = memo(function LaunchContentChips({
  title,
  chips,
  nested = true,
}: LaunchContentChipsProps) {
  if (!chips.length) return null;

  const handlePress = (chip: LaunchContentChip) => {
    if (chip.worldId) {
      openLaunchWorld(chip.worldId);
      return;
    }

    router.push({
      pathname: chip.pathname as any,
      params: chip.params,
    });
  };

  const renderItem: ListRenderItem<LaunchContentChip> = ({ item }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      onPress={() => handlePress(item)}
    >
      <Ionicons name={item.icon} size={16} color={COLORS.primary} />
      <View style={styles.chipCopy}>
        <Text numberOfLines={1} style={styles.chipTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.chipSubtitle}>
          {item.subtitle}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <FlatList
        horizontal
        nestedScrollEnabled={nested}
        data={chips}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        renderItem={renderItem}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: 28,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    paddingHorizontal: 20,
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  rail: {
    paddingLeft: 20,
    paddingRight: 28,
    gap: 10,
    paddingBottom: 8,
  },
  chip: {
    width: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipPressed: {
    opacity: 0.88,
  },
  chipCopy: {
    flex: 1,
  },
  chipTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  chipSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
