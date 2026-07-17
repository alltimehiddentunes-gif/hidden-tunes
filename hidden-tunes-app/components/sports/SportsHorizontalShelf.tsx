import { Children, memo, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type SportsHorizontalShelfProps = {
  children: ReactNode;
  /** Caps rendered items defensively even if the caller already bounded the data. */
  maxItems?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

function SportsHorizontalShelf({
  children,
  maxItems,
  gap = 12,
  style,
  contentContainerStyle,
}: SportsHorizontalShelfProps) {
  const items = Children.toArray(children);
  const bounded = typeof maxItems === "number" ? items.slice(0, Math.max(0, maxItems)) : items;

  if (!bounded.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={[styles.content, { paddingHorizontal: 18, gap }, contentContainerStyle]}
      decelerationRate="fast"
    >
      {bounded.map((child, index) => (
        <View key={(child as { key?: string | null })?.key ?? index}>{child}</View>
      ))}
    </ScrollView>
  );
}

export default memo(SportsHorizontalShelf);

const styles = StyleSheet.create({
  content: {
    flexDirection: "row",
  },
});
