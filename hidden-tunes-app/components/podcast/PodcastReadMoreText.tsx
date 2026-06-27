import { memo, useCallback, useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
  type TextLayoutEvent,
} from "react-native";

import { COLORS } from "../../constants/theme";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type PodcastReadMoreTextProps = {
  text: string;
  maxLines?: number;
};

export const PodcastReadMoreText = memo(function PodcastReadMoreText({
  text,
  maxLines = 4,
}: PodcastReadMoreTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  }, []);

  const handleTextLayout = useCallback(
    (event: TextLayoutEvent) => {
      if (expanded) return;
      setTruncated(event.nativeEvent.lines.length > maxLines);
    },
    [expanded, maxLines]
  );

  const showToggle = useMemo(
    () => truncated || expanded || text.length > 180,
    [expanded, text.length, truncated]
  );

  if (!text) return null;

  return (
    <View style={styles.wrap}>
      <Text
        style={styles.text}
        numberOfLines={expanded ? undefined : maxLines}
        onTextLayout={handleTextLayout}
        accessibilityRole="text"
      >
        {text}
      </Text>

      {showToggle ? (
        <TouchableOpacity
          onPress={toggleExpanded}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show less description" : "Read more description"}
        >
          <Text style={styles.toggle}>{expanded ? "Show less" : "Read more"}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginTop: 4,
  },
  text: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  toggle: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
});
