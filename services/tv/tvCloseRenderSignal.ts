type TvCloseRenderSignal = {
  epoch: number;
  path: string;
};

type TvCloseRenderListener = (signal: TvCloseRenderSignal) => void;

let epoch = 0;
let latestSignal: TvCloseRenderSignal = { epoch, path: "" };
const listeners = new Set<TvCloseRenderListener>();

function routePath(value: string | null | undefined) {
  return String(value || "").trim().split("?")[0];
}

export function getTvCloseRenderEpoch() {
  return epoch;
}

export function markTvCloseDestinationRendered(path: string) {
  const normalizedPath = routePath(path);
  if (!normalizedPath || normalizedPath === "/tv-player") return;

  latestSignal = { epoch: ++epoch, path: normalizedPath };
  listeners.forEach((listener) => listener(latestSignal));
}

export function subscribeTvCloseDestinationRendered(
  listener: TvCloseRenderListener
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isFreshTvCloseDestinationRender(
  signal: TvCloseRenderSignal,
  target: string | null | undefined,
  afterEpoch: number
) {
  return (
    signal.epoch > afterEpoch &&
    signal.path === routePath(target) &&
    signal.path !== "/tv-player"
  );
}

export function getLatestTvCloseRenderSignal() {
  return latestSignal;
}
