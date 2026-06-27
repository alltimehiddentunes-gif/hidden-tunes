import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "../../constants/theme";

type PlaybackSeekChipsProps = {
  onSeekBack: () => void;
  onSeekForward: () => void;
};

export const PlaybackSeekChips = memo(function PlaybackSeekChips({
  onSeekBack,
  onSeekForward,
}: PlaybackSeekChipsProps) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Seek back 15 seconds"
        onPress={onSeekBack}
        style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      >
        <Text style={styles.chipText}>-15s</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Seek forward 30 seconds"
        onPress={onSeekForward}
        style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      >
        <Text style={styles.chipText}>+30s</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  chip: {
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
});
