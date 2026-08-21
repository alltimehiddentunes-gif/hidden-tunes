import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { lockMaturePodcastSession } from "../utils/maturePodcastSettings";
import { clearCachedArtistFollowStates } from "./artistProfileApi";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || "";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

let cachedClient: SupabaseClient | null = null;
let authSubscriptionStarted = false;
let activeUserId: string | null | undefined;
const authStateListeners = new Set<(userId: string | null) => void>();
const PENDING_AUTH_RETURN_KEY = "hidden-tunes.pending-auth-return";

export type MobileSupabaseSessionSummary = {
  isConfigured: boolean;
  isSignedIn: boolean;
  email: string | null;
  error: string | null;
};

export async function getCurrentSupabaseProfileNamespace(): Promise<string> {
  const supabase = getMobileSupabaseClient();
  if (!supabase) return "anonymous";
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user?.id) return "anonymous";
    return `profile:${data.session.user.id}`;
  } catch {
    return "anonymous";
  }
}

export function getMobileSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    ensureAuthStateSubscription(cachedClient);
  }

  return cachedClient;
}

export async function getCurrentSupabaseAccessToken() {
  const supabase = getMobileSupabaseClient();

  if (!supabase) {
    return {
      accessToken: null,
      error: "Hidden Tunes sign-in is not configured.",
    };
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    return {
      accessToken: null,
      error: error.message || "Could not read the current artist session.",
    };
  }

  if (!session?.access_token) {
    return {
      accessToken: null,
      error: "Sign in to Hidden Tunes to continue.",
    };
  }

  return {
    accessToken: session.access_token,
    error: null,
  };
}

export async function getCurrentSupabaseSessionSummary(): Promise<MobileSupabaseSessionSummary> {
  const supabase = getMobileSupabaseClient();

  if (!supabase) {
    return {
      isConfigured: false,
      isSignedIn: false,
      email: null,
      error: "Hidden Tunes sign-in is not configured.",
    };
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    return {
      isConfigured: true,
      isSignedIn: false,
      email: null,
      error: error.message || "Could not read the current artist session.",
    };
  }

  return {
    isConfigured: true,
    isSignedIn: Boolean(session?.access_token),
    email: session?.user?.email || null,
    error: null,
  };
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = getMobileSupabaseClient();

  if (!supabase) {
    return {
      email: null,
      error: "Hidden Tunes sign-in is not configured.",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.session?.access_token) {
    return {
      email: null,
      error: error?.message || "Could not sign in with those credentials.",
    };
  }

  clearCachedArtistFollowStates();

  // Signing in can replace an existing profile. Remove that profile's native
  // Android Auto snapshot before publishing the newly authenticated one.
  // Native bridge availability must never change authentication semantics.
  try {
    const {
      invalidateAndroidAutoProfileSnapshot,
      syncAndroidAutoCatalogFromDerived,
    } = await import("./androidAutoCatalogBridge");
    await invalidateAndroidAutoProfileSnapshot();
    await syncAndroidAutoCatalogFromDerived();
  } catch {
    // Optional Android-only cache maintenance.
  }

  return {
    email: data.user?.email || email.trim(),
    error: null,
  };
}

function ensureAuthStateSubscription(supabase: SupabaseClient) {
  if (authSubscriptionStarted) return;
  authSubscriptionStarted = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    const nextUserId = session?.user?.id || null;
    if (activeUserId !== undefined && activeUserId !== nextUserId) {
      clearCachedArtistFollowStates();
    }
    activeUserId = nextUserId;
    authStateListeners.forEach((listener) => listener(nextUserId));
  });
}

export function subscribeToMobileAuthState(listener: (userId: string | null) => void) {
  getMobileSupabaseClient();
  authStateListeners.add(listener);
  return () => authStateListeners.delete(listener);
}

function safeAuthReturnPath(value?: string) {
  const path = String(value || "");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/profile";
}

async function savePendingAuthReturn(returnTo?: string) {
  await AsyncStorage.setItem(PENDING_AUTH_RETURN_KEY, safeAuthReturnPath(returnTo));
}

export async function consumePendingAuthReturn() {
  const returnTo = safeAuthReturnPath(await AsyncStorage.getItem(PENDING_AUTH_RETURN_KEY) || undefined);
  await AsyncStorage.removeItem(PENDING_AUTH_RETURN_KEY);
  return returnTo;
}

