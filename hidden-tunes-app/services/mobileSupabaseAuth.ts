import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || "";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

let cachedClient: SupabaseClient | null = null;

export type MobileSupabaseSessionSummary = {
  isConfigured: boolean;
  isSignedIn: boolean;
  email: string | null;
  userId: string | null;
  error: string | null;
};

const ACCOUNT_DELETION_ENDPOINT =
  "https://admin.hiddentunes.com/api/account/delete";
const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";

function mapAuthError(message: string | undefined, fallback: string) {
  const text = (message || "").trim();

  if (/invalid login credentials/i.test(text)) {
    return "Email or password is incorrect.";
  }
  if (/email not confirmed/i.test(text)) {
    return "Confirm your email before signing in.";
  }
  if (/user already registered/i.test(text)) {
    return "An account with that email already exists. Sign in instead.";
  }
  if (/rate limit|too many/i.test(text)) {
    return "Too many attempts. Try again in a moment.";
  }
  if (/network|fetch/i.test(text)) {
    return "Network error. Check your connection and try again.";
  }
  if (/password/i.test(text) && /weak|least|characters/i.test(text)) {
    return "Choose a stronger password (at least 6 characters).";
  }

  return text.length > 160 ? fallback : text || fallback;
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
  }

  return cachedClient;
}

function validateEmail(email: string) {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function validatePassword(password: string) {
  return password.length >= 6;
}

export async function getCurrentSupabaseAccessToken() {
  const supabase = getMobileSupabaseClient();

  if (!supabase) {
    return {
      accessToken: null,
      error: "Sign in as an artist to submit music for review.",
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
      error: "Sign in as an artist to submit music for review.",
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
      userId: null,
      error: "Sign in as an artist to submit music for review.",
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
      userId: null,
      error: error.message || "Could not read the current artist session.",
    };
  }

  return {
    isConfigured: true,
    isSignedIn: Boolean(session?.access_token),
    email: session?.user?.email || null,
    userId: session?.user?.id || null,
    error: null,
  };
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = getMobileSupabaseClient();

  if (!supabase) {
    return { email: null, error: "Account sign-in is not configured in this build." };
  }

  const trimmed = email.trim();
  if (!validateEmail(trimmed) || !password) {
    return { email: null, error: "Enter a valid email and password." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmed,
    password,
  });

  if (error || !data.session?.access_token) {
    return {
      email: null,
      error: mapAuthError(error?.message, "Could not sign in with those credentials."),
    };
  }

  return { email: data.user?.email || trimmed, error: null };
}

export async function signUpWithPassword(
  email: string,
  password: string,
  displayName?: string
) {
  const supabase = getMobileSupabaseClient();

  if (!supabase) {
    return {
      email: null,
      needsEmailConfirmation: false,
      error: "Account registration is not configured in this build.",
    };
  }

  const trimmed = email.trim();
  if (!validateEmail(trimmed)) {
    return { email: null, needsEmailConfirmation: false, error: "Enter a valid email address." };
  }
  if (!validatePassword(password)) {
    return { email: null, needsEmailConfirmation: false, error: "Password must be at least 6 characters." };
  }

  const { data, error } = await supabase.auth.signUp({
    email: trimmed,
    password,
    options: displayName?.trim()
      ? { data: { display_name: displayName.trim() } }
      : undefined,
  });

  if (error) {
    return {
      email: null,
      needsEmailConfirmation: false,
      error: mapAuthError(error.message, "Could not create an account."),
    };
  }

  return {
    email: data.user?.email || trimmed,
    needsEmailConfirmation: !data.session?.access_token,
    error: null,
  };
}

export async function requestPasswordReset(email: string) {
  const supabase = getMobileSupabaseClient();

  if (!supabase) return { error: "Password reset is not configured in this build." };

  const trimmed = email.trim();
  if (!validateEmail(trimmed)) return { error: "Enter a valid email address." };

  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo: "hiddentunes://reset-password",
  });

  return {
    error: error ? mapAuthError(error.message, "Could not send a password-reset email.") : null,
  };
}

export async function updatePassword(password: string) {
  const supabase = getMobileSupabaseClient();

  if (!supabase) return { error: "Password reset is not configured in this build." };
  if (!validatePassword(password)) return { error: "Password must be at least 6 characters." };

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    return { error: "This reset link is invalid or expired. Request a new email." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  return { error: error ? mapAuthError(error.message, "Could not update the password.") : null };
}

export async function deleteCurrentAccount() {
  const tokenResult = await getCurrentSupabaseAccessToken();

  if (!tokenResult.accessToken) {
    return { error: tokenResult.error || "Sign in again before deleting your account." };
  }

  try {
    const response = await fetch(ACCOUNT_DELETION_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirmation: ACCOUNT_DELETION_CONFIRMATION }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorCode = String(payload?.error || "");
      if (response.status === 401 || errorCode === "recent_authentication_required") {
        return { error: "For your security, sign in again and retry account deletion." };
      }
      if (response.status === 429) return { error: "Too many deletion attempts. Try again later." };
      return { error: "The account could not be deleted. Please try again later." };
    }

    const supabase = getMobileSupabaseClient();
    await supabase?.auth.signOut();
    return { error: null };
  } catch {
    return { error: "Network error. Check your connection and try again." };
  }
}

export async function signInArtistWithPassword(email: string, password: string) {
  return signInWithPassword(email, password);
}

export async function signOutArtistSession() {
  const supabase = getMobileSupabaseClient();

  if (!supabase) {
    return {
      error: null,
    };
  }

  const { error } = await supabase.auth.signOut();

  return {
    error: error?.message || null,
  };
}
