import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import {
  AccountDeletionError,
  executeOwnAccountDeletion,
  hashAccountDeletionUser,
} from "@/lib/accountDeletion";
import { getSupabaseAdmin, getSupabaseAdminConfig } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "private, no-store, max-age=0");
  result.headers.set("Pragma", "no-cache");
  result.headers.set("Vary", "Authorization");
  return result;
}

function bearerToken(request: NextRequest) {
  return String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return response({ error: "authentication_required" }, 401);

  const config = getSupabaseAdminConfig();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim() || "";
  if (!config.supabaseUrl || !anonKey) return response({ error: "service_unavailable" }, 503);

  const verifier = createClient(config.supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data.user) return response({ error: "invalid_or_expired_token" }, 401);

  let payload: { confirmation?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return response({ error: "invalid_request" }, 400);
  }

  const pepper = process.env.ACCOUNT_DELETION_HASH_PEPPER?.trim() || "";
  if (!pepper) return response({ error: "service_unavailable" }, 503);
  const userHash = hashAccountDeletionUser(data.user.id, pepper);
  const admin = getSupabaseAdmin();

  try {
    const result = await executeOwnAccountDeletion({
      user: data.user,
      confirmation: payload.confirmation,
      userHash,
      dependencies: {
        now: () => Date.now(),
        async consumeRateLimit(hash) {
          const { data: allowed, error: rpcError } = await admin.rpc("account_deletion_consume_rate_limit", { p_user_hash: hash });
          if (rpcError) throw rpcError;
          return allowed === true;
        },
        async deleteOwnedData(userId, hash) {
          const { error: rpcError } = await admin.rpc("account_delete_owned_data", { p_user_id: userId, p_user_hash: hash });
          if (rpcError) throw rpcError;
        },
        async deleteAuthUser(userId) {
          const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
          if (deleteError) throw deleteError;
        },
        async markCompleted(hash) {
          const { error: rpcError } = await admin.rpc("account_deletion_mark_completed", { p_user_hash: hash });
          if (rpcError) throw rpcError;
        },
      },
    });
    console.info("[account-deletion]", { outcome: "completed", subject: userHash.slice(0, 12) });
    return response(result, 200);
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      console.info("[account-deletion]", { outcome: error.code, subject: userHash.slice(0, 12) });
      return response({ error: error.code }, error.status);
    }
    console.error("[account-deletion]", { outcome: "failed", subject: userHash.slice(0, 12) });
    return response({ error: "account_deletion_failed" }, 503);
  }
}
