import { Children, memo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type SportsHorizontalShelfProps = {
  children: ReactNode;
  /** Caps rendered items defensively even if the caller already bounded the data. */
  maxItems?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Vertical grid columns. Default 1 (full-width fixture list). */
  columns?: number;
};

/**
 * Sports discovery layout — vertical only (global Sports layout rule).
 * Kept export name for call-site compatibility; never scrolls horizontally.
 */
function SportsHorizontalShelf({
  children,
  maxItems,
  gap = 12,
  style,
  contentContainerStyle,
  columns = 1,
}: SportsHorizontalShelfProps) {
  const items = Children.toArray(children);
  const bounded =
    typeof maxItems === "number" ? items.slice(0, Math.max(0, maxItems)) : items;

  if (!bounded.length) return null;

  const cols = Math.max(1, Math.min(3, columns));
  const itemPercent = 100 / cols;
  const halfGap = gap / 2;

  return (
    <View
      style={[styles.container, style, contentContainerStyle]}
      testID="sports-vertical-shelf"
    >
      <View style={[styles.row, { marginHorizontal: -halfGap }]}>
        {bounded.map((child, index) => (
          <View
            key={(child as { key?: string | null })?.key ?? index}
            style={{
              width: `${itemPercent}%`,
              paddingHorizontal: halfGap,
              marginBottom: gap,
            }}
          >
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

export default memo(SportsHorizontalShelf);

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 18,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});
