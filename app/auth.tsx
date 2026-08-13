import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";
import {
  getCurrentSupabaseSessionSummary,
  requestMagicLink,
  resendSignUpConfirmation,
  signInWithPassword,
  requestPasswordReset,
  signOutSession,
  signUpWithPassword,
} from "../services/mobileSupabaseAuth";
import { safeRouterBack } from "../utils/safeNavigation";

function safeReturnPath(value: unknown) {
  const path = String(value || "");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/profile";
}

export default function AuthScreen() {
  const { returnTo, reason } = useLocalSearchParams();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);

  useEffect(() => {
    let active = true;
    void getCurrentSupabaseSessionSummary().then((session) => {
      if (!active) return;
      setSessionEmail(session.email);
      setMessage(session.error || "");
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const finish = () => router.replace(safeReturnPath(returnTo) as never);

  async function submit() {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setMessage("Enter your email and password.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        const result = await signInWithPassword(cleanEmail, password);
        if (result.error || !result.email) throw new Error(result.error || "Could not sign in.");
        setSessionEmail(result.email);
        setPassword("");
        finish();
      } else {
        const result = await signUpWithPassword(cleanEmail, password, displayName);
        if (result.error || !result.email) throw new Error(result.error || "Could not create account.");
        setPassword("");
        if (result.requiresEmailVerification) {
          setMessage("Check your email to verify your Hidden Tunes account, then sign in.");
          setCanResendConfirmation(true);
          setMode("login");
        } else {
          setSessionEmail(result.email);
          finish();
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    const result = await signOutSession();
    setBusy(false);
    if (result.error) {
      Alert.alert("Could not sign out", result.error);
      return;
    }
    setSessionEmail(null);
    setMessage("Signed out of Hidden Tunes.");
  }

  async function forgotPassword() {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage("Enter your email address first.");
      return;
    }
    setBusy(true);
    setMessage("");
    const result = await requestPasswordReset(cleanEmail);
    setBusy(false);
    setMessage(result.error || "Check your email for a secure password reset link.");
  }

  async function sendMagicLink() {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage("Enter your email address first.");
      return;
    }
    setBusy(true);
    setMessage("");
    const result = await requestMagicLink(cleanEmail, safeReturnPath(returnTo));
    setBusy(false);
    setMessage(result.error || "Check your email for a secure Hidden Tunes sign-in link.");
  }

  async function resendConfirmation() {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage("Enter the email address used to create your account.");
      return;
    }
    setBusy(true);
    setMessage("");
    const result = await resendSignUpConfirmation(cleanEmail);
    setBusy(false);
    setMessage(result.error || "Check your email for a new confirmation link.");
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <TouchableOpacity accessibilityLabel="Go back" style={styles.backButton} onPress={() => safeRouterBack("/profile")}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.logoBox}>
          <Image source={require("../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brand}>Hidden Tunes</Text>
        </View>
        <View style={styles.card}>
          {loading ? <ActivityIndicator color={COLORS.primary} /> : sessionEmail ? (
            <>
              <Text style={styles.title}>Account ready</Text>
              <Text style={styles.subtitle}>Signed in as {sessionEmail}. Artist capabilities never replace this listener account.</Text>
              <TouchableOpacity style={styles.mainButton} onPress={finish}>
                <Text style={styles.mainButtonText}>{reason === "follow" ? "Return to artist" : "Continue"}</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={busy} style={styles.switchButton} onPress={() => void signOut()}>
                <Text style={styles.switchText}>Sign out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>{mode === "login" ? "Welcome back" : "Create account"}</Text>
              <Text style={styles.subtitle}>{reason === "follow" ? "Sign in with your normal Hidden Tunes account to follow this artist." : "One account for listening, following, and any approved artist capabilities."}</Text>
              <Text style={styles.methodTitle}>Continue with Email</Text>
              <View style={styles.inputBox}><Ionicons name="mail-outline" size={20} color={COLORS.textMuted} /><TextInput accessibilityLabel="Email address" value={email} onChangeText={(value) => { setEmail(value); setMessage(""); }} placeholder="Email" placeholderTextColor={COLORS.textMuted} style={styles.input} keyboardType="email-address" autoCapitalize="none" autoComplete="email" /></View>
              <View style={styles.inputBox}><Ionicons name="lock-closed-outline" size={20} color={COLORS.textMuted} /><TextInput accessibilityLabel="Password" value={password} onChangeText={(value) => { setPassword(value); setMessage(""); }} placeholder="Password" placeholderTextColor={COLORS.textMuted} style={styles.input} secureTextEntry={!showPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} /><TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} onPress={() => setShowPassword((value) => !value)}><Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={COLORS.textMuted} /></TouchableOpacity></View>
              {mode === "login" ? <TouchableOpacity disabled={busy} style={styles.forgotButton} onPress={() => void forgotPassword()}><Text style={styles.forgotText}>Forgot password?</Text></TouchableOpacity> : null}
              {mode === "signup" ? <View style={styles.inputBox}><Ionicons name="person-outline" size={20} color={COLORS.textMuted} /><TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor={COLORS.textMuted} style={styles.input} /></View> : null}
              {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
              <TouchableOpacity disabled={busy} activeOpacity={0.85} style={[styles.mainButton, busy && styles.disabled]} onPress={() => void submit()}>
                {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.mainButtonText}>{mode === "login" ? "Sign in" : "Create account"}</Text>}
              </TouchableOpacity>
              {mode === "login" ? <TouchableOpacity disabled={busy} style={styles.outlineButton} onPress={() => void sendMagicLink()}><Ionicons name="mail-unread-outline" size={20} color={COLORS.primary} /><Text style={styles.outlineButtonText}>Send me a sign-in link</Text></TouchableOpacity> : null}
              {canResendConfirmation && mode === "login" ? <TouchableOpacity disabled={busy} style={styles.switchButton} onPress={() => void resendConfirmation()}><Text style={styles.switchText}>Resend confirmation email</Text></TouchableOpacity> : null}
              <TouchableOpacity style={styles.switchButton} onPress={() => { setMessage(""); setMode(mode === "login" ? "signup" : "login"); }}><Text style={styles.switchText}>{mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}</Text></TouchableOpacity>
            </>
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background }, keyboardView: { flex: 1 }, scrollContent: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 58, paddingBottom: 30 },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  logoBox: { alignItems: "center", marginTop: 24, marginBottom: 24 }, logo: { width: 90, height: 90 }, brand: { color: COLORS.text, fontSize: 25, fontWeight: "900", marginTop: 8 },
  card: { borderRadius: 34, padding: 22, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  title: { color: COLORS.text, fontSize: 30, fontWeight: "900" }, subtitle: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21, fontWeight: "600", marginTop: 8, marginBottom: 22 },
  methodTitle: { color: COLORS.text, fontSize: 15, fontWeight: "900", marginBottom: 12 },
  inputBox: { height: 56, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 14 },
  input: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "700", marginLeft: 10 }, message: { color: "#fca5a5", fontSize: 13, lineHeight: 19, marginBottom: 10 },
  mainButton: { height: 56, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginTop: 8 }, disabled: { opacity: 0.6 }, mainButtonText: { color: "#000", fontSize: 16, fontWeight: "900" },
  switchButton: { marginTop: 18, alignItems: "center", minHeight: 44, justifyContent: "center" }, switchText: { color: COLORS.primary, fontSize: 14, fontWeight: "800" },
  forgotButton: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center", marginTop: -8 }, forgotText: { color: COLORS.primary, fontSize: 14, fontWeight: "800" },
  outlineButton: { height: 54, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", marginTop: 14 }, outlineButtonText: { color: COLORS.primary, fontSize: 15, fontWeight: "900" },
});
