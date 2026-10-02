import React, { memo, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import {
  isFastScrolling,
  subscribeFastScrolling,
  useAppActiveState,
} from "../utils/performanceMode";
import { logPerformanceBackgroundWorkPaused } from "../utils/performanceLogs";

import { COLORS } from "../constants/theme";

type NeonEQProps = {
  isPlaying?: boolean;
  size?: "small" | "medium" | "large";
};

const BAR_COUNT = 3;

/**
 * Native-driven EQ bars (Reanimated scaleY + bottom translate compensation).
 * Previous RN Animated height + useNativeDriver:false forced layout work on
 * every Home playing row — primary PLAYING-vs-PAUSED main-thread cost.
 */
function NeonEQBar({
  index,
  barWidth,
  maxHeight,
  animate,
}: {
  index: number;
  barWidth: number;
  maxHeight: number;
  animate: boolean;
}) {
  const scaleY = useSharedValue(0.25);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(scaleY);
      scaleY.value = withTiming(0.25, { duration: 180 });
      return;
    }

    const peak = index % 2 === 0 ? 0.95 : 0.62;
    const trough = index % 2 === 0 ? 0.35 : 0.9;
    scaleY.value = withRepeat(
      withSequence(
        withTiming(peak, {
          duration: 620 + index * 90,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(trough, {
          duration: 720 + index * 80,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(scaleY);
    };
  }, [animate, index, scaleY]);

  const style = useAnimatedStyle(() => {
    const s = scaleY.value;
    // Default transform origin is center — shift so growth stays bottom-anchored.
    return {
      transform: [
        { translateY: ((1 - s) * maxHeight) / 2 },
        { scaleY: s },
      ],
    };
  }, [maxHeight]);

  return (
    <View style={{ height: maxHeight, width: barWidth, justifyContent: "flex-end" }}>
      <Animated.View
        style={[
          styles.bar,
          {
            width: barWidth,
            height: maxHeight,
          },
          style,
        ]}
      />
    </View>
  );
}

function NeonEQ({ isPlaying = false, size = "medium" }: NeonEQProps) {
  const appActive = useAppActiveState();
  const [fastScrolling, setFastScrolling] = useState(isFastScrolling());

  useEffect(() => subscribeFastScrolling(setFastScrolling), []);

  const dimensions = useMemo(() => {
    if (size === "large") {
      return { maxHeight: 40, barWidth: 6, gap: 5 };
    }
    if (size === "small") {
      return { maxHeight: 15, barWidth: 3, gap: 2 };
    }
    return { maxHeight: 24, barWidth: 4, gap: 3 };
  }, [size]);

  const shouldAnimate = isPlaying && appActive && !fastScrolling;

  useEffect(() => {
    if (isPlaying && !appActive) {
      logPerformanceBackgroundWorkPaused("neon_eq", { reason: "app_inactive" });
    }
  }, [appActive, isPlaying]);

  const containerStyle = useMemo(
    () => [styles.container, { height: dimensions.maxHeight, gap: dimensions.gap }],
    [dimensions.maxHeight, dimensions.gap]
  );

  return (
    <View style={containerStyle}>
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <NeonEQBar
          key={index}
          index={index}
          barWidth={dimensions.barWidth}
          maxHeight={dimensions.maxHeight}
          animate={shouldAnimate}
        />
      ))}
    </View>
  );
}

export default memo(NeonEQ);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },

  bar: {
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primaryGlow,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.55,
    shadowRadius: 5,
    elevation: 4,
  },
});
