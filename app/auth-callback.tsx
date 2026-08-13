import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { router } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";
import { consumePendingAuthReturn, establishAuthCallbackSession } from "../services/mobileSupabaseAuth";

export default function AuthCallbackScreen() {
  const incomingUrl = Linking.useURL();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!incomingUrl) return;
    void establishAuthCallbackSession(incomingUrl).then(async (result) => {
      if (!active) return;
      if (result.error) {
        setError(result.error);
        return;
      }
      const returnTo = await consumePendingAuthReturn();
      if (active) router.replace(returnTo as never);
    });
    return () => { active = false; };
  }, [incomingUrl]);

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{error ? "Sign-in link unavailable" : "Signing you in"}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.message}>{error}</Text> : <ActivityIndicator accessibilityLabel="Completing sign in" color={COLORS.primary} size="large" />}
        {error ? <TouchableOpacity style={styles.button} onPress={() => router.replace("/auth")}><Text style={styles.buttonText}>Request a new link</Text></TouchableOpacity> : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: COLORS.background }, card: { borderRadius: 34, padding: 24, alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" }, title: { color: COLORS.text, fontSize: 27, fontWeight: "900", marginBottom: 20 }, message: { color: "#fca5a5", fontSize: 14, lineHeight: 21, textAlign: "center" }, button: { minHeight: 52, borderRadius: 18, backgroundColor: COLORS.primary, alignSelf: "stretch", alignItems: "center", justifyContent: "center", marginTop: 20 }, buttonText: { color: "#000", fontSize: 15, fontWeight: "900" },
});
