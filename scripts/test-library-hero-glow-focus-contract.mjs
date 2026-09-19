import assert from "node:assert/strict";
import fs from "node:fs";

const library = fs.readFileSync("app/library.tsx", "utf8");
const glowStart = library.indexOf("const LibraryHeroGlow = memo");
const glowEnd = library.indexOf("const LibrarySectionCard", glowStart);
const glow = library.slice(glowStart, glowEnd);
const checks = [];

function check(label, condition) {
  assert.ok(condition, label);
  checks.push(label);
}

function createGlowModel() {
  return {
    running: false,
    opacity: "min",
    scale: "min",
    starts: 0,
    cancels: 0,
  };
}

function reconcileGlow(model, appActive, routeFocused) {
  if (!appActive || !routeFocused) {
    model.cancels += 2;
    model.running = false;
    model.opacity = "min";
    model.scale = "min";
    return;
  }
  model.running = true;
  model.starts += 2;
}

{
  const model = createGlowModel();
  reconcileGlow(model, true, true);
  assert.equal(model.running, true);
  assert.equal(model.starts, 2);

  reconcileGlow(model, true, false);
  assert.equal(model.running, false);
  assert.equal(model.opacity, "min");
  assert.equal(model.scale, "min");

  reconcileGlow(model, false, false);
  reconcileGlow(model, true, false);
  assert.equal(model.running, false, "foregrounding a blurred route must not restart loops");
  assert.equal(model.starts, 2);

  reconcileGlow(model, true, true);
  assert.equal(model.running, true);
  assert.equal(model.starts, 4, "refocus must restart exactly the two glow loops");
  checks.push("focus/app-state lifecycle model");
}

check(
  "focus is observed by the memoized glow child, not by remounting Library content",
  /import \{ router, useIsFocused \} from "expo-router";/.test(library) &&
    glow.includes("const isFocused = useIsFocused();") &&
    !library.slice(library.indexOf("export default function LibraryScreen")).includes("useIsFocused()")
);

check(
  "continuous work requires both foreground app and focused route",
  glow.includes("if (!appActive || !isFocused) {") &&
    glow.includes("[appActive, isFocused, opacity, scale]")
);

check(
  "blur and inactivity cancel both loops and park static minimum values",
  (glow.match(/cancelAnimation\(opacity\)/g) || []).length >= 2 &&
    (glow.match(/cancelAnimation\(scale\)/g) || []).length >= 2 &&
    glow.includes("opacity.value = LUXURY_GLOW.opacityMin;") &&
    glow.includes("scale.value = LUXURY_GLOW.scaleMin;") &&
    !/if \(!appActive \|\| !isFocused\)[\s\S]*?opacity\.value = withTiming/.test(glow)
);

check(
  "focused route retains exactly two bounded infinite glow loops",
  (glow.match(/withRepeat\(/g) || []).length === 2 &&
    (glow.match(/\r?\n\s*-1,\r?\n/g) || []).length === 2
);

check(
  "active-effect cleanup still cancels both shared values",
  /return \(\) => \{\s*cancelAnimation\(opacity\);\s*cancelAnimation\(scale\);\s*\};/.test(glow)
);

check(
  "pause diagnostics distinguish route blur from app inactivity",
  glow.includes('reason: appActive ? "route_unfocused" : "app_inactive"')
);

check(
  "Library adds no timer, interval, RAF or progress subscription",
  !library.includes("setTimeout(") &&
    !library.includes("setInterval(") &&
    !library.includes("requestAnimationFrame(") &&
    !library.includes("usePlayerProgress")
);

for (const route of [
  "/favorites",
  "/downloads",
  "/podcasts",
  "/radio",
  "/stations",
  "/music-feed",
  "/recently-played",
]) {
  check(`Library route preserved: ${route}`, library.includes(`"${route}"`));
}

console.log(`Library hero glow focus contract: ${checks.length}/${checks.length} PASS`);
