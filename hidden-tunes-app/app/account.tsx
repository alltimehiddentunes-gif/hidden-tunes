import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS, GRADIENTS } from "../constants/theme";
import {
  deleteCurrentAccount,
  getCurrentSupabaseSessionSummary,
  signOutArtistSession,
} from "../services/mobileSupabaseAuth";

const CONFIRMATION = "DELETE MY ACCOUNT";

export default function AccountScreen() {
  const [email, setEmail] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getCurrentSupabaseSessionSummary().then((session) => {
      setEmail(session.email);
      setSignedIn(session.isSignedIn);
    });
  }, []);

  async function signOut() {
    setBusy(true);
    const result = await signOutArtistSession();
    setBusy(false);
    if (result.error) {
      Alert.alert("Sign out failed", result.error);
      return;
    }
    router.replace("/auth");
  }

  function confirmDeletion() {
    Alert.alert(
      "Delete account permanently?",
      "This removes your authenticated account and account-owned server data. Local files and downloads on this device may remain until you clear them or uninstall Hidden Tunes.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: () => void deleteAccount() },
      ]
    );
  }

  async function deleteAccount() {
    setBusy(true);
    const result = await deleteCurrentAccount();
    setBusy(false);
    if (result.error) {
      Alert.alert("Account deletion failed", result.error);
      return;
    }
    Alert.alert("Account deleted", "Your Hidden Tunes account has been deleted.", [
      { text: "Continue", onPress: () => router.replace("/auth") },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Account" }} />
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <View style={styles.content}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Account</Text>
          <Text style={styles.subtitle}>
            Manage your Hidden Tunes session and account data.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Signed-in email</Text>
            <Text style={styles.email}>{signedIn ? email || "Authenticated account" : "Not signed in"}</Text>
          </View>

          {signedIn ? (
            <>
              <TouchableOpacity style={styles.secondaryButton} onPress={signOut} disabled={busy}>
                {busy ? <ActivityIndicator color={COLORS.text} /> : <Text style={styles.secondaryText}>Sign out</Text>}
              </TouchableOpacity>

              <View style={styles.dangerCard}>
                <Text style={styles.dangerTitle}>Delete account</Text>
                <Text style={styles.dangerText}>
                  This is permanent. Account-owned server data will be deleted after authenticated confirmation. Recent sign-in may be required.
                </Text>
                <TextInput
                  value={confirmation}
                  onChangeText={setConfirmation}
                  autoCapitalize="characters"
                  placeholder={CONFIRMATION}
                  placeholderTextColor="#9f7b86"
                  style={styles.confirmationInput}
                />
                <TouchableOpacity
                  style={[styles.deleteButton, confirmation !== CONFIRMATION && styles.disabledButton]}
                  onPress={confirmDeletion}
                  disabled={busy || confirmation !== CONFIRMATION}
                >
                  <Text style={styles.deleteText}>Delete My Account</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace("/auth")}>
              <Text style={styles.primaryText}>Sign in</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, padding: 22, paddingTop: 60 },
  backButton: { alignSelf: "flex-start", marginBottom: 24 },
  backText: { color: COLORS.primary, fontSize: 16, fontWeight: "800" },
  title: { color: COLORS.text, fontSize: 32, fontWeight: "900" },
  subtitle: { color: COLORS.textMuted, fontSize: 14, lineHeight: 22, marginTop: 8, marginBottom: 24 },
  card: { borderRadius: 22, padding: 18, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  label: { color: COLORS.textMuted, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1 },
  email: { color: COLORS.text, fontSize: 16, fontWeight: "800", marginTop: 8 },
  primaryButton: { height: 54, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryText: { color: "#000", fontSize: 15, fontWeight: "900" },
  secondaryButton: { height: 54, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginTop: 18 },
  secondaryText: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  dangerCard: { marginTop: 28, borderRadius: 22, padding: 18, backgroundColor: "rgba(127,29,29,0.2)", borderWidth: 1, borderColor: "rgba(248,113,113,0.35)" },
  dangerTitle: { color: "#fecaca", fontSize: 18, fontWeight: "900" },
  dangerText: { color: "#fecaca", fontSize: 13, lineHeight: 20, marginTop: 8 },
  confirmationInput: { height: 50, borderRadius: 16, marginTop: 16, paddingHorizontal: 14, color: COLORS.text, backgroundColor: "rgba(0,0,0,0.2)", borderWidth: 1, borderColor: "rgba(248,113,113,0.35)", fontWeight: "800" },
  deleteButton: { height: 50, borderRadius: 16, marginTop: 12, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" },
  disabledButton: { opacity: 0.45 },
  deleteText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
