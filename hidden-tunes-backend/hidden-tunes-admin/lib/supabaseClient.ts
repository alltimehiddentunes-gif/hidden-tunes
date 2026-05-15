import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
let cachedClientKey = "";

export function getSupabaseBrowserConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

  const missingVariables = [
    !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !supabaseAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
  ].filter(Boolean) as string[];

  return {
    supabaseUrl,
    supabaseAnonKey,
    missingVariables,
  };
}

export function getSupabaseBrowserClient() {
  const { supabaseUrl, supabaseAnonKey, missingVariables } =
    getSupabaseBrowserConfig();

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing Supabase browser environment variables: ${missingVariables.join(
        ", "
      )}`
    );
  }

  const clientKey = `${supabaseUrl}:${supabaseAnonKey}`;

  if (!cachedClient || cachedClientKey !== clientKey) {
    cachedClient = createClient(supabaseUrl, supabaseAnonKey);
    cachedClientKey = clientKey;
  }

  return cachedClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabaseBrowserClient() as unknown as Record<
      string | symbol,
      unknown
    >;
    const value = client[property];

    if (typeof value === "function") {
      return value.bind(client);
    }

    return value;
  },
});
