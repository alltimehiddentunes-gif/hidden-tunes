import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { COLORS } from "../constants/theme";

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class AppScreenErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Production crash reporting is not configured. Do not log private state here.
  }

  private recover = () => {
    try {
      router.replace("/music-feed" as any);
      this.setState({ failed: false });
    } catch {
      // Keep the recovery UI mounted if navigation itself is unavailable.
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <View accessibilityRole="alert" style={styles.container}>
        <Text style={styles.title}>Hidden Tunes hit a screen error</Text>
        <Text style={styles.body}>
          Your playback session was left intact. Return home and try that screen again.
        </Text>
        <Pressable accessibilityRole="button" onPress={this.recover} style={styles.button}>
          <Text style={styles.buttonText}>Return Home</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    padding: 28,
  },
  title: { color: COLORS.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  body: { color: COLORS.textMuted, fontSize: 15, lineHeight: 22, marginTop: 12, textAlign: "center" },
  button: { backgroundColor: COLORS.primary, borderRadius: 999, marginTop: 22, paddingHorizontal: 24, paddingVertical: 13 },
  buttonText: { color: "#000", fontSize: 15, fontWeight: "800" },
});
