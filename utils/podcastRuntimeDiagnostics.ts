import { isDevEnvironment } from "./devDiagnostics";

export const ENABLE_PODCAST_RUNTIME_DIAGNOSTICS = false;

export function isPodcastRuntimeDiagnosticsEnabled() {
  return isDevEnvironment() && ENABLE_PODCAST_RUNTIME_DIAGNOSTICS;
}

type PodcastRuntimePayload = Record<string, string | number | boolean | null | undefined>;

export function logPodcastRuntime(event: string, payload: PodcastRuntimePayload = {}) {
  if (!isPodcastRuntimeDiagnosticsEnabled()) return;
  console.log("[HTPodcastRuntime]", event, { at: Date.now(), ...payload });
}
