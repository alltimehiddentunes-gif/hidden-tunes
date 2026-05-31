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
  error: string | null;
};

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

  return {
    email: data.user?.email || email.trim(),
    error: null,
  };
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
