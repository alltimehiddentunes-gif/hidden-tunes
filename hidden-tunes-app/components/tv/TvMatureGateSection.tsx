import { memo, useCallback } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/theme";
import { setMatureTvEnabled } from "@/services/matureTvPreferences";

type TvMatureGateSectionProps = {
  matureEnabled: boolean;
  onMatureEnabledChange: (enabled: boolean) => void;
  hasActiveMatureChannels: boolean;
};

function TvMatureGateSection({
  matureEnabled,
  onMatureEnabledChange,
  hasActiveMatureChannels,
}: TvMatureGateSectionProps) {
  const handleToggle = useCallback(
    (next: boolean) => {
      if (next) {
        Alert.alert(
          "Enable Mature TV 18+",
          "You must be 18 or older to enable Mature TV. Only verified licensed sources will appear when providers are added.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "I am 18+",
              onPress: () => {
                onMatureEnabledChange(true);
                void setMatureTvEnabled(true);
              },
            },
          ]
        );
        return;
      }

      onMatureEnabledChange(false);
      void setMatureTvEnabled(false);
    },
    [onMatureEnabledChange]
  );

  return (
    <View style={styles.section}>
      <View style={styles.gateCard}>
        <View style={styles.lockIcon}>
          <Ionicons
            name={matureEnabled ? "lock-open-outline" : "lock-closed"}
            size={22}
            color={COLORS.textMuted}
          />
        </View>

        <View style={styles.gateCopy}>
          <Text style={styles.gateTitle}>Mature TV</Text>
          <Text style={styles.gateText}>
            Mature TV is disabled by default and requires 18+ consent. Verified
            licensed sources must be added before playback.
          </Text>
        </View>

        <Switch
          value={matureEnabled}
          onValueChange={handleToggle}
          trackColor={{ false: "#3A3A44", true: COLORS.primary }}
          thumbColor="#fff"
          accessibilityLabel="Enable mature TV"
        />
      </View>

      {!matureEnabled ? (
        <View style={styles.stateCard}>
          <Ionicons name="eye-off-outline" size={28} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>Mature TV is locked</Text>
          <Text style={styles.stateText}>
            Enable Mature TV 18+ to unlock this section when verified channels
            are available.
          </Text>
        </View>
      ) : hasActiveMatureChannels ? null : (
        <View style={styles.stateCard}>
          <Ionicons name="shield-checkmark-outline" size={28} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>No verified mature TV channels are active yet.</Text>
          <Text style={styles.stateText}>
            Licensed providers must be verified before any mature TV playback is
            offered.
          </Text>
        </View>
      )}
    </View>
  );
}

export default memo(TvMatureGateSection);

const styles = StyleSheet.create({
  section: {
    marginTop: 4,
    marginBottom: 18,
  },

  gateCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  lockIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  gateCopy: {
    flex: 1,
  },

  gateTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  gateText: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    marginTop: 4,
  },

  stateCard: {
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 18,
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  stateTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 10,
    textAlign: "center",
  },

  stateText: {
    color: COLORS.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
});
