import { memo, useCallback, useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";

import { COLORS } from "../../constants/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
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
  const [canExpand, setCanExpand] = useState(false);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  }, []);

  const onTextLayout = useCallback(
    (event: { nativeEvent: { lines: { length: number }[] } }) => {
      if (expanded) return;
      const lineCount = event.nativeEvent.lines?.length ?? 0;
      if (lineCount > maxLines) {
        setCanExpand(true);
      }
    },
    [expanded, maxLines]
  );

  const showToggle = useMemo(() => canExpand || expanded, [canExpand, expanded]);

  if (!text.trim()) return null;

  return (
    <View style={styles.wrap}>
      <Text
        onTextLayout={onTextLayout}
        numberOfLines={expanded ? undefined : maxLines}
        style={styles.text}
        accessibilityRole="text"
      >
        {text}
      </Text>
      {showToggle ? (
        <TouchableOpacity
          onPress={toggle}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show less description" : "Read more description"}
        >
          <Text style={styles.toggleText}>{expanded ? "Show less" : "Read more"}</Text>
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
    color: COLORS.textSoft,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  toggle: {
    alignSelf: "center",
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  toggleText: {
    color: COLORS.primaryGlow,
    fontSize: 13,
    fontWeight: "700",
  },
});
