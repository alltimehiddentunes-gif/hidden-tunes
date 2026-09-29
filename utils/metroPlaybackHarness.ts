// Local observation only: never loads, starts, pauses or replaces audio.
import { Alert, AppState, NativeModules, NativeEventEmitter, Platform, TurboModuleRegistry } from "react-native";
import { getPlaybackCriticalLogs, subscribePlaybackCriticalLogs } from "./playbackCriticalLogs";
import { getLockscreenPlaybackDiagnosticLogs, subscribeLockscreenPlaybackDiagnostics } from "./lockscreenPlaybackDiagnostics";
import { getNowPlayingSnapshot } from "./nowPlayingStore";
import type { MetroRenderSurface } from "./metroRenderProbe";

const globals = globalThis as typeof globalThis & { __htHarnessDispose?: () => void; __htTrace?: (event: string, details?: Record<string, unknown>) => void; __htMarkRender?: (surface: MetroRenderSurface) => void; __htProviderDuration?: (durationMs: number) => void; __htCountPlayback?: (kind: string) => void };
globals.__htHarnessDispose?.();
delete globals.__htTrace;
delete globals.__htMarkRender;
delete globals.__htProviderDuration;
delete globals.__htCountPlayback;
const native = Platform.OS === "ios" ? (NativeModules.HiddenAudioModule || NativeModules.HiddenAudio) : undefined;
const source = TurboModuleRegistry.get("SourceCode") as { getConstants?: () => { scriptURL?: string } } | null;
const scriptURL = String(source?.getConstants?.().scriptURL || NativeModules.SourceCode?.scriptURL || "");
const endpoint = scriptURL.match(/^http:\/\/(?:localhost|127\.0\.0\.1|10\.[\d.]+|192\.168\.[\d.]+|172\.(?:1[6-9]|2\d|3[01])\.[\d.]+):8081\//)
  ? `${scriptURL.split('/').slice(0, 3).join('/')}/__ht_harness`
  : null;
const required = ["setup", "loadTrack", "play", "pause", "stop", "seekTo", "setVolume", "getState", "getProgress", "getActiveTrack", "addListener", "removeListeners"];
// Change one value between Metro reloads; the native module is never altered by OTA.
const requestedNativeMode = "normal";
let disposed = false;
let inFlight = false;
let sequence = 0;
const pending: object[] = [];
const removers: (() => void)[] = [];
let transportErrorShown = false;
function emit(event: string, details: Record<string, unknown> = {}) {
  if (disposed || !endpoint || Platform.OS !== "ios") return;
  const safe: Record<string, unknown> = {};
  for (const key of ["songId", "trackId", "status", "route", "engine", "isPlaying", "urlHost", "urlScheme", "positionSeconds", "positionMillis", "ticks", "over80", "over250", "maxDelayMs", "elapsedMs", "nativeProgress", "nativeState", "nativeDiagnostics", "nativeBuffer", "nativeTimeControl", "nativeRate", "nativeNowPlayingNotice", "jsProgressCallback", "jsProgressApplied", "jsProgressSuppressed", "positionWrites", "durationWrites", "playingWrites", "touchDownToHandlerMs", "touchDownToDispatchMs", "touchDownToFirstFrameMs", "playerProvider", "stateConsumer", "actionsConsumer", "progressConsumer", "trackStatusActive", "trackStatusInactive", "appShell", "miniPlayer", "miniProgress", "providerTotalMs", "providerMaxMs", "frames", "over50", "maxFrameMs", "mode", "elapsedSeconds", "playerRate", "periodicObserverActive", "periodicCallbacks", "periodicObserverInstalls", "periodicObserverRemovals", "periodicP50Ms", "periodicP95Ms", "periodicMaxMs", "progressEmitP95Ms", "progressEmitMaxMs", "endFallbackP95Ms", "endFallbackMaxMs", "confirmPlayingP95Ms", "confirmPlayingMaxMs", "nowPlayingCalls", "nowPlayingWrites", "nowPlayingOnMain", "nowPlayingP50Ms", "nowPlayingP95Ms", "nowPlayingMaxMs", "nowPlayingWriteP50Ms", "nowPlayingWriteP95Ms", "nowPlayingWriteMaxMs", "itemEndObserverActive", "itemStatusObserverActive", "timeControlObserverActive", "rateObserverActive", "loadedRangesObserverActive", "bufferEmptyObserverActive", "likelyToKeepUpObserverActive", "remoteCommandsRegistered", "lifecycleObserversRegistered", "audioSessionCalls", "setCategoryCalls", "setActiveCalls"]) {
    const value = details[key];
    if (typeof value === "number" || typeof value === "boolean") safe[key] = value;
    else if (typeof value === "string" && value.length < 100 && !value.includes('://')) safe[key] = value;
  }
  pending.push({ at: Date.now(), sequence: ++sequence, event, details: safe });
  if (pending.length > 100) pending.shift();
  void flush();
}
globals.__htTrace = emit;
const renderCounts = {
  playerProvider: 0, stateConsumer: 0, actionsConsumer: 0, progressConsumer: 0,
  trackStatusActive: 0, trackStatusInactive: 0, appShell: 0, miniPlayer: 0, miniProgress: 0,
};
globals.__htMarkRender = (surface) => { renderCounts[surface] += 1; };
let providerTotalMs = 0;
let providerMaxMs = 0;
globals.__htProviderDuration = (durationMs) => {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  providerTotalMs += durationMs;
  providerMaxMs = Math.max(providerMaxMs, durationMs);
};
const playbackCounts: Record<string, number> = {
  nativeProgress: 0, nativeState: 0, nativeDiagnostics: 0, nativeBuffer: 0,
  nativeTimeControl: 0, nativeRate: 0, nativeNowPlayingNotice: 0,
  jsProgressCallback: 0, jsProgressApplied: 0, jsProgressSuppressed: 0,
  positionWrites: 0, durationWrites: 0, playingWrites: 0,
};
globals.__htCountPlayback = (kind) => {
  if (Object.prototype.hasOwnProperty.call(playbackCounts, kind)) playbackCounts[kind] += 1;
};
const timerWindow = { status: "", ticks: 0, over80: 0, over250: 0, maxDelayMs: 0, startedAt: Date.now() };
let lastTimerTick = Date.now();
let lastNativeSnapshotAt = 0;
const timer = setInterval(() => {
  const now = Date.now();
  const delay = Math.max(0, now - lastTimerTick - 100);
  lastTimerTick = now;
  if (AppState.currentState !== "active") {
    timerWindow.status = "";
    timerWindow.ticks = timerWindow.over80 = timerWindow.over250 = timerWindow.maxDelayMs = 0;
    timerWindow.startedAt = now;
    return;
  }
  const playback = getNowPlayingSnapshot();
  const status = playback.isPlaying ? "playing" : playback.currentSongId ? "paused" : "idle";
  if (typeof native?.getDiagnosticSnapshot === "function" &&
      ((status === "playing" && now - lastNativeSnapshotAt >= 10_000) ||
       (timerWindow.status === "playing" && status !== "playing"))) {
    lastNativeSnapshotAt = now;
    void native.getDiagnosticSnapshot()
      .then((snapshot: Record<string, unknown>) => emit("native_diag_snapshot", snapshot))
      .catch(() => emit("native_diag_snapshot_failed"));
  }
  if (timerWindow.status && (timerWindow.status !== status || now - timerWindow.startedAt >= 1_000)) {
    const elapsedMs = now - timerWindow.startedAt;
    emit("js_timer_window", { ...timerWindow, elapsedMs });
    emit("playback_count_window", { status: timerWindow.status, elapsedMs, ...playbackCounts });
    emit("render_window", { status: timerWindow.status, ...renderCounts });
    emit("provider_duration_window", { status: timerWindow.status, providerTotalMs: Math.round(providerTotalMs), providerMaxMs: Math.round(providerMaxMs) });
    providerTotalMs = providerMaxMs = 0;
    for (const key of Object.keys(renderCounts) as MetroRenderSurface[]) renderCounts[key] = 0;
    for (const key of Object.keys(playbackCounts)) playbackCounts[key] = 0;
    timerWindow.ticks = timerWindow.over80 = timerWindow.over250 = timerWindow.maxDelayMs = 0;
    timerWindow.startedAt = now;
  }
  timerWindow.status = status;
  timerWindow.ticks += 1;
  if (delay > 80) timerWindow.over80 += 1;
  if (delay > 250) timerWindow.over250 += 1;
  timerWindow.maxDelayMs = Math.max(timerWindow.maxDelayMs, delay);
}, 100);
removers.push(() => clearInterval(timer));
async function flush() {
  if (inFlight || disposed || !pending.length || !endpoint) return;
  inFlight = true;
  const batch = pending.splice(0, 100);
  try {
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(batch) });
  } catch {
    if (!transportErrorShown && !disposed) {
      transportErrorShown = true;
      Alert.alert("Metro observation transport failed", "The app loaded the harness, but cannot send its read-only native results to the LAN Metro receiver. No playback was changed.");
    }
  }
  finally { inFlight = false; if (!disposed && pending.length) void flush(); }
}
emit(native ? "module_available" : "module_missing");
if (Platform.OS === "ios") {
  Alert.alert("Hidden Tunes Metro baseline", `HiddenAudio: ${native ? "AVAILABLE" : "MISSING"}\nRequired methods: ${required.filter(name => typeof native?.[name] === "function").length}/${required.length}\nLAN observation: ${endpoint ? "configured" : "NO BUNDLE ADDRESS"}\nBaseline: c60594c3 (no optimization)`);
}
for (const method of required) emit(`method_${method}_${typeof native?.[method] === 'function' ? 'present' : 'missing'}`);
if (native) {
  if (typeof native.setDiagnosticMode === "function") {
    void native.setDiagnosticMode(requestedNativeMode)
      .then((result: Record<string, unknown>) => emit("native_diag_mode_ready", result))
      .catch(() => emit("native_diag_mode_failed"));
  } else {
    emit("native_diag_mode_unavailable");
  }
  try {
    const emitter = new NativeEventEmitter(native);
    const allowed = new Set(["hidden_audio_native_load_start", "hidden_audio_native_player_created", "hidden_audio_native_playing_confirmed", "hidden_audio_playback_buffer_empty", "hidden_audio_playback_likely_to_keep_up", "hidden_audio_time_control_status"]);
    removers.push(() => subscription.remove());
    const subscription = emitter.addListener("HiddenAudioDiagnostic", (payload) => {
      globals.__htCountPlayback?.("nativeDiagnostics");
      const event = String(payload?.eventName || "");
      if (event.includes("loaded_time_ranges") || event.includes("buffer")) globals.__htCountPlayback?.("nativeBuffer");
      if (event.includes("time_control")) globals.__htCountPlayback?.("nativeTimeControl");
      if (event.includes("rate_changed")) globals.__htCountPlayback?.("nativeRate");
      if (event.includes("now_playing_elapsed_updated")) globals.__htCountPlayback?.("nativeNowPlayingNotice");
      if (allowed.has(event)) emit(event, payload.data || {});
    });
    const progressSubscription = emitter.addListener("HiddenAudioProgressChanged", () => globals.__htCountPlayback?.("nativeProgress"));
    const stateSubscription = emitter.addListener("HiddenAudioState", () => globals.__htCountPlayback?.("nativeState"));
    removers.push(() => progressSubscription.remove(), () => stateSubscription.remove());
    emit("emitter_listener_registered");
    void native.getState().then((state: Record<string, unknown>) => emit("native_getState_resolved", state)).catch(() => emit("native_getState_rejected"));
  } catch { emit("native_probe_error"); }
}
let lastCritical = "";
removers.push(subscribePlaybackCriticalLogs(() => {
  const entry = getPlaybackCriticalLogs().at(-1);
  if (!entry || entry.id === lastCritical) return;
  lastCritical = entry.id;
  emit(entry.event, entry.details);
}));
let lastLockscreen = "";
removers.push(subscribeLockscreenPlaybackDiagnostics(() => {
  const entry = getLockscreenPlaybackDiagnosticLogs().at(-1);
  if (!entry || entry.id === lastLockscreen) return;
  lastLockscreen = entry.id;
  if (/tap|load|engine|play_success|play_failure/.test(entry.event)) emit(entry.event, entry.details);
}));
globals.__htHarnessDispose = () => { disposed = true; delete globals.__htTrace; delete globals.__htMarkRender; delete globals.__htProviderDuration; delete globals.__htCountPlayback; removers.forEach((remove) => remove()); pending.length = 0; };
