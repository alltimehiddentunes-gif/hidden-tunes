import { Children, memo, useMemo, type ReactNode } from "react";
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { sportsFixtureGridColumns } from "@/lib/sports/ui/fixtureGridColumns";
import { SPORTS_SECTION_LIMITS } from "@/lib/sports/ui/homeSections";

type SportsHorizontalShelfProps = {
  children: ReactNode;
  /** Caps rendered items defensively even if the caller already bounded the data. */
  maxItems?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * Vertical grid columns.
   * - number: fixed columns (clamped 1–4)
   * - "auto" / undefined: adaptive from available width (phones default to 2)
   */
  columns?: number | "auto";
};

/**
 * Sports discovery layout — vertical only (global Sports layout rule).
 * Kept export name for call-site compatibility; never scrolls sideways.
 * Defaults to adaptive 2-column fixture grids on normal phones.
 */
function SportsHorizontalShelf({
  children,
  maxItems = SPORTS_SECTION_LIMITS.horizontal,
  gap = 12,
  style,
  contentContainerStyle,
  columns = "auto",
}: SportsHorizontalShelfProps) {
  const { width: windowWidth } = useWindowDimensions();
  const items = Children.toArray(children);
  const bounded =
    typeof maxItems === "number" ? items.slice(0, Math.max(0, maxItems)) : items;

  const resolvedColumns = useMemo(() => {
    if (typeof columns === "number") {
      return Math.max(1, Math.min(4, Math.floor(columns)));
    }
    const available = Math.max(0, windowWidth - 36);
    return sportsFixtureGridColumns(available, { gap, minCardWidth: 148 });
  }, [columns, gap, windowWidth]);

  if (!bounded.length) return null;

  const itemPercent = 100 / resolvedColumns;
  const halfGap = gap / 2;

  return (
    <View
      style={[styles.container, style, contentContainerStyle]}
      testID="sports-vertical-shelf"
      accessibilityLabel={`sports-grid-columns-${resolvedColumns}`}
    >
      <View style={[styles.row, { marginHorizontal: -halfGap }]}>
        {bounded.map((child, index) => (
          <View
            key={(child as { key?: string | null })?.key ?? index}
            style={{
              width: `${itemPercent}%` as `${number}%`,
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
