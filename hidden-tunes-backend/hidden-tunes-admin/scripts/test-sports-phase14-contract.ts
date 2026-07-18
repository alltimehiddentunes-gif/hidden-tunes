/**
 * Phase 14 — country filter + related fixtures contract checks (no DB).
 */
import assert from "assert/strict";
import fs from "fs";
import path from "path";

const root = path.join(process.cwd());
const fixturesRoute = fs.readFileSync(
  path.join(root, "app/api/sports/fixtures/route.ts"),
  "utf8"
);
const listFixtures = fs.readFileSync(
  path.join(root, "lib/sports/fixtures/listFixtures.ts"),
  "utf8"
);
const related = fs.readFileSync(
  path.join(root, "lib/sports/fixtures/relatedFixtures.ts"),
  "utf8"
);
const detail = fs.readFileSync(
  path.join(root, "app/api/sports/fixtures/[id]/route.ts"),
  "utf8"
);

assert.match(fixturesRoute, /countryCode/);
assert.match(fixturesRoute, /fixtureCountry/);
assert.equal(/country:\s*url\.searchParams\.get\(["']country["']\)/.test(fixturesRoute), false);
assert.match(listFixtures, /toLowerCase/);
assert.match(related, /MAX_RELATED\s*=\s*6/);
assert.match(related, /excludeId/);
assert.match(detail, /loadRelatedFixtures/);
assert.match(detail, /batchLoadMatchCards/);
assert.match(detail, /resolveSportsBrowseAccess/);
assert.match(detail, /relatedFixtures/);
assert.equal(detail.includes("playable: true"), false);
assert.equal(related.includes("playable: true"), false);

console.log("phase14-sports-contract: ok");
