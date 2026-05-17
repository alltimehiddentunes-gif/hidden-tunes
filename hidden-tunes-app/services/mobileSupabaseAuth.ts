import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || "";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

let cachedClient: SupabaseClient | null = null;

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
