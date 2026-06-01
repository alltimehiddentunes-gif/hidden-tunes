import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useEmotionalEngineSummary } from "../utils/useEmotionalEngineSummary";
import { useEmotionalPulse } from "../utils/useEmotionalPulse";

type EmotionalEngineDashboardProps = {
  style?: StyleProp<ViewStyle>;
};

function EmotionalEngineDashboard({ style }: EmotionalEngineDashboardProps) {
  const summary = useEmotionalEngineSummary();
  const pulseActive = useEmotionalPulse();
  const opacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lines = useMemo(() => {
    const rows: string[] = [];

    if (summary.identitySummary) {
      rows.push(summary.identitySummary);
    }

    rows.push(`Flow ${summary.flowStrength.toFixed(2)}`);

    if (summary.topWorld) {
      rows.push(`World ${summary.topWorld}`);
    }

    if (summary.topMoods.length) {
      rows.push(`Moods ${summary.topMoods.join(" + ")}`);
    }

    rows.push(`Time ${summary.timeBucket}`);
    rows.push(`Session ${summary.sessionRatio}`);

    return rows;
  }, [summary]);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (lines.length) {
      setVisible(true);
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 0.6,
        duration: 250,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();

    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = null;
    }, 150);
  }, [lines, opacity]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, style, { opacity }]}
    >
      {pulseActive ? <View pointerEvents="none" style={styles.pulseGlow} /> : null}

      <View style={styles.textStack}>
        {lines.map((line, index) => (
          <Text key={`${line}-${index}`} numberOfLines={1} style={styles.text}>
            {line}
          </Text>
        ))}
      </View>
    </Animated.View>
  );
}

export default memo(EmotionalEngineDashboard);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 10,
  },
  pulseGlow: {
    position: "absolute",
    top: -6,
    right: -6,
    bottom: -6,
    left: -6,
    borderRadius: 10,
    backgroundColor: "rgba(168,85,247,0.12)",
    shadowColor: "#C084FC",
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 3,
  },
  textStack: {
    gap: 2,
  },
  text: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
    letterSpacing: 0.18,
    lineHeight: 12,
    textAlign: "right",
  },
});
