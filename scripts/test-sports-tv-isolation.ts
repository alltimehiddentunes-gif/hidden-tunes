import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sportsRoots = [
  "app/sports",
  "components/sports",
  "services/sports",
  "lib/sports",
];
const sportsFiles = [
  "constants/sportsFlags.ts",
  "services/sportsCatalogApi.ts",
  "types/sports.ts",
];

function collectFiles(relativePath: string): string[] {
  const absolutePath = path.join(root, relativePath);
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [absolutePath];
  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) return collectFiles(path.relative(root, child));
    return /\.(ts|tsx)$/.test(entry.name) ? [child] : [];
  });
}

const forbidden = [
  /SportsTvShelf/,
  /SportsTvChannelCard/,
  /useSportsTvCatalog/,
  /live_sports_tv/,
  /sports_tv_enabled/,
  /fetchTvCatalog/,
  /HiddenTunesTvVideo/,
  /openTvDiscoveryStation/,
  /buildTvDiscoveryLaunchContext/,
  /queueVideos/,
  /services\/tv/i,
  /tvCatalogApi/,
];

for (const file of [...sportsRoots.flatMap(collectFiles), ...sportsFiles.flatMap(collectFiles)]) {
  const source = fs.readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    assert.equal(
      pattern.test(source),
      false,
      `${path.relative(root, file)} contains forbidden Sports-to-TV dependency ${pattern}`
    );
  }
}

const playerShell = fs.readFileSync(
  path.join(root, "components/sports/SportsPlayerShell.tsx"),
  "utf8"
);
assert.match(playerShell, /SportsNativeVideoSurface/);
assert.doesNotMatch(playerShell, /TvNativeVideoSurface|TvPlayerHost/);

console.log("Sports TV isolation contract: PASS");
