import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { usePathname } from "expo-router";

import {
  setEmotionalFlowEnabled,
  setLateNightModeEnabled,
  setStayInWorldEnabled,
} from "../state/emotionalFlowSettings";
import { clearEmotionalQueue } from "../state/emotionalQueueController";
import { useEmotionalFlowSettings } from "../state/useEmotionalFlowSettings";
import { useEmotionalPulse } from "../utils/useEmotionalPulse";
import { getWorldUiMeta } from "../utils/worldPresentation";

type FlowPillProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  pulseGlow?: boolean;
};

const FlowPill = memo(function FlowPill({
  label,
  active,
  onPress,
  pulseGlow = false,
}: FlowPillProps) {
  return (
    <View style={styles.pillOuter}>
      {pulseGlow ? (
        <View pointerEvents="none" style={styles.pillGlow} />
      ) : null}

      <Pressable
        onPress={onPress}
        style={[styles.pill, active && styles.pillActive]}
        hitSlop={6}
      >
        <Text style={[styles.pillText, active && styles.pillTextActive]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
});

function EmotionalFlowPlayerControls() {
  const pathname = usePathname();
  const settings = useEmotionalFlowSettings();
  const pulseActive = useEmotionalPulse();
  const onPlayerScreen = pathname.includes("player");
  const worldMeta = settings.activeWorldId
    ? getWorldUiMeta(settings.activeWorldId)
    : null;

  const toggleEmotionalFlow = useCallback(() => {
    const next = !settings.emotionalFlowEnabled;
    setEmotionalFlowEnabled(next);

    if (!next) {
      clearEmotionalQueue();
    }
  }, [settings.emotionalFlowEnabled]);

  const toggleStayInWorld = useCallback(() => {
    setStayInWorldEnabled(!settings.stayInWorldEnabled);
  }, [settings.stayInWorldEnabled]);

  const toggleLateNightMode = useCallback(() => {
    setLateNightModeEnabled(!settings.lateNightModeEnabled);
  }, [settings.lateNightModeEnabled]);

  if (!onPlayerScreen) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.row}>
        <FlowPill
          label="Emotional Flow"
          active={settings.emotionalFlowEnabled}
          pulseGlow={pulseActive}
          onPress={toggleEmotionalFlow}
        />

        {settings.activeWorldId ? (
          <FlowPill
            label={
              worldMeta?.title
                ? `Stay in ${worldMeta.title}`
                : "Stay in World"
            }
            active={settings.stayInWorldEnabled}
            onPress={toggleStayInWorld}
          />
        ) : null}

        <FlowPill
          label="Late-Night Mode"
          active={settings.lateNightModeEnabled}
          onPress={toggleLateNightMode}
        />
      </View>
    </View>
  );
}

export default memo(EmotionalFlowPlayerControls);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    maxWidth: "96%",
  },
  pillOuter: {
    position: "relative",
  },
  pillGlow: {
    position: "absolute",
    top: -8,
    right: -8,
    bottom: -8,
    left: -8,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.14)",
    shadowColor: "#C084FC",
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 4,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  pillActive: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.28)",
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.3,
  },
  pillTextActive: {
    color: "rgba(255,255,255,0.92)",
  },
});
