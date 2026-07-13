import { memo, useMemo } from "react";
import {
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
  type ListRenderItem,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { getPremiumGridLayout, type PremiumGridLayout } from "@/utils/premiumGridLayout";

export type PremiumContentGridProps<T> = {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: ListRenderItem<T>;
  maxItems?: number;
  columns?: number;
  gutter?: number;
  horizontalPadding?: number;
  scrollEnabled?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  listKey?: string;
};

function PremiumContentGridInner<T>({
  data,
  keyExtractor,
  renderItem,
  maxItems,
  columns,
  gutter,
  horizontalPadding,
  scrollEnabled = false,
  contentContainerStyle,
  listKey,
}: PremiumContentGridProps<T>) {
  const { width } = useWindowDimensions();
  const layout: PremiumGridLayout = useMemo(
    () => getPremiumGridLayout({ windowWidth: width, columns, gutter, horizontalPadding }),
    [columns, gutter, horizontalPadding, width]
  );
  const visibleData = useMemo(
    () => (maxItems != null ? data.slice(0, maxItems) : data),
    [data, maxItems]
  );

  if (!visibleData.length) return null;

  return (
    <View style={styles.wrap}>
      <FlatList
        key={`${listKey ?? "premium-content-grid"}-${layout.columns}`}
        data={visibleData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={layout.columns}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={scrollEnabled}
        columnWrapperStyle={
          layout.columns > 1
            ? [styles.columnWrapper, { gap: layout.gutter, marginBottom: layout.gutter, paddingHorizontal: layout.horizontalPadding }]
            : undefined
        }
        contentContainerStyle={[
          layout.columns === 1
            ? { paddingHorizontal: layout.horizontalPadding, gap: layout.gutter }
            : styles.singleColumnContent,
          contentContainerStyle,
        ]}
        initialNumToRender={Math.min(visibleData.length, layout.columns * 3)}
        maxToRenderPerBatch={layout.columns * 2}
        windowSize={5}
        removeClippedSubviews={scrollEnabled}
      />
    </View>
  );
}

export const PremiumContentGrid = memo(PremiumContentGridInner) as typeof PremiumContentGridInner;

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  columnWrapper: { justifyContent: "flex-start" },
  singleColumnContent: { paddingBottom: 4 },
});

export { getPremiumGridLayout };
