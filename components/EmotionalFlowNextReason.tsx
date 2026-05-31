import { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type EmotionalFlowNextReasonProps = {
  reason: string | null;
  style?: StyleProp<ViewStyle>;
};

function EmotionalFlowNextReason({
  reason,
  style,
}: EmotionalFlowNextReasonProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(4)).current;
  const [visibleReason, setVisibleReason] = useState<string | null>(reason);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (reason) {
      setVisibleReason(reason);
      translateY.setValue(4);
      opacity.setValue(0);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();

    hideTimerRef.current = setTimeout(() => {
      setVisibleReason(null);
      hideTimerRef.current = null;
    }, 150);
  }, [opacity, reason, translateY]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  if (!visibleReason) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Text numberOfLines={1} style={styles.text}>
        {visibleReason}
      </Text>
    </Animated.View>
  );
}

export default memo(EmotionalFlowNextReason);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 8,
  },
  text: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.48)",
    letterSpacing: 0.2,
  },
});
