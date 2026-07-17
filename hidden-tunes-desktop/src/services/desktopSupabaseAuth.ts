/**
 * Minimal desktop Supabase session helper for Artist Follow.
 * Additive only — does not replace any global auth architecture.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL?.trim() ||
  (import.meta as { env?: Record<string, string> }).env?.VITE_PUBLIC_SUPABASE_URL?.trim() ||
  "";
const SUPABASE_ANON_KEY =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY?.trim() ||
  (import.meta as { env?: Record<string, string> }).env?.VITE_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "";

let cachedClient: SupabaseClient | null = null;

export type DesktopSupabaseSessionSummary = {
  isConfigured: boolean;
  isSignedIn: boolean;
  email: string | null;
  error: string | null;
};

function getDesktopSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedClient;
}

export async function getDesktopSupabaseAccessToken() {
  const supabase = getDesktopSupabaseClient();
  if (!supabase) {
    return {
      accessToken: null as string | null,
      error: "Sign in to follow artists.",
    };
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    return {
      accessToken: null as string | null,
      error: error.message || "Could not read the current session.",
    };
  }

  if (!session?.access_token) {
    return {
      accessToken: null as string | null,
      error: "Sign in to follow artists.",
    };
  }

  return {
    accessToken: session.access_token as string,
    error: null as string | null,
  };
}

export async function getDesktopSupabaseSessionSummary(): Promise<DesktopSupabaseSessionSummary> {
  const supabase = getDesktopSupabaseClient();
  if (!supabase) {
    return {
      isConfigured: false,
      isSignedIn: false,
      email: null,
      error: "Sign in to follow artists.",
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
      error: error.message || "Could not read the current session.",
    };
  }

  return {
    isConfigured: true,
    isSignedIn: Boolean(session?.access_token),
    email: session?.user?.email || null,
    error: null,
  };
}
