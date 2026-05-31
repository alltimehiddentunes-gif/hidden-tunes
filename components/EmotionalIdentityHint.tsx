import { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useEmotionalIdentitySummary } from "../utils/useEmotionalIdentitySummary";

type EmotionalIdentityHintProps = {
  style?: StyleProp<ViewStyle>;
};

function EmotionalIdentityHint({ style }: EmotionalIdentityHintProps) {
  const summary = useEmotionalIdentitySummary();
  const opacity = useRef(new Animated.Value(0)).current;
  const [visibleSummary, setVisibleSummary] = useState<string | null>(summary);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (summary) {
      setVisibleSummary(summary);
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
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
      setVisibleSummary(null);
      hideTimerRef.current = null;
    }, 150);
  }, [opacity, summary]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  if (!visibleSummary) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, style, { opacity }]}
    >
      <Text numberOfLines={1} style={styles.text}>
        {visibleSummary}
      </Text>
    </Animated.View>
  );
}

export default memo(EmotionalIdentityHint);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 11,
  },
  text: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.48)",
    letterSpacing: 0.22,
  },
});
