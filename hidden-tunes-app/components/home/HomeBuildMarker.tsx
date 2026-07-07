import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "../../constants/theme";
import { getBuildMarkerInfo } from "../../utils/buildMarker";

export const HomeBuildMarker = memo(function HomeBuildMarker() {
  const info = getBuildMarkerInfo();

  return (
    <View style={styles.wrap}>
      <Text style={styles.line}>
        v{info.version} · {info.buildProfile} · {info.gitCommit}
      </Text>
      <Text ellipsizeMode="middle" numberOfLines={1} style={styles.apiLine}>
        {info.apiUrl}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    marginHorizontal: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  line: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  apiLine: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
    opacity: 0.85,
  },
});
