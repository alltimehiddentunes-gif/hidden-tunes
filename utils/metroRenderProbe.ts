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
  if (surface === "appShell" || surface === "miniPlayer") {
    (globalThis as typeof globalThis & {
      __htCountIos217?: (kind: "appShellRenders" | "miniPlayerRenders") => void;
    }).__htCountIos217?.(surface === "appShell" ? "appShellRenders" : "miniPlayerRenders");
  }
  if (process.env.EXPO_PUBLIC_METRO_HARNESS !== "1") return;
  (globalThis as typeof globalThis & {
    __htMarkRender?: (surface: MetroRenderSurface) => void;
  }).__htMarkRender?.(surface);
}

export function markMetroProviderDuration(durationMs: number) {
  if (process.env.EXPO_PUBLIC_METRO_HARNESS !== "1") return;
  (globalThis as typeof globalThis & {
    __htProviderDuration?: (durationMs: number) => void;
  }).__htProviderDuration?.(durationMs);
}
