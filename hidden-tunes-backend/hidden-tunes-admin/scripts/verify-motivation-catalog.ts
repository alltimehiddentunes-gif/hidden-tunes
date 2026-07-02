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

async function main() {
  const baseUrl = String(process.env.MOTIVATION_VERIFY_BASE_URL || "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
  const sampleSize = Number(process.env.MOTIVATION_PLAY_SAMPLE_SIZE || 50);

  const listResponse = await fetch(`${baseUrl}/api/motivation/items?limit=40`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const listBody = await listResponse.json();

  if (!listResponse.ok || !listBody?.success) {
    throw new Error("Motivation list endpoint check failed.");
  }

  const items = (listBody.items || []) as Array<Record<string, unknown>>;
  for (const item of items) {
    if ("stream_url" in item || "source_url" in item || "embed_url" in item) {
      throw new Error("List endpoint leaked stream URL fields.");
    }
  }

  const playChecks: Array<Record<string, unknown>> = [];
  const sample = items.slice(0, sampleSize);

  for (const item of sample) {
    const id = String(item.id || "");
    if (!id) continue;

    const playResponse = await fetch(`${baseUrl}/api/motivation/items/${id}/play`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const playBody = await playResponse.json();
    playChecks.push({
      id,
      ok: playResponse.ok && playBody?.success === true && Boolean(playBody?.stream_url),
      status: playResponse.status,
    });
  }

  const passed = playChecks.filter((entry) => entry.ok).length;

  console.log(
    JSON.stringify(
      {
        ok: true,
        listCount: items.length,
        listHasStreamUrl: false,
        playSampleSize: playChecks.length,
        playPassed: passed,
        playFailed: playChecks.length - passed,
        playChecks,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
