// Diagnostic-only counter. This never changes playback or component state.
export type MetroRenderSurface =
  | "playerProvider"
  | "stateConsumer"
  | "actionsConsumer"
  | "progressConsumer"
  | "trackStatusActive"
  | "trackStatusInactive"
  | "appShell"
  | "miniPlayer"
  | "miniProgress";

export function markMetroRender(surface: MetroRenderSurface) {
  if (process.env.EXPO_PUBLIC_METRO_HARNESS !== "1") return;
  (globalThis as typeof globalThis & {
    __htMarkRender?: (surface: MetroRenderSurface) => void;
  }).__htMarkRender?.(surface);
}