export async function requestPasswordReset(email: string) {
  const supabase = getMobileSupabaseClient();
  if (!supabase) return { error: "Hidden Tunes sign-in is not configured." };

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: "hiddentunes://reset-password",
  });
  return { error: error?.message || null };
}

export async function requestMagicLink(email: string, returnTo?: string) {
  const supabase = getMobileSupabaseClient();
  if (!supabase) return { error: "Hidden Tunes sign-in is not configured." };

  await savePendingAuthReturn(returnTo);
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: "hiddentunes://auth-callback" },
  });
  if (error) await AsyncStorage.removeItem(PENDING_AUTH_RETURN_KEY);
  return { error: error?.message || null };
}

function authParamsFromUrl(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  fragment.forEach((value, key) => params.set(key, value));
  return params;
}

export async function establishAuthCallbackSession(url: string) {
  const supabase = getMobileSupabaseClient();
  if (!supabase) return { error: "Hidden Tunes sign-in is not configured." };

  try {
    const params = authParamsFromUrl(url);
    const callbackError = params.get("error_description") || params.get("error");
    if (callbackError) return { error: callbackError };
    const code = params.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return { error: error?.message || null };
    }
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return { error: "This sign-in link is invalid or has expired." };
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    return { error: error?.message || null };
  } catch {
    return { error: "This sign-in link is invalid or has expired." };
  }
}

export async function establishPasswordRecoverySession(url: string) {
  const supabase = getMobileSupabaseClient();
  if (!supabase) return { error: "Hidden Tunes sign-in is not configured." };

  try {
    const params = authParamsFromUrl(url);
    const code = params.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return { error: error?.message || null };
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken || params.get("type") !== "recovery") {
      return { error: "This password reset link is invalid or has expired." };
    }
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { error: error?.message || null };
  } catch {
    return { error: "This password reset link is invalid or has expired." };
  }
}

export async function updatePassword(password: string) {
  const supabase = getMobileSupabaseClient();
  if (!supabase) return { error: "Hidden Tunes sign-in is not configured." };
  const { error } = await supabase.auth.updateUser({ password });
  return { error: error?.message || null };
}

export async function signUpWithPassword(
  email: string,
  password: string,
  displayName?: string,
) {
  const supabase = getMobileSupabaseClient();
  if (!supabase) {
    return { email: null, requiresEmailVerification: false, error: "Hidden Tunes sign-in is not configured." };
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: displayName?.trim()
      ? { data: { display_name: displayName.trim() } }
      : undefined,
  });
  if (error || !data.user) {
    return {
      email: null,
      requiresEmailVerification: false,
      error: error?.message || "Could not create this account.",
    };
  }

  clearCachedArtistFollowStates();
  return {
    email: data.user.email || email.trim(),
    requiresEmailVerification: !data.session,
    error: null,
  };
}

export async function resendSignUpConfirmation(email: string) {
  const supabase = getMobileSupabaseClient();
  if (!supabase) return { error: "Hidden Tunes sign-in is not configured." };
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: "hiddentunes://auth-callback" },
  });
  return { error: error?.message || null };
}

/** Compatibility alias. Artist tools use the same canonical Hidden Tunes account. */
export const signInArtistWithPassword = signInWithPassword;

export async function signOutSession() {
  lockMaturePodcastSession();
  const supabase = getMobileSupabaseClient();

  if (!supabase) {
    return {
      error: null,
    };
  }

  const { error } = await supabase.auth.signOut();
  clearCachedArtistFollowStates();

  try {
    const { invalidateAndroidAutoProfileSnapshot } = await import("./androidAutoCatalogBridge");
    await invalidateAndroidAutoProfileSnapshot();
  } catch {
    // Sign-out must not fail merely because the native Android bridge is unavailable.
  }

  try {
    const { syncAndroidAutoCatalogFromDerived } = await import("./androidAutoCatalogBridge");
    await syncAndroidAutoCatalogFromDerived();
  } catch {
    // Authentication succeeds even when the native Android bridge is absent.
  }

  return {
    error: error?.message || null,
  };
}

export async function clearDeletedAccountLocalSession() {
  lockMaturePodcastSession();
  const supabase = getMobileSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
  clearCachedArtistFollowStates();
  try {
    const { invalidateAndroidAutoProfileSnapshot } = await import("./androidAutoCatalogBridge");
    await invalidateAndroidAutoProfileSnapshot();
  } catch {
    // Account deletion remains complete when an optional native cache is unavailable.
  }
}

/** Compatibility alias. There is no separate artist session. */
export const signOutArtistSession = signOutSession;
