import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";

export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";
export const ACCOUNT_DELETION_REAUTH_MAX_AGE_MS = 10 * 60 * 1000;

export type AccountDeletionDependencies = {
  consumeRateLimit(userHash: string): Promise<boolean>;
  deleteOwnedData(userId: string, userHash: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
  markCompleted(userHash: string): Promise<void>;
  now(): number;
};

export class AccountDeletionError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

export function hashAccountDeletionUser(userId: string, pepper: string) {
  if (!pepper) throw new Error("ACCOUNT_DELETION_HASH_PEPPER is required");
  return createHash("sha256").update(`${pepper}:${userId}`).digest("hex");
}

export function requireRecentAuthentication(user: User, now: number) {
  const signedInAt = Date.parse(String(user.last_sign_in_at || ""));
  if (!Number.isFinite(signedInAt) || now - signedInAt > ACCOUNT_DELETION_REAUTH_MAX_AGE_MS) {
    throw new AccountDeletionError("recent_authentication_required", 403);
  }
}

export async function executeOwnAccountDeletion(options: {
  user: User;
  confirmation: unknown;
  userHash: string;
  dependencies: AccountDeletionDependencies;
}) {
  const { user, confirmation, userHash, dependencies } = options;
  if (confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
    throw new AccountDeletionError("confirmation_required", 400);
  }
  requireRecentAuthentication(user, dependencies.now());
  if (!(await dependencies.consumeRateLimit(userHash))) {
    throw new AccountDeletionError("rate_limited", 429);
  }

  // The RPC is transactional and idempotent. Auth deletion is deliberately last.
  await dependencies.deleteOwnedData(user.id, userHash);
  await dependencies.deleteAuthUser(user.id);
  await dependencies.markCompleted(userHash);
  return { deleted: true as const };
}
