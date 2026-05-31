import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { FlatList, FlatListProps, StyleProp, ViewStyle } from "react-native";

import {
  createStableKeyExtractor,
  getListPerformanceSettings,
  getNestedSongListLayout,
  markFastScrolling,
} from "../../utils/performanceMode";
import { logListMountTiming } from "../../utils/renderDiagnostics";

type NestedSongListProps<T> = {
  screen: string;
  data: T[];
  itemHeight: number;
  keyPrefix: string;
  renderItem: NonNullable<FlatListProps<T>["renderItem"]>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  ListFooterComponent?: FlatListProps<T>["ListFooterComponent"];
};

function NestedSongListInner<T>({
  screen,
  data,
  itemHeight,
  keyPrefix,
  renderItem,
  contentContainerStyle,
  ListFooterComponent,
}: NestedSongListProps<T>) {
  const mountStartedAt = useRef(Date.now()).current;
  const tuning = useMemo(() => getListPerformanceSettings(data.length), [data.length]);
  const getItemLayout = useMemo(
    () => getNestedSongListLayout(itemHeight),
    [itemHeight]
  );
  const keyExtractor = useMemo(
    () => createStableKeyExtractor(keyPrefix),
    [keyPrefix]
  );

  const handleScrollBegin = useCallback(() => markFastScrolling(true), []);
  const handleScrollEnd = useCallback(() => markFastScrolling(false), []);

  useEffect(() => {
    logListMountTiming(screen, data.length, mountStartedAt);
  }, [data.length, mountStartedAt, screen]);

  return (
    <FlatList
      data={data}
      scrollEnabled={false}
      nestedScrollEnabled
      keyExtractor={keyExtractor as FlatListProps<T>["keyExtractor"]}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      contentContainerStyle={contentContainerStyle}
      ListFooterComponent={ListFooterComponent}
      initialNumToRender={Math.min(tuning.initialNumToRender, Math.max(data.length, 1))}
      maxToRenderPerBatch={tuning.maxToRenderPerBatch}
      windowSize={tuning.windowSize}
      updateCellsBatchingPeriod={tuning.updateCellsBatchingPeriod}
      removeClippedSubviews={tuning.removeClippedSubviews}
      onScrollBeginDrag={handleScrollBegin}
      onMomentumScrollBegin={handleScrollBegin}
      onMomentumScrollEnd={handleScrollEnd}
    />
  );
}

const NestedSongList = memo(NestedSongListInner) as typeof NestedSongListInner;

export default NestedSongList;
