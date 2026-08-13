import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { router } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";
import { establishPasswordRecoverySession, updatePassword } from "../services/mobileSupabaseAuth";

export default function ResetPasswordScreen() {
  const incomingUrl = Linking.useURL();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!incomingUrl) return;
    void establishPasswordRecoverySession(incomingUrl).then((result) => {
      if (!active) return;
      setMessage(result.error || "");
      setReady(!result.error);
    });
    return () => { active = false; };
  }, [incomingUrl]);

  async function submit() {
    if (password.length < 8) {
      setMessage("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    const result = await updatePassword(password);
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setPassword("");
    setConfirmation("");
    setMessage("Password updated. You can now continue securely.");
    setReady(false);
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardView}>
        <View style={styles.card}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>Choose a new password for your Hidden Tunes account.</Text>
          {!incomingUrl ? <ActivityIndicator color={COLORS.primary} /> : ready ? (
            <>
              <View style={styles.inputBox}><Ionicons name="lock-closed-outline" size={20} color={COLORS.textMuted} /><TextInput value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor={COLORS.textMuted} style={styles.input} secureTextEntry autoComplete="new-password" /></View>
              <View style={styles.inputBox}><Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textMuted} /><TextInput value={confirmation} onChangeText={setConfirmation} placeholder="Confirm new password" placeholderTextColor={COLORS.textMuted} style={styles.input} secureTextEntry autoComplete="new-password" /></View>
              <TouchableOpacity disabled={busy} style={[styles.mainButton, busy && styles.disabled]} onPress={() => void submit()}>{busy ? <ActivityIndicator color="#000" /> : <Text style={styles.mainButtonText}>Update password</Text>}</TouchableOpacity>
            </>
          ) : null}
          {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
          {!ready ? <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace("/auth")}><Text style={styles.secondaryText}>{message.startsWith("Password updated") ? "Continue to sign in" : "Request a new link"}</Text></TouchableOpacity> : null}
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background }, keyboardView: { flex: 1, justifyContent: "center", padding: 22 }, card: { borderRadius: 34, padding: 22, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  title: { color: COLORS.text, fontSize: 30, fontWeight: "900" }, subtitle: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21, fontWeight: "600", marginTop: 8, marginBottom: 22 },
  inputBox: { height: 56, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 14 }, input: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "700", marginLeft: 10 },
  mainButton: { height: 56, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginTop: 8 }, disabled: { opacity: 0.6 }, mainButtonText: { color: "#000", fontSize: 16, fontWeight: "900" }, message: { color: "#fca5a5", fontSize: 13, lineHeight: 19, marginTop: 14 }, secondaryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 12 }, secondaryText: { color: COLORS.primary, fontSize: 14, fontWeight: "800" },
});
