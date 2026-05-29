import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  HiddenAudioController,
  type HiddenAudioEvent,
  type HiddenAudioProgress,
  type HiddenAudioState,
  type HiddenAudioTrack,
} from "../services/hiddenAudio/HiddenAudioController";
import { isHiddenAudioModuleAvailable } from "../services/hiddenAudio/HiddenAudioModule";

const TEST_TRACK: HiddenAudioTrack = {
  id: "hidden-audio-poc-remote-mp3",
  title: "Hidden Audio POC",
  artist: "Hidden Tunes",
  url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
};

const idleState: HiddenAudioState = {
  status: "idle",
  activeTrack: null,
  queue: {
    tracks: [],
    activeIndex: -1,
  },
  error: null,
};

const idleProgress: HiddenAudioProgress = {
  positionSeconds: 0,
  durationSeconds: 0,
  bufferedSeconds: 0,
};

function formatSeconds(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function HiddenAudioTestScreen() {
  const [audioState, setAudioState] = useState<HiddenAudioState>(idleState);
  const [progress, setProgress] = useState<HiddenAudioProgress>(idleProgress);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nativeAvailable = isHiddenAudioModuleAvailable();

  const appendLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((current) => [`${timestamp} ${message}`, ...current].slice(0, 60));
  }, []);

  const refresh = useCallback(async () => {
    const [nextState, nextProgress] = await Promise.all([
      HiddenAudioController.getState(),
      HiddenAudioController.getProgress(),
    ]);
    setAudioState(nextState);
    setProgress(nextProgress);
  }, []);

  useEffect(() => {
    appendLog(`native module available: ${nativeAvailable ? "yes" : "no"}`);
    void refresh().catch((refreshError) => {
      appendLog(`refresh error: ${String(refreshError)}`);
    });

    const unsubscribe = HiddenAudioController.subscribe((event: HiddenAudioEvent) => {
      appendLog(`event:${event.type}`);

      if (event.type === "state") {
        setAudioState(event.state);
      } else if (event.type === "progress") {
        setProgress(event.progress);
      } else if (event.type === "error") {
        setError(event.message);
      }
    });

    return unsubscribe;
  }, [appendLog, nativeAvailable, refresh]);

  const run = useCallback(
    async (label: string, action: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      appendLog(`${label}:start`);
      try {
        await action();
        await refresh();
        appendLog(`${label}:complete`);
      } catch (runError) {
        const message = String((runError as Error)?.message || runError);
        setError(message);
        appendLog(`${label}:error ${message}`);
      } finally {
        setBusy(false);
      }
    },
    [appendLog, refresh]
  );

  const statusLabel = useMemo(() => {
    if (busy) return "working";
    return audioState.status;
  }, [audioState.status, busy]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Hidden Tunes Audio Core</Text>
          <Text style={styles.title}>Native Playback POC</Text>
          <Text style={styles.subtitle}>
            One remote MP3 through HiddenAudioModule. Lock the phone and leave it
            playing for 30 minutes.
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{TEST_TRACK.title}</Text>
          <Text style={styles.meta}>Native module: {nativeAvailable ? "available" : "missing"}</Text>
          <Text style={styles.meta}>State: {statusLabel}</Text>
          <Text style={styles.meta}>
            Progress: {formatSeconds(progress.positionSeconds)} /{" "}
            {formatSeconds(progress.durationSeconds)}
          </Text>
          <Text style={styles.meta}>
            Active track: {audioState.activeTrack?.title || "none"}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={() => {
              void run("load", async () => {
                await HiddenAudioController.setup();
                await HiddenAudioController.loadTrack(TEST_TRACK);
              });
            }}
          >
            <Text style={styles.buttonText}>Load</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={() => {
              void run("play", () => HiddenAudioController.play());
            }}
          >
            <Text style={styles.buttonText}>Play</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={() => {
              void run("pause", () => HiddenAudioController.pause());
            }}
          >
            <Text style={styles.buttonText}>Pause</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Native Events</Text>
          {logs.map((line, index) => (
            <Text key={`${line}-${index}`} style={styles.logLine}>
              {line}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#050505",
  },
  content: {
    padding: 20,
    gap: 18,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: "#D7B46A",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#B8B8B8",
    fontSize: 14,
    lineHeight: 20,
  },
  panel: {
    borderWidth: 1,
    borderColor: "#2B2B2B",
    borderRadius: 8,
    padding: 16,
    backgroundColor: "#101010",
    gap: 7,
  },
  panelTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  meta: {
    color: "#D8D8D8",
    fontSize: 14,
  },
  error: {
    color: "#FF8F8F",
    fontSize: 13,
    marginTop: 8,
  },
  controls: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#D7B46A",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: "#111111",
    fontSize: 14,
    fontWeight: "800",
  },
  logLine: {
    color: "#CFCFCF",
    fontSize: 12,
    lineHeight: 17,
  },
});
