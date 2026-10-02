/**
 * Release-gate: Active Desktop must retain the production Distribution Analytics surface.
 * Fails the build if route/nav/API/auth/contracts disappear.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());
const required = [
  "app/admin/distribution/page.tsx",
  "app/admin/distribution/DistributionDashboard.tsx",
  "app/admin/distribution/MicrosoftStorePanel.tsx",
  "app/admin/distribution/AppleAppStorePanel.tsx",
  "app/api/admin/distribution/route.ts",
  "app/api/admin/distribution/microsoft-store/route.ts",
  "app/api/admin/distribution/apple-app-store/route.ts",
  "app/api/analytics/events/route.ts",
  "lib/distribution/store.ts",
  "lib/distribution/collectionCoverage.ts",
  "lib/distribution/microsoftStoreStore.ts",
  "lib/distribution/appleAppStoreStore.ts",
  "lib/distribution/appleAppStoreClient.ts",
  "public/distribution-analytics.js",
  "components/AdminShell.tsx",
];

const missing = required.filter(path => !existsSync(join(root, path)));
assert.equal(missing.length, 0, "Missing distribution files:\n" + missing.join("\n"));

const shell = readFileSync(join(root, "components/AdminShell.tsx"), "utf8");
assert.match(shell, /href:\s*"\/admin\/distribution"/);
assert.match(shell, /label:\s*"Distribution"/);
assert.match(shell, /getActiveUploaderSession/);

const page = readFileSync(join(root, "app/admin/distribution/page.tsx"), "utf8");
assert.match(page, /\/api\/admin\/distribution\?period=/);
assert.match(page, /getActiveUploaderSession/);
assert.match(page, /MicrosoftStorePanel/);
assert.match(page, /AppleAppStorePanel/);

const summaryRoute = readFileSync(join(root, "app/api/admin/distribution/route.ts"), "utf8");
assert.match(summaryRoute, /requireOwnerAlertPermission/);
assert.match(summaryRoute, /getSummary/);
assert.match(summaryRoute, /applyCollectionCoverage/);

const msRoute = readFileSync(join(root, "app/api/admin/distribution/microsoft-store/route.ts"), "utf8");
assert.match(msRoute, /requireOwnerAlertPermission/);
assert.match(msRoute, /getMicrosoftStoreSummary/);

const appleRoute = readFileSync(join(root, "app/api/admin/distribution/apple-app-store/route.ts"), "utf8");
assert.match(appleRoute, /requireOwnerAlertPermission/);
assert.match(appleRoute, /getAppleAppStoreSummary/);
assert.doesNotMatch(appleRoute, /APPLE_ASC_PRIVATE_KEY/);

const dashboard = readFileSync(join(root, "app/admin/distribution/DistributionDashboard.tsx"), "utf8");
assert.match(dashboard, /All platforms/);
assert.match(dashboard, /Apple App Store/);
assert.match(dashboard, /Microsoft Store/);
assert.match(dashboard, /6773324462/);

const appleTypes = readFileSync(join(root, "lib/distribution/appleAppStoreTypes.ts"), "utf8");
assert.match(appleTypes, /6773324462/);
assert.match(appleTypes, /store_units/);
assert.match(appleTypes, /store_updates/);

const collector = readFileSync(join(root, "public/distribution-analytics.js"), "utf8");
assert.match(collector, /\/api\/analytics\/events/);

console.log("PASS distribution release gate: route, nav, APIs, auth wrappers, Apple+Microsoft contracts, collector present.");
