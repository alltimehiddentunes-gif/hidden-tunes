import assert from "node:assert/strict";

import { canAccessMatureContent } from "../lib/matureContentAccess";

assert.equal(
  canAccessMatureContent({ matureContentEnabled: true, ageConfirmed: true }),
  true
);
assert.equal(
  canAccessMatureContent({ matureContentEnabled: true, ageConfirmed: false }),
  false
);
assert.equal(
  canAccessMatureContent({ matureContentEnabled: false, ageConfirmed: true }),
  false
);
assert.equal(
  canAccessMatureContent({ mature_enabled: "true", age_confirmed: "true" }),
  true
);
assert.equal(
  canAccessMatureContent({ mature_enabled: "true", age_confirmed: "false" }),
  false
);
assert.equal(
  canAccessMatureContent({ includeMature: "true", ageConfirmed: "true" }),
  true
);
assert.equal(canAccessMatureContent({}), false);

console.log(JSON.stringify({ success: true, tests: "mature-content-access" }, null, 2));
