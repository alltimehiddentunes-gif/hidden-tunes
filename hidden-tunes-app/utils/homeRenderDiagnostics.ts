let homeRerenderCount = 0;
let stabilizedRowCount = 0;
let memoizedRowCount = 0;

export const requireCycleResolvedCount = { value: 1 };

export function recordHomeRerender() {
  homeRerenderCount += 1;
}

export function recordStabilizedHomeRow() {
  stabilizedRowCount += 1;
}

export function recordMemoizedHomeRow() {
  memoizedRowCount += 1;
}

export function resetHomeRenderDiagnostics() {
  homeRerenderCount = 0;
  stabilizedRowCount = 0;
  memoizedRowCount = 0;
}

export function getHomeRenderDiagnostics() {
  return {
    homeRerenderCount,
    stabilizedRowCount,
    memoizedRowCount,
    requireCycleResolvedCount: requireCycleResolvedCount.value,
  };
}
