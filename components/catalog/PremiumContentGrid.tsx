import { memo, useMemo, type ReactElement } from "react";
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

function chunkRows<T>(items: T[], columns: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }
  return rows;
}

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

  // Nested non-scrolling grids must not use FlatList — parent ScrollView/FlatList
  // owns virtualization. A static grid mounts only the capped preview rows.
  if (!scrollEnabled) {
    const rows = chunkRows(visibleData, layout.columns);
    return (
      <View
        style={[
          styles.wrap,
          { paddingHorizontal: layout.horizontalPadding },
          contentContainerStyle,
        ]}
      >
        {rows.map((row, rowIndex) => (
          <View
            key={`${listKey ?? "premium-static"}-row-${rowIndex}`}
            style={[
              styles.columnWrapper,
              {
                gap: layout.gutter,
                marginBottom: rowIndex === rows.length - 1 ? 0 : layout.gutter,
              },
            ]}
          >
            {row.map((item, columnIndex) => {
              const absoluteIndex = rowIndex * layout.columns + columnIndex;
              const rendered = renderItem({
                item,
                index: absoluteIndex,
                separators: {
                  highlight: () => undefined,
                  unhighlight: () => undefined,
                  updateProps: () => undefined,
                },
              });
              return (
                <View
                  key={keyExtractor(item, absoluteIndex)}
                  style={[styles.staticCell, { flex: 1 }]}
                >
                  {rendered as ReactElement | null}
                </View>
              );
            })}
            {row.length < layout.columns
              ? Array.from({ length: layout.columns - row.length }, (_, filler) => (
                  <View key={`filler-${rowIndex}-${filler}`} style={styles.staticCell} />
                ))
              : null}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        key={`${listKey ?? "premium-content-grid"}-${layout.columns}`}
        data={visibleData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={layout.columns}
        scrollEnabled
        showsVerticalScrollIndicator
        columnWrapperStyle={
          layout.columns > 1
            ? [
                styles.columnWrapper,
                {
                  gap: layout.gutter,
                  marginBottom: layout.gutter,
                  paddingHorizontal: layout.horizontalPadding,
                },
              ]
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
        updateCellsBatchingPeriod={70}
        removeClippedSubviews
      />
    </View>
  );
}

export const PremiumContentGrid = memo(PremiumContentGridInner) as typeof PremiumContentGridInner;

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  columnWrapper: { flexDirection: "row", justifyContent: "flex-start" },
  singleColumnContent: { paddingBottom: 4 },
  staticCell: { flex: 1, minWidth: 0 },
});

export { getPremiumGridLayout };
