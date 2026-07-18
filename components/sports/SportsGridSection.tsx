import { Children, memo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type SportsGridSectionProps = {
  children: ReactNode;
  columns?: number;
  gap?: number;
  horizontalPadding?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Generic wrapping grid. Each child fills its column slot at 100% width, so grid
 * cards (world / country / competition) should be built to stretch to their container.
 */
function SportsGridSection({
  children,
  columns = 2,
  gap = 12,
  horizontalPadding = 18,
  style,
  testID,
}: SportsGridSectionProps) {
  const items = Children.toArray(children);
  if (!items.length) return null;

  const itemPercent = 100 / columns;
  const halfGap = gap / 2;

  return (
    <View
      style={[styles.container, { paddingHorizontal: horizontalPadding }, style]}
      testID={testID}
    >
      <View style={[styles.row, { marginHorizontal: -halfGap }]}>
        {items.map((child, index) => (
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

export default memo(SportsGridSection);

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },

  row: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});
