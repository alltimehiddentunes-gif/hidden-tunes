import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  getVerificationReport,
  isPerformanceVerificationEnabled,
  logVerificationReport,
  startLongTaskMonitor,
  stopLongTaskMonitor,
} from "../utils/performanceVerification";

export default memo(function PerformanceOverlay() {
  const [snapshot, setSnapshot] = useState(() =>
    isPerformanceVerificationEnabled() ? getVerificationReport() : null
  );

  useEffect(() => {
    if (!isPerformanceVerificationEnabled()) return;

    startLongTaskMonitor();

    const interval = setInterval(() => {
      setSnapshot(getVerificationReport());
    }, 4000);

    return () => {
      clearInterval(interval);
      stopLongTaskMonitor();
    };
  }, []);

  const handlePress = useCallback(() => {
    const report = logVerificationReport("overlay_tap");
    if (report) {
      setSnapshot(report);
    }
  }, []);

  if (!isPerformanceVerificationEnabled() || !snapshot) {
    return null;
  }

  const homeOpen = snapshot.screenOpens.home;
  const searchMs = snapshot.searchFirstResultMs;
  const tapMs = snapshot.tapToAudioStartMs;
  const playerRpm = snapshot.rerendersPerMinute.player;
  const homeRpm = snapshot.rerendersPerMinute.home;

  return (
    <Pressable style={styles.overlay} onPress={handlePress}>
      <Text style={styles.title}>Perf Verify</Text>
      <Text style={styles.line}>Home {homeOpen ? `${homeOpen}ms` : "—"}</Text>
      <Text style={styles.line}>Search {searchMs ? `${searchMs}ms` : "—"}</Text>
      <Text style={styles.line}>Tap→audio {tapMs ? `${tapMs}ms` : "—"}</Text>
      <Text style={styles.line}>
        Renders/min P{playerRpm} H{homeRpm}
      </Text>
      <Text style={styles.line}>
        JS&gt;80ms {snapshot.longJsTaskWarnings} · Jank {snapshot.scrollJankWarnings}
      </Text>
      <Text style={styles.hint}>Tap for full report</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 52,
    right: 10,
    zIndex: 9999,
    backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.45)",
    maxWidth: 168,
  },
  title: {
    color: "#c084fc",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  line: {
    color: "#f5f5f5",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
  },
  hint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    marginTop: 4,
  },
});
