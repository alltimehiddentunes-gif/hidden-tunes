import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const snapshot = read("services/carPlayCatalogSnapshot.ts");
const bridge = read("services/carPlayCatalogBridge.ts");
const resolver = read("services/carPlayMediaResolver.ts");
const matureSettings = read("utils/matureContentSettings.ts");

const checks = [
  [snapshot.includes("export function isCarPlayContentVisible"), "one shared visibility helper"],
  [bridge.includes("configureCarPlayMatureVisibility(shouldIncludeMatureInApi)"), "existing phone mature setting is authoritative"],
  [!snapshot.includes("authenticateFor") && !snapshot.includes("sessionUnlocked")
    && !snapshot.includes("authorizationGeneration"), "no CarPlay auth/session model"],
  [snapshot.includes("isCarPlayContentVisible(raw)"), "catalog songs filtered before insertion"],
  [snapshot.includes("!isCarPlayContentVisible(track)"), "extra tracks filtered before insertion"],
  [bridge.includes("!isCarPlayContentVisible(fav.metadata)"), "favorites filtered"],
  [bridge.includes("!isCarPlayContentVisible(entry"), "recent history filtered"],
  [bridge.includes("subscribeMatureContentSettings"), "phone setting changes republish CarPlay"],
  [resolver.match(/isTrackVisible\(/g)?.length >= 2
    && bridge.includes("configureCarPlayMediaVisibility(isCarPlayContentVisible)"), "selection and queue revalidated"],
  [!matureSettings.includes("CarPlay"), "phone mature implementation unchanged"],
];

const failed = checks.filter(([pass]) => !pass);
for (const [pass, label] of checks) console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);
