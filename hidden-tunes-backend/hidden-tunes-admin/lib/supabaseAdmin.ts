import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
let cachedClientKey = "";

export function getSupabaseAdminConfig() {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  const missingVariables = [
    !supabaseUrl ? "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL" : null,
    !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
  ].filter(Boolean) as string[];

  return {
    supabaseUrl,
    serviceRoleKey,
    missingVariables,
  };
}

export function getSupabaseAdmin() {
  const { supabaseUrl, serviceRoleKey, missingVariables } =
    getSupabaseAdminConfig();

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing Supabase environment variables: ${missingVariables.join(", ")}`
    );
  }

  const clientKey = `${supabaseUrl}:${serviceRoleKey}`;

  if (!cachedClient || cachedClientKey !== clientKey) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedClientKey = clientKey;
  }

  return cachedClient;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabaseAdmin() as unknown as Record<
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
