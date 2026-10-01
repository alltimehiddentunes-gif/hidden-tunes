import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

type NativePerfModule = {
  getPerformanceSnapshot?: () => Promise<Record<string, unknown>>;
  resetPerformanceSnapshot?: () => Promise<void>;
  getDiagnosticSnapshot?: () => Promise<Record<string, unknown>>;
};

function nativeModule(): NativePerfModule | null {
  if (Platform.OS !== "ios" || Constants.expoConfig?.extra?.isDevClientBuild !== true) return null;
  return (NativeModules.HiddenAudioModule as NativePerfModule | undefined) ?? null;
}

export async function resetIos217NativePerf(): Promise<void> {
  const native = nativeModule();
  if (!native?.resetPerformanceSnapshot) throw new Error("217 native performance recorder is unavailable");
  await native.resetPerformanceSnapshot();
}

export async function readIos217NativePerf(): Promise<string> {
  const native = nativeModule();
  if (!native?.getPerformanceSnapshot) return "nativeRecorder=unavailable";
  const [perf, playback] = await Promise.all([
    native.getPerformanceSnapshot(),
    native.getDiagnosticSnapshot?.().catch(() => null) ?? Promise.resolve(null),
  ]);
  return `nativeRecorder=${JSON.stringify(perf)}\nnativePlayback=${JSON.stringify(playback ?? "unavailable")}`;
}
