// Diagnostic-only UI frame-gap sample. It makes no playback or navigation calls.
import { useFrameCallback, useSharedValue, runOnJS } from "react-native-reanimated";

function report(frames: number, over50: number, over250: number, maxFrameMs: number) {
  (globalThis as typeof globalThis & {
    __htTrace?: (event: string, details?: Record<string, unknown>) => void;
  }).__htTrace?.("ui_frame_window", { frames, over50, over250, maxFrameMs: Math.round(maxFrameMs) });
}

export default function MetroFrameProbe() {
  const startedAt = useSharedValue(0);
  const frames = useSharedValue(0);
  const over50 = useSharedValue(0);
  const over250 = useSharedValue(0);
  const maxFrameMs = useSharedValue(0);

  useFrameCallback((frame) => {
    "worklet";
    const gap = frame.timeSincePreviousFrame ?? 0;
    if (!startedAt.value) startedAt.value = frame.timestamp;
    frames.value += 1;
    if (gap > 50) over50.value += 1;
    if (gap > 250) over250.value += 1;
    maxFrameMs.value = Math.max(maxFrameMs.value, gap);
    if (frame.timestamp - startedAt.value < 1_000) return;
    runOnJS(report)(frames.value, over50.value, over250.value, maxFrameMs.value);
    startedAt.value = frame.timestamp;
    frames.value = over50.value = over250.value = maxFrameMs.value = 0;
  });
  return null;
}
