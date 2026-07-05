import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env"));

async function main() {
  const { describeMaturePodcastSeedCatalog, ingestMaturePodcastSeedCatalog } =
    await import("../lib/podcastSeedIngest");

  console.log(
    JSON.stringify(
      {
        phase: "mature-catalog",
        catalog: describeMaturePodcastSeedCatalog(),
      },
      null,
      2
    )
  );

  const result = await ingestMaturePodcastSeedCatalog({
    auto_approve: true,
    max_episodes_per_feed: 40,
  });

  console.log(JSON.stringify({ phase: "result", result }, null, 2));

  if (result.feeds_errored > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
