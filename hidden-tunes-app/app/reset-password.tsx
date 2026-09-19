import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import * as Linking from "expo-linking";
import { Stack, router } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";
import { getMobileSupabaseClient, updatePassword } from "../services/mobileSupabaseAuth";
import { LinearGradient } from "expo-linear-gradient";

function getLinkParams(url: string) {
  const fragment = url.split("#")[1] || "";
  const query = url.split("?")[1]?.split("#")[0] || "";
  const params = new URLSearchParams(fragment || query);

  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
  };
}

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function acceptResetLink(url?: string | null) {
      const client = getMobileSupabaseClient();
      if (!client) {
        if (active) setMessage("Password reset is not configured in this build.");
        return;
      }

      const params = url ? getLinkParams(url) : { accessToken: null, refreshToken: null };
      if (params.accessToken && params.refreshToken) {
        const { error } = await client.auth.setSession({
          access_token: params.accessToken,
          refresh_token: params.refreshToken,
        });
        if (error) {
          if (active) setMessage("This reset link is invalid or expired. Request a new one.");
          return;
        }
      }

      const { data } = await client.auth.getSession();
      if (active) {
        setReady(Boolean(data.session));
        if (!data.session) setMessage("Open the password-reset link from your email to continue.");
      }
    }

    void Linking.getInitialURL().then(acceptResetLink);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void acceptResetLink(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  async function submit() {
    setMessage("");
    if (!ready) {
      setMessage("Open a valid password-reset link before choosing a new password.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setMessage("Password updated. You can now sign in with your new password.");
    setTimeout(() => router.replace("/auth"), 900);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Reset password" }} />
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.content}
        >
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.subtitle}>
            Password reset links are authenticated by Supabase and expire. Choose at least six characters.
          </Text>

          <View style={styles.inputBox}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="New password"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              secureTextEntry
            />
          </View>
          <View style={styles.inputBox}>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              secureTextEntry
            />
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <TouchableOpacity style={styles.button} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Update Password</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.backButton} onPress={() => router.replace("/auth")}>
            <Text style={styles.backText}>Back to sign in</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, justifyContent: "center", padding: 22 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: "900" },
  subtitle: { color: COLORS.textMuted, fontSize: 14, lineHeight: 22, marginTop: 10, marginBottom: 26 },
  inputBox: { height: 56, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", justifyContent: "center", paddingHorizontal: 16, marginBottom: 14 },
  input: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  message: { color: "#fca5a5", fontSize: 13, lineHeight: 19, fontWeight: "700", marginBottom: 14 },
  button: { height: 56, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#000", fontSize: 16, fontWeight: "900" },
  backButton: { alignItems: "center", marginTop: 18 },
  backText: { color: COLORS.primary, fontSize: 14, fontWeight: "800" },
});
