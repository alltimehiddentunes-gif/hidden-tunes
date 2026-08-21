import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");
const api = read("services/accountDeletion.ts");
const auth = read("services/mobileSupabaseAuth.ts");
const screen = read("app/auth.tsx");

assert.match(api, /Authorization: `Bearer \$\{session\.accessToken\}`/);
assert.match(api, /body: JSON\.stringify\(\{ confirmation: ACCOUNT_DELETION_CONFIRMATION \}\)/);
assert.doesNotMatch(api, /user_?id/i, "Mobile never selects an account identifier");
assert.match(api, /account and session are unchanged/i, "network failure is recoverable");
assert.match(screen, /signInWithPassword\(sessionEmail, deletePassword\)/, "current credentials provide recent authentication");
assert.match(screen, /\{ text: "Cancel", style: "cancel" \}/, "irreversible confirmation is cancellable");
assert.match(screen, /if \(result\.error\)[\s\S]*setDeleteError\(result\.error\)[\s\S]*return;/, "failed deletion preserves the session");
assert.match(screen, /await clearDeletedAccountLocalSession\(\)/, "successful deletion clears the local account session");
assert.match(screen, /accessibilityLabel="Permanently delete account"/);
assert.match(auth, /signOut\(\{ scope: "local" \}\)/, "post-deletion cleanup cannot make a remote admin request");

console.log("PASS: Mobile account deletion UI and session contract");
