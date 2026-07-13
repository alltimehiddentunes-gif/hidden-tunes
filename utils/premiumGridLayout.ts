import { Dimensions } from "react-native";

export type PremiumGridLayout = {
  columns: number;
  gutter: number;
  horizontalPadding: number;
  itemWidth: number;
};

const DEFAULT_GUTTER = 12;
const DEFAULT_HORIZONTAL_PADDING = 0;

/** Phone portrait defaults to 2 columns; scales up on wider layouts. */
export function getPremiumGridColumns(windowWidth?: number): number {
  const width = windowWidth ?? Dimensions.get("window").width;
  if (width >= 900) return 4;
  if (width >= 680) return 3;
  return 2;
}

export function getPremiumGridLayout(options?: {
  windowWidth?: number;
  columns?: number;
  gutter?: number;
  horizontalPadding?: number;
}): PremiumGridLayout {
  const windowWidth = options?.windowWidth ?? Dimensions.get("window").width;
  const columns = options?.columns ?? getPremiumGridColumns(windowWidth);
  const gutter = options?.gutter ?? DEFAULT_GUTTER;
  const horizontalPadding =
    options?.horizontalPadding ?? DEFAULT_HORIZONTAL_PADDING;
  const totalGutter = gutter * (columns - 1);
  const itemWidth =
    (windowWidth - horizontalPadding * 2 - totalGutter) / columns;

  return {
    columns,
    gutter,
    horizontalPadding,
    itemWidth: Math.max(120, itemWidth),
  };
}
