import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { lockMaturePodcastSession } from "../utils/maturePodcastSettings";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || "";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

let cachedClient: SupabaseClient | null = null;

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

function getMobileSupabaseClient() {
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

export async function signInArtistWithPassword(email: string, password: string) {
  const supabase = getMobileSupabaseClient();

  if (!supabase) {
    return {
      email: null,
      error: "Sign in as an artist to submit music for review.",
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

export async function signOutArtistSession() {
  lockMaturePodcastSession();
  const supabase = getMobileSupabaseClient();

  if (!supabase) {
    return {
      error: null,
    };
  }

  const { error } = await supabase.auth.signOut();

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
