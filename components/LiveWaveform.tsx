import React, { memo, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { ViewStyle } from "react-native";

import Animated, {
  cancelAnimation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "../constants/theme";
import { isAppActiveForWork, subscribeAppActive } from "../utils/performanceMode";
import { logPerformanceDuplicateListenerRemoved } from "../utils/performanceLogs";

type LiveWaveformProps = {
  isPlaying?: boolean;
  size?: "small" | "medium" | "large";
  color?: string;
};

type WaveBarProps = {
  index: number;
  progress: SharedValue<number>;
  isPlaying: boolean;
  color: string;
  barHeight: number;
  barWidth: number;
};

const BAR_COUNT = 10;
const BAR_INDEXES = Array.from({ length: BAR_COUNT }, (_, index) => index);

function LiveWaveform({
  isPlaying = false,
  size = "medium",
  color = COLORS.primary,
}: LiveWaveformProps) {
  const progress = useSharedValue(0);
  const [appActive, setAppActive] = useState(isAppActiveForWork());
  const shouldAnimate = isPlaying && appActive;

  useEffect(() => {
    logPerformanceDuplicateListenerRemoved("live_waveform_app_state", {
      reason: "shared_performance_mode_listener",
    });
    return subscribeAppActive(setAppActive);
  }, []);

  useEffect(() => {
    if (shouldAnimate) {
      progress.value = withRepeat(withTiming(1, { duration: 1800 }), -1, true);
      return;
    }

    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: 260 });
  }, [shouldAnimate, progress]);

  const barHeight = useMemo(() => {
    if (size === "small") return 24;
    if (size === "large") return 74;
    return 44;
  }, [size]);

  const barWidth = useMemo(() => {
    if (size === "small") return 3;
    if (size === "large") return 5;
    return 4;
  }, [size]);

  const containerStyle = useMemo(
    () => [styles.container, { height: barHeight }],
    [barHeight]
  );

  return (
    <View style={containerStyle}>
      {BAR_INDEXES.map((index) => (
        <WaveBar
          key={index}
          index={index}
          progress={progress}
          isPlaying={shouldAnimate}
          color={color}
          barHeight={barHeight}
          barWidth={barWidth}
        />
      ))}
    </View>
  );
}

const WaveBar = memo(function WaveBar({
  index,
  progress,
  isPlaying,
  color,
  barHeight,
  barWidth,
}: WaveBarProps) {
  const waveOffset = useMemo(() => (index % 7) / 7, [index]);
  const randomPeak = useMemo(() => 0.24 + ((index * 13) % 10) / 24, [index]);

  const animatedStyle = useAnimatedStyle<ViewStyle>(() => {
    const idleHeight = barHeight * 0.16;

    const animatedHeight = interpolate(progress.value, [0, 0.5, 1], [
      idleHeight,
      barHeight * (0.28 + waveOffset * 0.56),
      barHeight * randomPeak,
    ]);

    return {
      height: isPlaying ? animatedHeight : idleHeight,
      opacity: isPlaying ? 0.95 : 0.28,
      transform: [{ scaleY: isPlaying ? 1 : 0.7 }],
    };
  });

  const baseStyle = useMemo(
    () => [
      styles.bar,
      {
        width: barWidth,
        backgroundColor: color,
        borderRadius: barWidth,
      },
    ],
    [barWidth, color]
  );

  return <Animated.View style={[baseStyle, animatedStyle]} />;
});

export default memo(LiveWaveform);

const styles = StyleSheet.create({
  container: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    overflow: "hidden",
  },

  bar: {
    minHeight: 5,
  },
});
