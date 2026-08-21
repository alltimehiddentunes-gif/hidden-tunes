import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { User } from "@supabase/supabase-js";

import {
  AccountDeletionError,
  executeOwnAccountDeletion,
  hashAccountDeletionUser,
} from "../lib/accountDeletion";

const now = Date.now();
const user = {
  id: "11111111-1111-4111-a111-111111111111",
  last_sign_in_at: new Date(now).toISOString(),
} as unknown as User;

function harness(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const dependencies = {
    now: () => now,
    consumeRateLimit: async () => { calls.push("rate"); return true; },
    deleteOwnedData: async (id: string) => { calls.push(`data:${id}`); },
    deleteAuthUser: async (id: string) => { calls.push(`auth:${id}`); },
    markCompleted: async () => { calls.push("complete"); },
    ...overrides,
  };
  return { calls, dependencies };
}

async function main() {
  const userHash = hashAccountDeletionUser(user.id, "test-pepper");
  assert.equal(userHash.length, 64);

await assert.rejects(
  () => executeOwnAccountDeletion({ user, confirmation: "wrong", userHash, dependencies: harness().dependencies }),
  (error: unknown) => error instanceof AccountDeletionError && error.code === "confirmation_required"
);

const expired = { ...user, last_sign_in_at: new Date(now - 11 * 60 * 1000).toISOString() } as User;
await assert.rejects(
  () => executeOwnAccountDeletion({ user: expired, confirmation: "DELETE MY ACCOUNT", userHash, dependencies: harness().dependencies }),
  (error: unknown) => error instanceof AccountDeletionError && error.code === "recent_authentication_required"
);

await assert.rejects(
  () => executeOwnAccountDeletion({ user, confirmation: "DELETE MY ACCOUNT", userHash, dependencies: harness({ consumeRateLimit: async () => false }).dependencies }),
  (error: unknown) => error instanceof AccountDeletionError && error.code === "rate_limited"
);

const success = harness();
await executeOwnAccountDeletion({ user, confirmation: "DELETE MY ACCOUNT", userHash, dependencies: success.dependencies });
assert.deepEqual(success.calls, ["rate", `data:${user.id}`, `auth:${user.id}`, "complete"]);

const repeated = harness();
await executeOwnAccountDeletion({ user, confirmation: "DELETE MY ACCOUNT", userHash, dependencies: repeated.dependencies });
await executeOwnAccountDeletion({ user, confirmation: "DELETE MY ACCOUNT", userHash, dependencies: repeated.dependencies });
assert.equal(repeated.calls.filter((call) => call === `data:${user.id}`).length, 2, "retries remain scoped to the authenticated account");
assert.doesNotMatch(repeated.calls.join("\n"), /22222222-2222/, "another account can never be selected by request data");

const partial = harness({ deleteOwnedData: async () => { throw new Error("partial"); } });
await assert.rejects(() => executeOwnAccountDeletion({ user, confirmation: "DELETE MY ACCOUNT", userHash, dependencies: partial.dependencies }));
assert.deepEqual(partial.calls, ["rate"], "Auth user survives data-cleanup failure");

const root = process.cwd();
const route = readFileSync(resolve(root, "app/api/account/delete/route.ts"), "utf8");
const migration = readFileSync(resolve(root, "supabase/migrations/20260821120000_account_deletion.sql"), "utf8");
assert.doesNotMatch(route, /payload\.user_id|body\.user_id/, "client cannot select another user");
assert.match(route, /if \(!token\).*authentication_required/, "anonymous requests are denied");
assert.match(route, /auth\.getUser\(token\)/, "access token is verified by Supabase");
assert.match(route, /invalid_or_expired_token/, "invalid and expired tokens are denied");
assert.match(route, /deleteUser\(userId, false\)/, "Auth user is deleted server-side");
assert.match(route, /private, no-store/, "responses are private and non-cacheable");
assert.doesNotMatch(route, /SERVICE_ROLE.*response|serviceRoleKey.*response/, "service role never enters a response");
assert.match(migration, /Explicit account-owned allowlist/);
assert.match(migration, /revoke all on function public\.account_delete_owned_data/);
assert.match(migration, /grant execute on function public\.account_delete_owned_data\(uuid, text\) to service_role/);
for (const table of ["artist_followers", "sports_watch_history", "user_devices", "playback_progress"]) {
  assert.match(migration, new RegExp(`'${table}'`), `${table} cleanup is explicitly covered`);
}
assert.match(migration, /status in \('data_deleted', 'completed'\)/, "retries retain durable state");
assert.match(migration, /artist_claims[\s\S]*pseudonymous_user_id/, "legal ownership evidence is pseudonymized");

  console.log("PASS: secure own-account deletion contract");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
