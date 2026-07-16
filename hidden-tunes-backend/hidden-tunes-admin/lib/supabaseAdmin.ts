import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
let cachedClientKey = "";

/** Hard ceiling so hung PostgREST/upstream calls cannot stall Next.js routes forever. */
export const SUPABASE_FETCH_TIMEOUT_MS = 12_000;

function createTimedFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const parentSignal = init?.signal;
    let timedOut = false;

    const onParentAbort = () => controller.abort();
    if (parentSignal?.aborted) {
      controller.abort();
    } else {
      parentSignal?.addEventListener("abort", onParentAbort, { once: true });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        const timeoutError = new Error(`supabase_fetch_timeout_${timeoutMs}ms`);
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onParentAbort);
    }
  };
}

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

  const clientKey = `${supabaseUrl}:${serviceRoleKey}:t${SUPABASE_FETCH_TIMEOUT_MS}`;

  if (!cachedClient || cachedClientKey !== clientKey) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: createTimedFetch(SUPABASE_FETCH_TIMEOUT_MS),
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
