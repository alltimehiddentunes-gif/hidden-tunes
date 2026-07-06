import React, { memo, useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { COLORS } from "../constants/theme";

type NeonEQProps = {
  isPlaying?: boolean;
  size?: "small" | "medium" | "large";
};

const BAR_COUNT = 4;

function NeonEQ({ isPlaying = false, size = "medium" }: NeonEQProps) {
  const bars = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.25))
  ).current;

  const dimensions = useMemo(() => {
    if (size === "large") {
      return {
        maxHeight: 40,
        barWidth: 6,
        gap: 5,
      };
    }

    if (size === "small") {
      return {
        maxHeight: 15,
        barWidth: 3,
        gap: 2,
      };
    }

    return {
      maxHeight: 24,
      barWidth: 4,
      gap: 3,
    };
  }, [size]);

  useEffect(() => {
    if (!isPlaying) {
      bars.forEach((bar) => bar.stopAnimation());
      return undefined;
    }

    const animations = bars.map((bar, index) => {
      bar.stopAnimation();

      return Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: index % 2 === 0 ? 0.95 : 0.62,
            duration: 360 + index * 70,
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: index % 2 === 0 ? 0.35 : 0.9,
            duration: 420 + index * 55,
            useNativeDriver: false,
          }),
        ])
      );
    });

    animations.forEach((animation) => animation.start());

    return () => {
      animations.forEach((animation) => animation.stop());
    };
  }, [bars, isPlaying]);

  const containerStyle = useMemo(
    () => [styles.container, { height: dimensions.maxHeight, gap: dimensions.gap }],
    [dimensions.maxHeight, dimensions.gap]
  );

  if (!isPlaying) {
    return (
      <View style={containerStyle}>
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                width: dimensions.barWidth,
                height: dimensions.maxHeight * 0.25,
              },
            ]}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      {bars.map((bar, index) => {
        const height = bar.interpolate({
          inputRange: [0, 1],
          outputRange: [dimensions.maxHeight * 0.25, dimensions.maxHeight],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.bar,
              {
                width: dimensions.barWidth,
                height,
              },
            ]}
          />
        );
      })}
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
