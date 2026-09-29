// Local observation only: never loads, starts, pauses or replaces audio.
import { Alert, AppState, NativeModules, NativeEventEmitter, Platform, TurboModuleRegistry } from "react-native";
import { getPlaybackCriticalLogs, subscribePlaybackCriticalLogs } from "./playbackCriticalLogs";
import { getLockscreenPlaybackDiagnosticLogs, subscribeLockscreenPlaybackDiagnostics } from "./lockscreenPlaybackDiagnostics";
import { getNowPlayingSnapshot } from "./nowPlayingStore";

const globals = globalThis as typeof globalThis & { __htHarnessDispose?: () => void; __htTrace?: (event: string, details?: Record<string, unknown>) => void };
globals.__htHarnessDispose?.();
delete globals.__htTrace;
const native = Platform.OS === "ios" ? (NativeModules.HiddenAudioModule || NativeModules.HiddenAudio) : undefined;
const source = TurboModuleRegistry.get("SourceCode") as { getConstants?: () => { scriptURL?: string } } | null;
const scriptURL = String(source?.getConstants?.().scriptURL || NativeModules.SourceCode?.scriptURL || "");
const endpoint = scriptURL.match(/^http:\/\/(?:localhost|127\.0\.0\.1|10\.[\d.]+|192\.168\.[\d.]+|172\.(?:1[6-9]|2\d|3[01])\.[\d.]+):8081\//)
  ? `${scriptURL.split('/').slice(0, 3).join('/')}/__ht_harness`
  : null;
const required = ["setup", "loadTrack", "play", "pause", "stop", "seekTo", "setVolume", "getState", "getProgress", "getActiveTrack", "addListener", "removeListeners"];
let disposed = false;
let inFlight = false;
let sequence = 0;
const pending: object[] = [];
const removers: (() => void)[] = [];
let transportErrorShown = false;
function emit(event: string, details: Record<string, unknown> = {}) {
  if (disposed || !endpoint || Platform.OS !== "ios") return;
  const safe: Record<string, unknown> = {};
  for (const key of ["songId", "trackId", "status", "route", "engine", "isPlaying", "urlHost", "urlScheme", "positionSeconds", "positionMillis", "ticks", "over80", "over250", "maxDelayMs", "touchDownToHandlerMs", "touchDownToDispatchMs", "touchDownToFirstFrameMs"]) {
    const value = details[key];
    if (typeof value === "number" || typeof value === "boolean") safe[key] = value;
    else if (typeof value === "string" && value.length < 100 && !value.includes('://')) safe[key] = value;
  }
  pending.push({ at: Date.now(), sequence: ++sequence, event, details: safe });
  if (pending.length > 100) pending.shift();
  void flush();
}
globals.__htTrace = emit;
const timerWindow = { status: "", ticks: 0, over80: 0, over250: 0, maxDelayMs: 0, startedAt: Date.now() };
let lastTimerTick = Date.now();
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
  if (timerWindow.status && (timerWindow.status !== status || now - timerWindow.startedAt >= 10_000)) {
    emit("js_timer_window", timerWindow);
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
  try {
    const emitter = new NativeEventEmitter(native);
    const allowed = new Set(["hidden_audio_native_load_start", "hidden_audio_native_player_created", "hidden_audio_native_playing_confirmed", "hidden_audio_playback_buffer_empty", "hidden_audio_playback_likely_to_keep_up", "hidden_audio_time_control_status"]);
    removers.push(() => subscription.remove());
    const subscription = emitter.addListener("HiddenAudioDiagnostic", (payload) => {
      const event = String(payload?.eventName || "");
      if (allowed.has(event)) emit(event, payload.data || {});
    });
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
globals.__htHarnessDispose = () => { disposed = true; delete globals.__htTrace; removers.forEach((remove) => remove()); pending.length = 0; };
