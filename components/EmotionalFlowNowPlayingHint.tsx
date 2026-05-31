import { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type EmotionalFlowNowPlayingHintProps = {
  hint: string | null;
  style?: StyleProp<ViewStyle>;
};

function EmotionalFlowNowPlayingHint({
  hint,
  style,
}: EmotionalFlowNowPlayingHintProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [visibleHint, setVisibleHint] = useState<string | null>(hint);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (hint) {
      setVisibleHint(hint);
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
      setVisibleHint(null);
      hideTimerRef.current = null;
    }, 150);
  }, [hint, opacity]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  if (!visibleHint) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, style, { opacity }]}
    >
      <Text numberOfLines={1} style={styles.text}>
        {visibleHint}
      </Text>
    </Animated.View>
  );
}

export default memo(EmotionalFlowNowPlayingHint);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 12,
  },
  text: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.52)",
    letterSpacing: 0.25,
  },
});
