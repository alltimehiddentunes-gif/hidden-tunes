/**
 * Gates catalog empty/loading UI so stale cache stays visible during refresh.
 */

export type CatalogEmptyTimingInput = {
  hasCheckedFallbacks: boolean;
  isLoading: boolean;
  isRefreshing?: boolean;
  resolvedCount: number;
};

export function shouldShowCatalogEmpty(input: CatalogEmptyTimingInput): boolean {
  if (input.resolvedCount > 0) return false;
  if (input.isRefreshing) return false;
  if (!input.hasCheckedFallbacks || input.isLoading) return false;
  return true;
}

export function shouldShowCatalogLoadingShell(
  input: CatalogEmptyTimingInput
): boolean {
  if (input.resolvedCount > 0) return false;
  return input.isLoading || !input.hasCheckedFallbacks;
}

export function shouldReplaceCatalogResults<T>(
  nextItems: T[],
  currentCount: number,
  options: { allowClearStale?: boolean } = {}
): boolean {
  if (nextItems.length > 0) return true;
  if (currentCount === 0) return true;
  return options.allowClearStale === true;
}

export function shouldResetCatalogFallbackGate(currentCount: number): boolean {
  return currentCount === 0;
}
