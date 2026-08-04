/**
 * CarPlay Favorites helper + tab validation contract tests.
 * Mirrors the Swift sanitizer / validator rules for CI on Windows.
 *
 * Run: npx tsx scripts/test-carplay-favorites-helper.ts
 */
// @ts-nocheck
const fs = require("fs");
const path = require("path");

const root = process.cwd();

function assertOk(condition, label) {
  if (!condition) throw new Error(label);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** Mirrors HiddenAudioCarPlayCatalog.sanitizedFavoritesNodes */
function sanitizedFavoritesNodes(rawNodes, limit = 25) {
  const seen = new Set();
  const sanitized = [];

  for (const node of rawNodes || []) {
    const mediaId = String(node.mediaId || "").trim();
    const title = String(node.title || "").trim();
    if (!mediaId || !title) continue;
    if (mediaId.startsWith("empty:")) continue;
    if (seen.has(mediaId)) continue;
    seen.add(mediaId);
    sanitized.push({
      mediaId,
      title,
      subtitle: node.subtitle || "",
      playable: !!node.playable,
    });
    if (sanitized.length >= limit) break;
  }

  if (sanitized.length === 0) {
    return [
      {
        mediaId: "empty:favorites",
        title: "No favorites yet",
        subtitle: "Save audio on your phone",
        playable: false,
      },
    ];
  }
  return sanitized;
}

/** Mirrors HiddenAudioCarPlayTabValidation.validateCarPlayTabs (structural) */
function validateCarPlayTabs(templates) {
  if (!templates || templates.length === 0) return { ok: false, reason: "empty" };
  if (templates.length > 5) return { ok: false, reason: "too_many" };

  const identities = new Set();
  for (let index = 0; index < templates.length; index += 1) {
    const template = templates[index];
    const id = template.identity;
    if (identities.has(id)) return { ok: false, reason: `duplicate:${index}` };
    identities.add(id);

    const title = (template.tabTitle || "").trim();
    if (!title) return { ok: false, reason: `missing_title:${index}` };
    if (!template.tabImage) return { ok: false, reason: `missing_image:${index}` };
    if (template.className !== "CPListTemplate") {
      return { ok: false, reason: `bad_class:${index}:${template.className}` };
    }
  }
  return { ok: true, reason: "ok" };
}

function makeSafeTabs() {
  return [
    { identity: "listen-1", className: "CPListTemplate", tabTitle: "Listen", tabImage: true },
    { identity: "radio-1", className: "CPListTemplate", tabTitle: "Radio", tabImage: true },
    { identity: "library-1", className: "CPListTemplate", tabTitle: "Library", tabImage: true },
  ];
}

function main() {
  // 1. Favorites available
  const available = sanitizedFavoritesNodes([
    { mediaId: "fav:1", title: "Song A", subtitle: "Artist", playable: true },
    { mediaId: "fav:2", title: "Song B", subtitle: "Artist", playable: true },
  ]);
  assertOk(available.length === 2, "favorites available count");
  assertOk(available[0].mediaId === "fav:1", "favorites available first id");
  assertOk(!available.some((n) => n.title === "No favorites yet"), "favorites available not empty-state");

  // 2. Favorites empty
  const empty = sanitizedFavoritesNodes([]);
  assertOk(empty.length === 1, "favorites empty count");
  assertOk(empty[0].title === "No favorites yet", "favorites empty title");
  assertOk(empty[0].mediaId === "empty:favorites", "favorites empty id");
  assertOk(empty[0].playable === false, "favorites empty not playable");

  // 3. Malformed favorite ignored safely
  const malformed = sanitizedFavoritesNodes([
    { mediaId: "", title: "No id" },
    { mediaId: "bad", title: "   " },
    { mediaId: "empty:favorites", title: "Nothing here yet" },
    { mediaId: "fav:ok", title: "Good Track", playable: true },
  ]);
  assertOk(malformed.length === 1, "malformed ignored keeps one good");
  assertOk(malformed[0].mediaId === "fav:ok", "malformed keeps valid id");

  // 4. Missing artwork — sanitizer never requires artwork fields
  const noArt = sanitizedFavoritesNodes([
    { mediaId: "fav:artless", title: "No Artwork", playable: true },
  ]);
  assertOk(noArt.length === 1, "missing artwork still valid");
  assertOk(noArt[0].artworkUrl === undefined, "artwork not required");

  // 5. Duplicate items ignored
  const dupes = sanitizedFavoritesNodes([
    { mediaId: "fav:1", title: "One", playable: true },
    { mediaId: "fav:1", title: "One duplicate", playable: true },
    { mediaId: "fav:2", title: "Two", playable: true },
  ]);
  assertOk(dupes.length === 2, "duplicates collapsed");
  assertOk(dupes[0].title === "One", "first duplicate wins");

  // 6. Catalog loading failure → empty favorites safe state
  const catalogFailure = sanitizedFavoritesNodes(null);
  assertOk(catalogFailure[0].title === "No favorites yet", "catalog failure empty state");

  // 7. Tab validation: empty rejected
  assertOk(validateCarPlayTabs([]).ok === false, "empty tabs rejected");

  // 8. Duplicate template objects rejected
  const dupTemplates = [
    { identity: "same", className: "CPListTemplate", tabTitle: "Listen", tabImage: true },
    { identity: "same", className: "CPListTemplate", tabTitle: "Radio", tabImage: true },
  ];
  assertOk(validateCarPlayTabs(dupTemplates).ok === false, "duplicate templates rejected");

  // 9. Missing title / image / unsupported class rejected
  assertOk(
    validateCarPlayTabs([
      { identity: "a", className: "CPListTemplate", tabTitle: "", tabImage: true },
    ]).ok === false,
    "missing title rejected"
  );
  assertOk(
    validateCarPlayTabs([
      { identity: "a", className: "CPListTemplate", tabTitle: "Listen", tabImage: null },
    ]).ok === false,
    "missing image rejected"
  );
  assertOk(
    validateCarPlayTabs([
      { identity: "a", className: "CPSearchTemplate", tabTitle: "Search", tabImage: true },
    ]).ok === false,
    "unsupported class rejected"
  );

  // 10. Valid list templates produce tab root
  assertOk(validateCarPlayTabs(makeSafeTabs()).ok === true, "valid tabs accepted");

  // 11. Safe fallback root markers in scene + manager sources
  const scene = read("plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift");
  const manager = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift");
  const catalog = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayCatalog.swift");
  assertOk(scene.includes("makeImmediateFallbackRoot"), "safe fallback root in scene");
  assertOk(manager.includes("installSafeFallbackRoot"), "safe fallback root in manager");
  assertOk(manager.includes("tab_validation_failed keeping_safe_list_root"), "validation keeps safe root");

  // 12. Disconnect clears CarPlay refs only
  assertOk(manager.includes("playback_preserved=1"), "disconnect preserves playback");
  assertOk(manager.includes("tabBarTemplate = nil"), "disconnect clears tab bar");
  assertOk(manager.includes("listenTabTemplate = nil"), "disconnect clears listen tab");
  assertOk(manager.includes("connectionGeneration"), "reconnect uses fresh generation");
  assertOk(manager.includes("hasUpgradedToTabs = false"), "reconnect resets tab upgrade");

  // 13. Source contract: favorites helper cannot feed empty into Listen
  assertOk(catalog.includes("sanitizedFavoritesNodes"), "catalog has sanitizer");
  assertOk(catalog.includes("No favorites yet"), "catalog empty copy");
  assertOk(manager.includes("makeFavoritesSection"), "manager favorites section");
  assertOk(
    !manager.includes("CPTabBarTemplate(templates: templates)") ||
      manager.includes("validateCarPlayTabs(templates)"),
    "tab bar only after validation"
  );
  // Stronger: validation guard immediately precedes construction
  const upgradeIdx = manager.indexOf("tryUpgradeToValidatedTabRoot");
  const validateIdx = manager.indexOf("HiddenAudioCarPlayTabValidation.validateCarPlayTabs(templates)");
  const constructIdx = manager.indexOf("CPTabBarTemplate(templates: templates)");
  assertOk(upgradeIdx >= 0, "upgrade function exists");
  assertOk(validateIdx > upgradeIdx, "validation inside upgrade");
  assertOk(constructIdx > validateIdx, "construction after validation");

  // 14. JS bridge must publish real favorites and must not overwrite with a probe catalog
  const bridge = read("services/carPlayCatalogBridge.ts");
  assertOk(bridge.includes("getFavorites"), "CarPlay bridge reads phone favorites");
  assertOk(bridge.includes("collectCarPlayFavoriteEntries"), "CarPlay favorites collector present");
  assertOk(bridge.includes("const mediaId = `song:${id}`"), "CarPlay favorites use canonical playable media ids");
  assertOk(!bridge.includes("runVisibleRootProbeOnce"), "no visible-root probe overwrite");
  assertOk(!bridge.includes("SoundHelix"), "no SoundHelix probe track");
  assertOk(!bridge.includes("carplay-probe-1"), "no probe media id");

  console.log("carplay-favorites-helper: ok");
  console.log("checks: available/empty/malformed/artwork/dupes/catalog-fail,");
  console.log("  tab validation, fallback, disconnect/reconnect markers,");
  console.log("  real favorites publish + no production probe overwrite");
}

main();
