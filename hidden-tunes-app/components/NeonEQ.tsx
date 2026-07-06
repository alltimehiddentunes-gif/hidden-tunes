import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, View } from "react-native";

import { COLORS } from "../constants/theme";
import {
  shouldRunNonEssentialWork,
  subscribeFastScrolling,
} from "../utils/performanceMode";

type NeonEQProps = {
  isPlaying?: boolean;
  size?: "small" | "medium" | "large";
};

const BAR_COUNT = 4;

function NeonEQ({ isPlaying = false, size = "medium" }: NeonEQProps) {
  const bars = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.25))
  ).current;
  const [nonEssentialWorkAllowed, setNonEssentialWorkAllowed] = useState(
    shouldRunNonEssentialWork()
  );
  const shouldAnimate = isPlaying && nonEssentialWorkAllowed;

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
    const syncWorkAllowed = () => {
      setNonEssentialWorkAllowed(shouldRunNonEssentialWork());
    };

    syncWorkAllowed();
    const unsubscribeFastScroll = subscribeFastScrolling(syncWorkAllowed);
    const appStateSubscription = AppState.addEventListener("change", syncWorkAllowed);

    return () => {
      unsubscribeFastScroll();
      appStateSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!shouldAnimate) {
      bars.forEach((bar) => {
        bar.stopAnimation();
        bar.setValue(0.25);
      });
      return undefined;
    }

    const animations = bars.map((bar, index) => {
      bar.stopAnimation();

      return Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: index % 2 === 0 ? 0.95 : 0.62,
            duration: 360 + index * 70,
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: index % 2 === 0 ? 0.35 : 0.9,
            duration: 420 + index * 55,
            useNativeDriver: true,
          }),
        ])
      );
    });

    animations.forEach((animation) => animation.start());

    return () => {
      animations.forEach((animation) => animation.stop());
    };
  }, [bars, shouldAnimate]);

  const containerStyle = useMemo(
    () => [styles.container, { height: dimensions.maxHeight, gap: dimensions.gap }],
    [dimensions.maxHeight, dimensions.gap]
  );

  const halfHeight = dimensions.maxHeight / 2;

  if (!shouldAnimate) {
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
      {bars.map((bar, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              width: dimensions.barWidth,
              height: dimensions.maxHeight,
              transform: [
                { translateY: halfHeight },
                { scaleY: bar },
                { translateY: -halfHeight },
              ],
            },
          ]}
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
